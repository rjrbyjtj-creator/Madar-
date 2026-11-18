import { Router } from "express";
import { aiRouter } from "./ai.routes.js";
import { adminRouter } from "./admin.routes.js";
import { authRouter } from "./auth.routes.js";
import { themeRouter } from "./theme.routes.js";
import { userRouter } from "./user.routes.js";
import { plansRouter } from "./plans.routes.js";
import { articlesRouter } from "./articles.routes.js";
import { studyFilesRouter } from "./study-files.routes.js";
import { examsRouter } from "./exams.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/plans", plansRouter);
apiRouter.use("/exams", examsRouter);
apiRouter.use("/articles", articlesRouter);
apiRouter.use("/study-files", studyFilesRouter);
apiRouter.use("/ai", aiRouter);
/** Theme API — mounted under /api/themes; /active is public, management routes require admin. */
apiRouter.use("/themes", themeRouter);
