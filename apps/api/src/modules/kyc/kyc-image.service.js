import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { kycPrivateRoot } from "../../config/storage.js";
import { AppError } from "../../utils/errors.js";

const acceptedTypes = new Set([
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const maxInputPixels = 25_000_000;

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export async function prepareKycImage(file, kind) {
  if (!file?.buffer) {
    throw new AppError("Envie todas as fotos obrigatorias", 400);
  }

  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !acceptedTypes.has(detected.mime)) {
    throw new AppError("Imagem invalida. Use uma foto JPG, PNG, WEBP ou HEIC.", 400);
  }

  let normalized;
  try {
    normalized = await sharp(file.buffer, { failOn: "error", limitInputPixels: maxInputPixels })
      .rotate()
      .resize({ fit: "inside", height: 1800, withoutEnlargement: true, width: 1800 })
      .flatten({ background: "white" })
      .jpeg({ chromaSubsampling: "4:4:4", quality: 88 })
      .toBuffer();
  } catch {
    throw new AppError("Nao foi possivel ler uma das fotos enviadas", 400);
  }

  const image = sharp(normalized, { limitInputPixels: maxInputPixels });
  const [metadata, statistics] = await Promise.all([image.metadata(), image.stats()]);
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const minimum = kind === "SELFIE" ? { long: 600, short: 480 } : { long: 640, short: 360 };

  if (longSide < minimum.long || shortSide < minimum.short) {
    throw new AppError(
      kind === "SELFIE"
        ? "A selfie esta pequena demais. Tire outra foto mais proxima e nitida."
        : "A foto do documento esta pequena demais. Aproxime a camera e tente novamente.",
      400,
    );
  }

  const visibleChannels = statistics.channels.slice(0, 3);
  const brightness = round(average(visibleChannels.map((channel) => channel.mean)));
  const contrast = round(average(visibleChannels.map((channel) => channel.stdev)));
  const warnings = [];

  if (brightness < 42) warnings.push("FOTO_ESCURA");
  if (brightness > 235) warnings.push("FOTO_CLARA_DEMAIS");
  if (contrast < 14) warnings.push("BAIXO_CONTRASTE");

  return {
    buffer: normalized,
    brightness,
    contrast,
    hash: createHash("sha256").update(normalized).digest("hex"),
    height,
    kind,
    mimeType: "image/jpeg",
    size: normalized.length,
    warnings,
    width,
  };
}

export async function savePreparedKycImages(images) {
  const folder = randomUUID();
  const directory = path.join(kycPrivateRoot, folder);
  await mkdir(directory, { recursive: true });

  try {
    const stored = [];
    for (const image of images) {
      const filename = `${image.kind.toLowerCase()}-${randomUUID()}.jpg`;
      const relativePath = path.join(folder, filename);
      await writeFile(path.join(kycPrivateRoot, relativePath), image.buffer, { flag: "wx" });
      stored.push({ ...image, buffer: undefined, relativePath });
    }
    return { directory, files: stored };
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw error;
  }
}

export async function removeKycDirectory(directory) {
  if (directory) await rm(directory, { force: true, recursive: true });
}

export async function readPrivateKycFile(relativePath) {
  const root = path.resolve(kycPrivateRoot);
  const absolutePath = path.resolve(root, relativePath);
  if (absolutePath === root || !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new AppError("Arquivo KYC invalido", 400);
  }

  try {
    return await readFile(absolutePath);
  } catch {
    throw new AppError("Arquivo KYC nao encontrado", 404);
  }
}
