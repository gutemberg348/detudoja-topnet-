import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeChatAttachment, storedChatAttachment } from "../src/modules/chat-media/chat-media.service.js";

const audio = {
  durationMs: 2100,
  fileName: "audio.m4a",
  mimeType: "audio/mp4",
  size: 1024,
  storageKey: "personal/10/audio.m4a",
  type: "AUDIO",
};

test("chat media reads both wrapped and legacy flat attachment metadata", () => {
  assert.deepEqual(storedChatAttachment({ attachment: audio }), audio);
  assert.deepEqual(storedChatAttachment(audio), audio);
  assert.equal(storedChatAttachment(null), null);
});

test("chat media serializer keeps the authenticated download route", () => {
  const serialized = serializeChatAttachment({ id: 42 }, "personal", { attachment: audio });

  assert.equal(serialized.type, "AUDIO");
  assert.equal(serialized.mimeType, "audio/mp4");
  assert.equal(serialized.durationMs, 2100);
  assert.equal(serialized.url, "/api/app/chat-media/personal/42");
});
