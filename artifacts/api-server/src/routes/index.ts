import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sourceTradieRouter from "./source-tradie";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sourceTradieRouter);

export default router;
