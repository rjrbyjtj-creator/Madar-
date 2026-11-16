import { Router } from "express";
import { listStudyFiles, streamStudyFile } from "../controllers/study-files.controller.js";
import { requireAuth } from "../middlewares/auth.js";

export const studyFilesRouter = Router();
studyFilesRouter.use(requireAuth);
studyFilesRouter.get("/", listStudyFiles);
studyFilesRouter.get("/:id/content", streamStudyFile);
