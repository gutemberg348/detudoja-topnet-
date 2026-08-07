import { env } from "../../config/env.js";
import {
  createStoreSignupQr,
  findStoreSignupSource,
  renderStoreSignupPage,
} from "./store-signup.service.js";

function publicApiBaseUrl(req) {
  return env.publicLinks.apiBaseUrl ?? `${req.protocol}://${req.get("host")}`;
}

export async function createStoreSignupQrController(req, res, next) {
  try {
    res.json(
      await createStoreSignupQr(
        req.auth.user.id,
        req.params.storeId,
        publicApiBaseUrl(req),
        env.publicLinks.appDownloadUrl,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function renderStoreSignupPageController(req, res, next) {
  try {
    const store = await findStoreSignupSource(undefined, req.params.storeSlug);
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; img-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    );
    res.type("html").send(
      renderStoreSignupPage({
        appDownloadUrl: env.publicLinks.appDownloadUrl,
        store,
      }),
    );
  } catch (error) {
    next(error);
  }
}
