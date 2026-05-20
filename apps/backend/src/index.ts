import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();

import authRoutes from "./routes/auth.js";
import walkthroughRoutes from "./routes/walkthroughs.js";
import { prisma } from "./lib/prisma.js";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ]
  })
);

app.options(/(.*)/, cors());

app.use(express.json());

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRoutes);

app.use("/walkthroughs", walkthroughRoutes);

const server = app.listen(3000, () => {
  console.log("Backend running on port 3000");
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log("Shutting down gracefully...");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("exit", () => {
  prisma.$disconnect().catch((e) => console.error(e));
});