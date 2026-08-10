import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(serverDirectory, "../public");
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

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

function resolvePublicPath(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const decodedPath = decodeURIComponent(url.pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const filePath = path.resolve(publicDirectory, relativePath);

  if (filePath !== publicDirectory && !filePath.startsWith(`${publicDirectory}${path.sep}`)) {
    return null;
  }

  return filePath;
}

const server = createServer(async (request, response) => {
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
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": fileStat.size,
      "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

server.listen(port, () => {
  console.log(`Points Tracker is available at http://localhost:${port}`);
});

