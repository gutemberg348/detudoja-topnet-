import {
  completeExternalDeliveryOrderWithCode,
} from "./orders.service.js";
import {
  previewExternalDelivery,
  renderExternalDeliveryPage,
} from "./external-delivery.service.js";

export function renderExternalDeliveryPageController(req, res, next) {
  try {
    res.set({
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    });
    res.type("html").send(renderExternalDeliveryPage(req.params.orderId));
  } catch (error) {
    next(error);
  }
}

export async function previewExternalDeliveryController(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await previewExternalDelivery(req.params.orderId, req.body.token));
  } catch (error) {
    next(error);
  }
}

export async function completeExternalDeliveryController(req, res, next) {
  try {
    await completeExternalDeliveryOrderWithCode(req.params.orderId, req.body.token, req.body.code);
    res.set("Cache-Control", "no-store");
    res.json({ completed: true });
  } catch (error) {
    next(error);
  }
}
