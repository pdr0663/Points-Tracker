import assert from "node:assert/strict";
import test from "node:test";
import {
  preferredAudioMimeType,
  startVoiceRecording,
  VoiceRecordingError,
  voiceRecordingSupported
} from "../public/js/voice.js";

class FakeMediaRecorder {
  static isTypeSupported(type) {
    return type === "audio/webm;codecs=opus";
  }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType ?? "";
    this.state = "inactive";
    this.listeners = new Map();
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.listeners.get("dataavailable")?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
    this.listeners.get("stop")?.();
  }
}

function fakeMicrophone() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track] };
  return { track, mediaDevices: { getUserMedia: async () => stream } };
}

test("voice support requires both microphone capture and MediaRecorder", () => {
  const { mediaDevices } = fakeMicrophone();
  assert.equal(voiceRecordingSupported({ mediaDevices, MediaRecorderClass: FakeMediaRecorder }), true);
  assert.equal(voiceRecordingSupported({ mediaDevices: {}, MediaRecorderClass: FakeMediaRecorder }), false);
  assert.equal(preferredAudioMimeType(FakeMediaRecorder), "audio/webm;codecs=opus");
});

test("push-to-record returns one audio blob and releases the microphone", async () => {
  const { mediaDevices, track } = fakeMicrophone();
  const recording = await startVoiceRecording({ mediaDevices, MediaRecorderClass: FakeMediaRecorder });
  assert.equal(recording.state, "recording");
  assert.equal(track.stopped, false);
  const audio = await recording.stop();
  assert.equal(await audio.text(), "voice");
  assert.equal(audio.type, "audio/webm");
  assert.equal(track.stopped, true);
});

test("microphone refusal becomes a safe voice error", async () => {
  const mediaDevices = { getUserMedia: async () => { throw new Error("denied"); } };
  await assert.rejects(
    startVoiceRecording({ mediaDevices, MediaRecorderClass: FakeMediaRecorder }),
    (error) => {
      assert.ok(error instanceof VoiceRecordingError);
      assert.equal(error.code, "MICROPHONE_UNAVAILABLE");
      assert.match(error.message, /permission/iu);
      return true;
    }
  );
});

test("cancelling an active recording immediately releases the microphone", async () => {
  const { mediaDevices, track } = fakeMicrophone();
  const recording = await startVoiceRecording({ mediaDevices, MediaRecorderClass: FakeMediaRecorder });
  recording.cancel();
  assert.equal(track.stopped, true);
  assert.equal(recording.state, "inactive");
});
