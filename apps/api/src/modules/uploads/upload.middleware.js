import multer from "multer";
import { AppError } from "../../utils/errors.js";

const storage = multer.memoryStorage();

function imageFileFilter(_req, file, callback) {
  if (!file.mimetype?.startsWith("image/")) {
    callback(new AppError("Envie apenas arquivos de imagem", 400));
    return;
  }

  callback(null, true);
}

function chatFileFilter(_req, file, callback) {
  if (!/^(image|video|audio)\//.test(file.mimetype ?? "")) {
    callback(new AppError("Envie uma foto, video ou audio valido", 400));
    return;
  }

  callback(null, true);
}

function createUpload(limits, fileFilter = imageFileFilter) {
  return multer({
    fileFilter,
    limits: {
      fileSize: 8 * 1024 * 1024,
      ...limits,
    },
    storage,
  });
}

export const uploadStoreMedia = createUpload({ files: 2 }).fields([
  { maxCount: 1, name: "logo" },
  { maxCount: 1, name: "banner" },
]);

export const uploadAdminCategoryIcon = createUpload({ files: 1 }).single("icon");

export const uploadStoreProductImage = createUpload({ files: 1 }).single("image");

export const uploadServiceChatImage = createUpload({ files: 1 }).single("image");

export const uploadChatAttachment = createUpload(
  { fileSize: 30 * 1024 * 1024, files: 1 },
  chatFileFilter,
).single("attachment");

export const uploadKycImages = createUpload({ files: 3 }).fields([
  { maxCount: 1, name: "documentFront" },
  { maxCount: 1, name: "documentBack" },
  { maxCount: 1, name: "selfie" },
]);

export function handleUpload(upload) {
  return (req, _res, next) => {
    upload(req, _res, (error) => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError) {
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? "Arquivo muito grande. Fotos e audios aceitam ate 10 MB; videos, ate 30 MB."
            : "Nao foi possivel receber o arquivo enviado.";
        next(new AppError(message, 400));
        return;
      }

      next(error);
    });
  };
}
