import { Router } from "express";

export function createPlaceholderRouter(resource) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      resource,
      status: "planned",
    });
  });

  return router;
}
