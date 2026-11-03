import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { errorHandler } from "./lib/http.js";
import students from "./routes/students.js";
import attendance from "./routes/attendance.js";
import calendar from "./routes/calendar.js";
import periods from "./routes/periods.js";
import settings from "./routes/settings.js";
import reports from "./routes/reports.js";
import exportsRouter from "./routes/exports.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({ message: "Backend is running!" });
});

app.use("/api/students", students);
app.use("/api/attendance", attendance);
app.use("/api/calendar", calendar);
app.use("/api/periods", periods);
app.use("/api/settings", settings);
app.use("/api/reports", reports);
app.use("/api/export", exportsRouter);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// In production, serve the built React app from the same server
const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist",
);
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use(
  cors({
    origin: "https://attandence-app-frontend-pl7jffx66-my-solo.vercel.app",
    credentials: true,
  }),
);

app.use(errorHandler);

const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/attendance";

mongoose
  .connect(uri)
  .then(() =>
    app.listen(port, () =>
      console.log(`Attendance server on http://localhost:${port}`),
    ),
  )
  .catch((err) => {
    console.error("Could not connect to MongoDB:", err.message);
    process.exit(1);
  });
