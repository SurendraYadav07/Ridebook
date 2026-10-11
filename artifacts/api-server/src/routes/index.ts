import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import ridesRouter from "./rides";
import driversRouter from "./drivers";
import sharedRidesRouter from "./shared-rides";
import paymentsRouter from "./payments";
import mapsRouter from "./maps";
import safetyRouter from "./safety";
import supportRouter from "./support";
import adminRouter from "./admin";
import publicTrackingRouter from "./public-tracking";
import uploadsRouter from "./uploads";
import promosRouter from "./promos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(ridesRouter);
router.use(driversRouter);
router.use(sharedRidesRouter);
router.use(paymentsRouter);
router.use(mapsRouter);
router.use(safetyRouter);
router.use(supportRouter);
router.use(adminRouter);
router.use(publicTrackingRouter);
router.use(uploadsRouter);
router.use(promosRouter);

export default router;
