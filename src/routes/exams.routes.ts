import { Router } from "express";
import {
  createExam,
  deleteExam,
  listAdminExams,
  listPublishedExams,
  publishExam,
  updateExam,
} from "../controllers/exams.controller.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";

export const examsRouter = Router();

examsRouter.get("/", requireAuth, listPublishedExams);
examsRouter.get("/admin", requireAuth, requireAdmin, listAdminExams);
examsRouter.post("/", requireAuth, requireAdmin, createExam);
examsRouter.patch("/:id", requireAuth, requireAdmin, updateExam);
examsRouter.post("/:id/publish", requireAuth, requireAdmin, publishExam);
examsRouter.delete("/:id", requireAuth, requireAdmin, deleteExam);
