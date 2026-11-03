import { Router } from 'express';
import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';
import { HttpError, wrap, assertDate } from '../lib/http.js';
import { loadDay } from '../lib/data.js';

const router = Router();

// GET /api/attendance?date=YYYY-MM-DD
router.get('/', wrap(async (req, res) => {
  const date = assertDate(req.query.date);
  const { info, students } = await loadDay(date);
  res.json({ date, isWorkingDay: info.isWorking, note: info.note, students });
}));

// PUT /api/attendance  { date, records: [{ student, status: 'P'|'A'|'PM'|null, reason }] }
// Upserts on (student, date) so a day can be re-saved to fix mistakes and never duplicates.
// status null/'' clears that student's record for the day.
router.put('/', wrap(async (req, res) => {
  const date = assertDate(req.body.date);
  const records = req.body.records;
  if (!Array.isArray(records)) throw new HttpError(400, '"records" must be an array.');

  const { info } = await loadDay(date);
  if (!info.isWorking) {
    throw new HttpError(400, `${date} is not a school day. Change it in the Calendar first.`);
  }

  const ids = records.map((r) => r.student);
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw new HttpError(400, 'Invalid student id.');
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'A student appears twice in this request.');
  const known = await Student.countDocuments({ _id: { $in: ids } });
  if (known !== ids.length) throw new HttpError(400, 'Unknown student in request.');

  const ops = [];
  for (const r of records) {
    if (!r.status) {
      ops.push({ deleteOne: { filter: { student: r.student, date } } });
      continue;
    }
    if (!['P', 'A', 'PM'].includes(r.status)) throw new HttpError(400, `Invalid status "${r.status}".`);
    const reason = r.status === 'PM' ? String(r.reason || '').trim() : '';
    if (r.status === 'PM' && !reason) throw new HttpError(400, 'A reason is required for Permission.');
    ops.push({
      updateOne: {
        filter: { student: r.student, date },
        update: { $set: { status: r.status, reason } },
        upsert: true,
      },
    });
  }
  if (ops.length) await Attendance.bulkWrite(ops);
  res.json({ date, saved: ops.length });
}));

export default router;
