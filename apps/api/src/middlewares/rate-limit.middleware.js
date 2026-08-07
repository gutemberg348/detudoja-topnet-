import rateLimit from "express-rate-limit";

export const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
});

export const registerRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
});
