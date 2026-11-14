import { Router } from "express";
import { aiRouter } from "./ai.routes.js";
import { authRouter } from "./auth.routes.js";
import { themeRouter } from "./theme.routes.js";
import { userRouter } from "./user.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/ai", aiRouter);
/** تم‌های ظاهری سایت — GET /api/themes/active عمومی است */
apiRouter.use("/themes", themeRouter);
