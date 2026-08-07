import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { uploadsBasePath, uploadsRoot } from "../../config/storage.js";
import { AppError } from "../../utils/errors.js";

const acceptedImageTypes = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const profiles = {
  categoryIcon: {
    background: { alpha: 0, b: 255, g: 255, r: 255 },
    fit: "contain",
    height: 512,
    quality: 82,
    width: 512,
  },
  product: {
    fit: "cover",
    height: 900,
    quality: 80,
    width: 900,
  },
  serviceChat: {
    fit: "inside",
    height: 1280,
    quality: 82,
    width: 1280,
  },
  storeBanner: {
    fit: "cover",
    height: 480,
    quality: 78,
    width: 1280,
  },
  storeLogo: {
    background: { alpha: 0, b: 255, g: 255, r: 255 },
    fit: "contain",
    height: 512,
    quality: 82,
    width: 512,
  },
};

function publicPathFromRelative(relativePath) {
  return `${uploadsBasePath}/${relativePath.split(path.sep).join("/")}`;
}

function resolvePublicUpload(publicPath = "") {
  if (typeof publicPath !== "string") {
    return null;
  }

  if (!publicPath.startsWith(`${uploadsBasePath}/`)) {
    return null;
  }

  const relativePath = publicPath.slice(uploadsBasePath.length).replace(/^\/+/, "");
  const absolutePath = path.resolve(uploadsRoot, relativePath);
  const rootPath = path.resolve(uploadsRoot);

  if (
    absolutePath !== rootPath &&
    !absolutePath.startsWith(`${rootPath}${path.sep}`)
  ) {
    return null;
  }

  return absolutePath;
}

export async function saveUploadedImage(file, { folder, profile }) {
  if (!file) {
    return null;
  }

  const imageProfile = profiles[profile];

  if (!imageProfile) {
    throw new AppError("Perfil de imagem invalido", 500);
  }

  const detectedType = await fileTypeFromBuffer(file.buffer);

  if (!detectedType || !acceptedImageTypes.has(detectedType.mime)) {
    throw new AppError("Imagem invalida. Use JPG, PNG, WEBP ou AVIF.", 400);
  }

  const relativeDirectory = path.join(...folder);
  const targetDirectory = path.resolve(uploadsRoot, relativeDirectory);
  const filename = `${randomUUID()}.webp`;
  const absolutePath = path.join(targetDirectory, filename);
  const relativePath = path.join(relativeDirectory, filename);

  await mkdir(targetDirectory, { recursive: true });

  await sharp(file.buffer, { failOn: "warning" })
    .rotate()
    .resize({
      background: imageProfile.background,
      fit: imageProfile.fit,
      height: imageProfile.height,
      position: "centre",
      width: imageProfile.width,
    })
    .webp({ effort: 4, quality: imageProfile.quality })
    .toFile(absolutePath);

  return {
    mimeType: "image/webp",
    path: absolutePath,
    size: file.size,
    url: publicPathFromRelative(relativePath),
  };
}

export async function deleteUploadedImage(publicPath) {
  const absolutePath = resolvePublicUpload(publicPath);

  if (!absolutePath) {
    return;
  }

  await rm(absolutePath, { force: true });
}
