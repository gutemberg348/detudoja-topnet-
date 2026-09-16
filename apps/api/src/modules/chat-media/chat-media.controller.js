import { getPrivateChatMedia } from "./chat-media.service.js";

export async function getPrivateChatMediaController(req, res, next) {
  try {
    const media = await getPrivateChatMedia(req.auth.user.id, req.params.scope, req.params.messageId);
    res.set({
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${String(media.fileName ?? "arquivo").replace(/[\"\r\n]/g, "")}"`,
      "Content-Type": media.mimeType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.sendFile(media.absolutePath);
  } catch (error) {
    next(error);
  }
}
