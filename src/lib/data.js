import Student from "../models/Student.js";
import Attendance from "../models/Attendance.js";
import CalendarDay from "../models/CalendarDay.js";
import Settings from "../models/Settings.js";
import StudyPeriod from "../models/StudyPeriod.js";
import { dayInfo, workingDaysBetween } from "../services/calendar.js";
import { DEFAULT_TEMPLATE, LEGACY_TEMPLATES } from "../services/telegram.js";

const byName = (a, b) => a.name.localeCompare(b.name);

export async function getSettings() {
  const s = await Settings.findOneAndUpdate(
    { key: "main" },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  // the message was never customised -> move it to the current default wording
  if (LEGACY_TEMPLATES.includes(s.messageTemplate)) {
    s.messageTemplate = DEFAULT_TEMPLATE;
    await Settings.updateOne(
      { key: "main" },
      { messageTemplate: DEFAULT_TEMPLATE },
    );
  }
  return s;
}

// Study date ranges the user set in the Calendar, oldest first
export async function getPeriods() {
  const list = await StudyPeriod.find().sort({ from: 1 }).lean();
  return list.map((p) => ({
    id: String(p._id),
    name: p.name || "",
    from: p.from,
    to: p.to,
  }));
}

// One day: calendar info + every student with their status for that date
export async function loadDay(date) {
  const settings = await getSettings();
  const override = await CalendarDay.findOne({ date }).lean();
  const info = dayInfo(
    date,
    new Map(override ? [[date, override]] : []),
    settings.workingWeekdays,
    await getPeriods(),
  );
  const records = await Attendance.find({ date }).lean();
  const byStudent = new Map(records.map((r) => [String(r.student), r]));

  const students = (await Student.find().lean())
    .filter((s) => s.active || byStudent.has(String(s._id)))
    .map((s) => {
      const rec = byStudent.get(String(s._id));
      return {
        id: String(s._id),
        name: s.name,
        code: s.studentCode || "",
        status: rec ? rec.status : null,
        reason: rec ? rec.reason : "",
      };
    });

  return { settings, info, students };
}

// A date range: working days + all records, for Excel / payroll / summary
export async function loadRange(from, to) {
  const settings = await getSettings();
  const overrides = new Map(
    (await CalendarDay.find({ date: { $gte: from, $lte: to } }).lean()).map(
      (d) => [d.date, d],
    ),
  );
  const workingDays = workingDaysBetween(
    from,
    to,
    overrides,
    settings.workingWeekdays,
    await getPeriods(),
  );

  const recordMap = new Map();
  for (const r of await Attendance.find({
    date: { $gte: from, $lte: to },
  }).lean()) {
    const id = String(r.student);
    if (!recordMap.has(id)) recordMap.set(id, new Map());
    recordMap.get(id).set(r.date, { status: r.status, reason: r.reason });
  }

  const students = (await Student.find().lean())
    .filter((s) => s.active || recordMap.has(String(s._id)))
    .map((s) => ({
      id: String(s._id),
      name: s.name,
      code: s.studentCode || "",
      sex: s.sex || "",
      phone: s.phone || "",
    }));

  return { settings, workingDays, recordMap, students };
}
