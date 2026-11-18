import { Router } from "express";
import { getAcademicHistory, saveAcademicHistory } from "../controllers/academic-history.controller.js";
import { requireAuth } from "../middlewares/auth.js";

export const academicHistoryRouter = Router();
academicHistoryRouter.use(requireAuth);
academicHistoryRouter.get("/", getAcademicHistory);
academicHistoryRouter.put("/", saveAcademicHistory);
