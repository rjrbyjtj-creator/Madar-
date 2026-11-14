import { User } from "../models/User.js";
import { hashPassword } from "../utils/security.js";
import { logger } from "../utils/logger.js";

/**
 * حساب پیش‌فرض مدیر — فقط اگر هنوز ادمینی در دیتابیس نباشد ساخته می‌شود.
 * ورود با ایمیل (type: id) از صفحه‌ی لاگین سایت.
 */
const ADMIN = {
  name: "مدیر ارشد",
  email: "admin@madar.ir",
  phone: "09000000001",
  password: "Madar@Admin1405",
  role: "admin" as const,
};

export async function seedDefaultAdmin(): Promise<void> {
  try {
    const existingAdmin = await User.findOne({ role: "admin" }).select("_id email").lean();
    if (existingAdmin) {
      logger.info({ email: existingAdmin.email }, "Admin account already exists — skip seed");
      return;
    }

    // اگر ایمیل قبلاً با نقش دیگری ثبت شده، نقش را به admin ارتقا بده
    const byEmail = await User.findOne({ email: ADMIN.email });
    if (byEmail) {
      byEmail.role = "admin";
      byEmail.isActive = true;
      byEmail.passwordHash = await hashPassword(ADMIN.password);
      byEmail.passwordChangedAt = new Date();
      await byEmail.save();
      logger.info({ email: ADMIN.email }, "Existing user promoted to admin and password reset");
      return;
    }

    await User.create({
      name: ADMIN.name,
      email: ADMIN.email,
      phone: ADMIN.phone,
      passwordHash: await hashPassword(ADMIN.password),
      role: ADMIN.role,
      isPhoneVerified: true,
      isTelegramVerified: true,
      isActive: true,
    });

    logger.info({ email: ADMIN.email }, "Default admin account created");
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : error },
      "Failed to seed default admin",
    );
  }
}
