import { AppError } from "./errors.js";

export function parsePositiveId(value, message = "ID invalido") {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(message, 400);
  }

  return id;
}
