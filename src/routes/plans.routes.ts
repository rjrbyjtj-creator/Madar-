import { Router } from "express";
import { listStudentPlans, saveStudentPlan } from "../controllers/plans.controller.js";
import { requireAuth } from "../middlewares/auth.js";
export const plansRouter = Router();
plansRouter.use(requireAuth);
plansRouter.get("/", listStudentPlans);
plansRouter.put("/:date", saveStudentPlan);
