import { getSupportSettings } from "../settings/system-settings.service.js";

export async function getSupportSettingsController(_req, res, next) {
  try {
    res.json(await getSupportSettings());
  } catch (error) {
    next(error);
  }
}
