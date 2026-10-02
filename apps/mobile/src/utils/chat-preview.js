const attachmentLabels = {
  IMAGE: "Foto",
  VIDEO: "Vídeo",
  AUDIO: "Áudio",
  LOCATION: "Localização",
};

export function chatMessagePreview(message, fallback = "Conversa iniciada") {
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  if (message?.attachment) {
    const label = attachmentLabels[message.attachment.type] ?? "Anexo";
    return text ? `${label} · ${text}` : label;
  }
  return text || fallback;
}
