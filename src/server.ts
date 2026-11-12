import type { Server } from "node:http";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { connectDB } from "./config/database.js";
import { env } from "./config/env.js";
import { startTelegramBot, stopTelegramBot } from "./services/telegram.service.js";
import { logger } from "./utils/logger.js";

let shuttingDown = false;

async function shutdown(signal: string, server: Server): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Shutting down...");

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  server.close();
  // long polling تا ۲۵ ثانیه معطل می‌ماند؛ بیشتر از ۳ ثانیه صبر نمی‌کنیم.
  await Promise.race([stopTelegramBot(), new Promise((resolve) => setTimeout(resolve, 3_000))]);
  await mongoose.connection.close();

  process.exit(0);
}

async function startServer(): Promise<void> {
  try {
    await connectDB();
    startTelegramBot();

    const server = createApp().listen(env.PORT, () => {
      logger.info(`Server running on http://localhost:${env.PORT}`);
    });

    process.on("SIGINT", () => void shutdown("SIGINT", server));
    process.on("SIGTERM", () => void shutdown("SIGTERM", server));
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

void startServer();