import assert from "node:assert/strict";
import { test } from "node:test";
import { isAudioOnlyMp4, normalizeAudioMimeType, serializeChatAttachment, storedChatAttachment } from "../src/modules/chat-media/chat-media.service.js";

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

test("generic Android MP4 is accepted as audio only when it has an audio track and no video track", () => {
  const handler = (kind) => {
    const box = Buffer.alloc(24);
    box.writeUInt32BE(24, 0);
    box.write("hdlr", 4);
    box.write(kind, 16);
    return box;
  };
  const ftyp = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
  assert.equal(isAudioOnlyMp4(Buffer.concat([ftyp, handler("soun")])), true);
  assert.equal(isAudioOnlyMp4(Buffer.concat([ftyp, handler("soun"), handler("vide")])), false);
  assert.equal(isAudioOnlyMp4(Buffer.concat([ftyp, handler("vide")])), false);
  assert.equal(isAudioOnlyMp4(Buffer.from("not an mp4")), false);
  assert.equal(normalizeAudioMimeType("video/mp4", Buffer.concat([ftyp, handler("soun")])), "audio/mp4");
  assert.equal(normalizeAudioMimeType("video/3gpp", Buffer.concat([ftyp, handler("soun")])), "audio/3gpp");
  assert.equal(normalizeAudioMimeType("video/3gpp2", Buffer.concat([ftyp, handler("soun")])), "audio/3gpp2");
  assert.equal(normalizeAudioMimeType("video/3gpp", Buffer.concat([ftyp, handler("soun"), handler("vide")])), "video/3gpp");
});
