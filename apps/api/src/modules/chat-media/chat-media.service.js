import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { prisma } from "../../config/prisma.js";
import { chatPrivateRoot } from "../../config/storage.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";

const attachmentKinds = new Set(["IMAGE", "VIDEO", "AUDIO", "LOCATION"]);
const acceptedImages = new Set(["image/avif", "image/jpeg", "image/png", "image/webp"]);
const acceptedVideos = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const acceptedAudio = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

function normalizedKind(value) {
  const kind = String(value ?? "").trim().toUpperCase();
  return attachmentKinds.has(kind) ? kind : null;
}

function safeStoragePath(storageKey) {
  if (!storageKey || typeof storageKey !== "string") return null;
  const root = path.resolve(chatPrivateRoot);
  const absolutePath = path.resolve(root, storageKey);
  if (absolutePath === root || !absolutePath.startsWith(`${root}${path.sep}`)) return null;
  return absolutePath;
}

export function serializeChatAttachment(message, scope, metadata = null) {
  const attachment = metadata?.attachment ?? metadata;
  if (!attachment?.type) return null;
  const type = normalizedKind(attachment.type);
  if (!type) return null;

  if (type === "LOCATION") {
    const latitude = Number(attachment.latitude);
    const longitude = Number(attachment.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      label: attachment.label || "Localizacao atual",
      latitude,
      longitude,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      type,
    };
  }

  return {
    durationMs: Number(attachment.durationMs ?? 0) || null,
    fileName: attachment.fileName ?? null,
    mimeType: attachment.mimeType ?? null,
    size: Number(attachment.size ?? 0) || null,
    type,
    url: `/api/app/chat-media/${scope}/${message.id}`,
  };
}

export async function savePrivateChatAttachment(file, data, { conversationId, scope }) {
  const type = normalizedKind(data.attachmentType);
  if (!type) return null;

  if (type === "LOCATION") {
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new AppError("Localizacao invalida", 400);
    }
    return {
      attachment: {
        label: String(data.locationLabel ?? "Localizacao atual").trim().slice(0, 120),
        latitude,
        longitude,
        type,
      },
    };
  }

  if (!file?.buffer) throw new AppError("Selecione o arquivo que deseja enviar", 400);
  const detected = await fileTypeFromBuffer(file.buffer);
  const mimeType = detected?.mime;
  const accepted = type === "IMAGE" ? acceptedImages : type === "VIDEO" ? acceptedVideos : acceptedAudio;
  if (!mimeType || !accepted.has(mimeType)) throw new AppError("Formato de arquivo nao aceito neste chat", 400);

  const sizeLimit = type === "VIDEO" ? 30 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > sizeLimit) throw new AppError(type === "VIDEO" ? "O video deve ter ate 30 MB" : "O arquivo deve ter ate 10 MB", 400);

  const relativeDirectory = path.join(scope, String(conversationId));
  const targetDirectory = path.resolve(chatPrivateRoot, relativeDirectory);
  await mkdir(targetDirectory, { recursive: true });

  const extension = type === "IMAGE" ? "webp" : detected.ext;
  const filename = `${randomUUID()}.${extension}`;
  const storageKey = path.join(relativeDirectory, filename);
  const absolutePath = safeStoragePath(storageKey);
  if (!absolutePath) throw new AppError("Destino privado de arquivo invalido", 500);

  if (type === "IMAGE") {
    await sharp(file.buffer, { failOn: "warning" })
      .rotate()
      .resize({ fit: "inside", height: 1600, width: 1600, withoutEnlargement: true })
      .webp({ effort: 4, quality: 82 })
      .toFile(absolutePath);
  } else {
    await writeFile(absolutePath, file.buffer, { flag: "wx" });
  }

  return {
    attachment: {
      durationMs: Math.max(0, Number(data.durationMs ?? 0)) || null,
      fileName: String(file.originalname ?? `arquivo.${extension}`).slice(0, 255),
      mimeType: type === "IMAGE" ? "image/webp" : mimeType,
      size: file.size,
      storageKey,
      type,
    },
  };
}

export async function deletePrivateChatAttachment(metadata) {
  const absolutePath = safeStoragePath(metadata?.attachment?.storageKey);
  if (absolutePath) await rm(absolutePath, { force: true });
}

function canAccessStore(store, userId) {
  return store?.lojista?.usuario_id === userId
    || store?.usuarios?.some((member) => member.usuario_id === userId && member.status === "ATIVO");
}

export async function getPrivateChatMedia(userId, rawScope, rawMessageId) {
  const scope = String(rawScope ?? "").toLowerCase();
  const messageId = parsePositiveId(rawMessageId, "Arquivo invalido");
  let message;
  let allowed = false;
  let metadata;

  if (scope === "personal") {
    message = await prisma.conversaPessoalMensagem.findUnique({
      include: { conversa: { select: { usuario_a_id: true, usuario_b_id: true } } },
      where: { id: messageId },
    });
    allowed = [message?.conversa?.usuario_a_id, message?.conversa?.usuario_b_id].includes(userId);
    metadata = message?.anexo_json;
  } else if (scope === "store") {
    message = await prisma.conversaLojaMensagem.findUnique({
      include: { conversa: { include: { loja: { include: { lojista: true, usuarios: true } } } } },
      where: { id: messageId },
    });
    allowed = message?.conversa?.cliente_usuario_id === userId || canAccessStore(message?.conversa?.loja, userId);
    metadata = message?.conteudo_json?.attachment;
  } else if (scope === "service") {
    message = await prisma.conversaServicoMensagem.findUnique({
      include: { conversa: { include: { vendedor: { select: { usuario_id: true } } } } },
      where: { id: messageId },
    });
    allowed = message?.conversa?.cliente_usuario_id === userId || message?.conversa?.vendedor?.usuario_id === userId;
    metadata = message?.anexo_json;
  } else if (scope === "order") {
    message = await prisma.pedidoLojaMensagem.findUnique({
      include: { pedido: { include: { loja: { include: { lojista: true, usuarios: true } } } } },
      where: { id: messageId },
    });
    allowed = message?.pedido?.usuario_id === userId || canAccessStore(message?.pedido?.loja, userId);
    metadata = message?.metadata_json?.attachment;
  } else {
    throw new AppError("Tipo de conversa invalido", 404);
  }

  if (!message) throw new AppError("Arquivo nao encontrado", 404);
  if (!allowed) throw new AppError("Voce nao pode acessar este arquivo", 403);
  const absolutePath = safeStoragePath(metadata?.storageKey);
  if (!absolutePath) throw new AppError("Arquivo nao encontrado", 404);
  return { absolutePath, fileName: metadata.fileName, mimeType: metadata.mimeType };
}
