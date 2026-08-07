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

function createUpload(limits) {
  return multer({
    fileFilter: imageFileFilter,
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
            ? "Imagem muito grande. Envie uma imagem de ate 8 MB."
            : "Nao foi possivel receber a imagem enviada.";
        next(new AppError(message, 400));
        return;
      }

      next(error);
    });
  };
}
