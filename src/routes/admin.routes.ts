import { Router } from "express";
import { User } from "../models/User.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";

export const adminRouter = Router();

/** GET /api/admin/stats — real counts from MongoDB; admin only. */
adminRouter.get("/stats", requireAuth, requireAdmin, async (_req, res) => {
  const [totalUsers, students, teachers, admins, activeUsers] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "teacher" }),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ isActive: true }),
  ]);

  res.json({
    ok: true,
    stats: { totalUsers, students, teachers, admins, activeUsers, schools: null, supportTickets: null },
    unavailable: {
      schools: "در نسخه فعلی بک‌اند، مدل یا مجموعه‌ای برای ثبت مدارس وجود ندارد.",
      supportTickets: "در نسخه فعلی بک‌اند، مدل یا مجموعه‌ای برای تیکت‌های پشتیبانی وجود ندارد.",
    },
    generatedAt: new Date().toISOString(),
  });
});
