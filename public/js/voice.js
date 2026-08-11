export class VoiceRecordingError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "VoiceRecordingError";
    this.code = code;
  }
}

export function voiceRecordingSupported(options = {}) {
  const mediaDevices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
  const MediaRecorderClass = options.MediaRecorderClass ?? globalThis.MediaRecorder;
  return typeof mediaDevices?.getUserMedia === "function" && typeof MediaRecorderClass === "function";
}

export function preferredAudioMimeType(MediaRecorderClass = globalThis.MediaRecorder) {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorderClass?.isTypeSupported !== "function") return "";
  return candidates.find((type) => MediaRecorderClass.isTypeSupported(type)) ?? "";
}

function stopTracks(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export async function startVoiceRecording(options = {}) {
  const mediaDevices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
  const MediaRecorderClass = options.MediaRecorderClass ?? globalThis.MediaRecorder;
  if (!voiceRecordingSupported({ mediaDevices, MediaRecorderClass })) {
    throw new VoiceRecordingError("VOICE_UNSUPPORTED", "Voice recording is not supported by this browser.");
  }

  let stream;
  try {
    stream = await mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw new VoiceRecordingError(
      "MICROPHONE_UNAVAILABLE",
      "The microphone could not be opened. Check this site's microphone permission and try again.",
      { cause: error }
    );
  }

  const requestedType = preferredAudioMimeType(MediaRecorderClass);
  let recorder;
  try {
    recorder = requestedType
      ? new MediaRecorderClass(stream, { mimeType: requestedType })
      : new MediaRecorderClass(stream);
  } catch (error) {
    stopTracks(stream);
    throw new VoiceRecordingError("VOICE_UNSUPPORTED", "This browser could not start an audio recording.", { cause: error });
  }

  const chunks = [];
  let cancelled = false;
  let settled = false;
  let resolveCompletion;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    stopTracks(stream);
    callback(value);
  };
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data?.size) chunks.push(event.data);
  });
  recorder.addEventListener("error", (event) => {
    finish(rejectCompletion, new VoiceRecordingError("RECORDING_FAILED", "The recording failed. Please try again.", { cause: event.error }));
  });
  recorder.addEventListener("stop", () => {
    if (cancelled) {
      finish(rejectCompletion, new VoiceRecordingError("RECORDING_CANCELLED", "Recording cancelled."));
      return;
    }
    const type = recorder.mimeType || requestedType || chunks[0]?.type || "audio/webm";
    const audio = new Blob(chunks, { type: type.split(";")[0] });
    if (!audio.size) {
      finish(rejectCompletion, new VoiceRecordingError("EMPTY_RECORDING", "No audio was captured. Please try again."));
      return;
    }
    finish(resolveCompletion, audio);
  });

  try {
    recorder.start();
  } catch (error) {
    stopTracks(stream);
    throw new VoiceRecordingError("RECORDING_FAILED", "The recording could not be started. Please try again.", { cause: error });
  }

  return Object.freeze({
    get state() { return recorder.state; },
    stop() {
      if (recorder.state === "recording" || recorder.state === "paused") recorder.stop();
      return completion;
    },
    cancel() {
      cancelled = true;
      if (recorder.state === "recording" || recorder.state === "paused") recorder.stop();
      else finish(rejectCompletion, new VoiceRecordingError("RECORDING_CANCELLED", "Recording cancelled."));
      completion.catch(() => {});
      stopTracks(stream);
    }
  });
}
