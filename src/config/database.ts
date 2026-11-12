
import mongoose from "mongoose";
import { setServers } from "node:dns";

// Set custom DNS servers for Node.js
setServers(["1.1.1.1", "8.8.8.8"]);

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not defined in .env");
  }

  await mongoose.connect(uri);

  console.log("MongoDB connected successfully!");
}
