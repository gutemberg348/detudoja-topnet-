import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
const repoRoot = path.resolve(apiRoot, "../..");

export const uploadsBasePath = "/uploads";

export const uploadsRoot = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(repoRoot, "storage", "uploads");

export const kycPrivateRoot = process.env.KYC_PRIVATE_DIR
  ? path.resolve(process.env.KYC_PRIVATE_DIR)
  : path.resolve(repoRoot, "storage", "private", "kyc");
