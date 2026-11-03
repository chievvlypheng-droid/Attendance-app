import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // YYYY-MM-DD
    status: { type: String, enum: ["P", "A", "PM"], required: true },
    reason: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

// one record per student per day, enforced by the database
attendanceSchema.index({ date: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema);
