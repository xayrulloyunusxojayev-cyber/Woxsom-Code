import { Router, type IRouter } from "express";
import healthRouter from "./health";
import keysRouter from "./keys";
import sessionsRouter from "./sessions";
import downloadRouter from "./download";
import modelsRouter from "./models";
import githubRouter from "./github";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(keysRouter);
router.use(sessionsRouter);
router.use(downloadRouter);
router.use(modelsRouter);
router.use(githubRouter);
router.use(adminRouter);

export default router;
