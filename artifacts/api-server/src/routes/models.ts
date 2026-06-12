import { Router, type IRouter } from "express";
import { MODELS } from "../lib/models";

const router: IRouter = Router();

router.get("/models", async (_req, res): Promise<void> => {
  res.json(MODELS);
});

export default router;
