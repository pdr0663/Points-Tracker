import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConfig, loadLocalEnv } from "./config.js";
import { createOpenAIService } from "./openai.js";
import { AppError, validateTextRequest } from "./validation.js";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(serverDirectory, "../public");
const currentFile = fileURLToPath(import.meta.url);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
]);

const acceptedImages = new Set(["image/jpeg", "image/png", "image/webp"]);
const acceptedAudio = new Set(["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm", "audio/x-m4a"]);

function resolvePublicPath(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const decodedPath = decodeURIComponent(url.pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const filePath = path.resolve(publicDirectory, relativePath);
  if (filePath !== publicDirectory && !filePath.startsWith(`${publicDirectory}${path.sep}`)) return null;
  return filePath;
}

function corsHeaders(request, config) {
  const origin = request.headers.origin;
  if (!config.allowedOrigin || origin !== config.allowedOrigin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-File-Name",
    Vary: "Origin"
  };
}

function sendJson(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  response.end(body);
}

function sendError(response, error, headers) {
  const known = error instanceof AppError;
  if (!known) console.error("Unhandled server error", error);
  sendJson(response, known ? error.status : 500, {
    error: {
      code: known ? error.code : "AI_REQUEST_FAILED",
      message: known ? error.message : "The request could not be completed."
    }
  }, headers);
}

async function readBody(request, limit) {
  const declaredLength = Number.parseInt(request.headers["content-length"] ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new AppError("VALIDATION_ERROR", "Request body is too large.", 413);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > limit) throw new AppError("VALIDATION_ERROR", "Request body is too large.", 413);
    chunks.push(chunk);
  }
  if (total === 0) throw new AppError("VALIDATION_ERROR", "Request body is empty.");
  return Buffer.concat(chunks);
}

async function readJson(request, limit) {
  const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new AppError("VALIDATION_ERROR", "Content-Type must be application/json.", 415);
  try {
    return JSON.parse((await readBody(request, limit)).toString("utf8"));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION_ERROR", "Request body is not valid JSON.");
  }
}

async function readUpload(request, limit, accepted, label) {
  const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
  if (!contentType || !accepted.has(contentType)) {
    throw new AppError("VALIDATION_ERROR", `Content-Type must identify a supported ${label} file.`, 415);
  }
  return { data: await readBody(request, limit), contentType };
}

async function handleApi(request, response, pathname, config, ai) {
  const headers = corsHeaders(request, config);
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && pathname === "/api/health") {
      sendJson(response, 200, { ok: true, ai: { configured: ai.configured } }, headers);
      return;
    }
    if (request.method === "POST" && pathname === "/api/interpret-meal") {
      const text = validateTextRequest(await readJson(request, config.limits.json));
      sendJson(response, 200, await ai.interpretMeal(text), headers);
      return;
    }
    if (request.method === "POST" && pathname === "/api/interpret-recipe") {
      const text = validateTextRequest(await readJson(request, config.limits.json));
      sendJson(response, 200, await ai.interpretRecipe(text), headers);
      return;
    }
    if (request.method === "POST" && pathname === "/api/transcribe") {
      const upload = await readUpload(request, config.limits.audio, acceptedAudio, "audio");
      sendJson(response, 200, await ai.transcribe(upload.data, upload.contentType), headers);
      return;
    }
    if (request.method === "POST" && pathname === "/api/scan-label") {
      const upload = await readUpload(request, config.limits.image, acceptedImages, "image");
      sendJson(response, 200, await ai.scanLabel(upload.data, upload.contentType), headers);
      return;
    }
    if (["/api/health", "/api/interpret-meal", "/api/interpret-recipe", "/api/transcribe", "/api/scan-label"].includes(pathname)) {
      throw new AppError("VALIDATION_ERROR", "Method not allowed.", 405);
    }
    throw new AppError("VALIDATION_ERROR", "API endpoint not found.", 404);
  } catch (error) {
    sendError(response, error, headers);
  }
}

async function handleStatic(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }
  let filePath;
  try {
    filePath = resolvePublicPath(request.url ?? "/");
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": fileStat.size,
      "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

export function createAppServer(options = {}) {
  const config = options.config ?? createConfig();
  const ai = options.ai ?? createOpenAIService(config);
  return createServer(async (request, response) => {
    response.on("error", (error) => console.error("Response error", error));
    let pathname;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }
    if (pathname.startsWith("/api/")) await handleApi(request, response, pathname, config, ai);
    else await handleStatic(request, response);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  loadLocalEnv(path.resolve(serverDirectory, "../.env"));
  const config = createConfig();
  const server = createAppServer({ config });
  server.listen(config.port, () => {
    console.log(`Points Tracker is available at http://localhost:${config.port}`);
    console.log(`AI assistance is ${config.apiKey ? "configured" : "not configured"}.`);
  });
}
