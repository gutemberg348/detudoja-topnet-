export function safeRequestPath(path) {
  return String(path ?? "").replace(/(\/sicredi\/pix\/)[^/]+/g, "$1[redacted]");
}
