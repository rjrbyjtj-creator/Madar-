import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { renderPhysicsDiagramRequest } from "../controllers/physics-diagram.controller.js";

export const physicsDiagramRouter = Router();

physicsDiagramRouter.post("/render", requireAuth, renderPhysicsDiagramRequest);
