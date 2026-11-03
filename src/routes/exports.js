import { Router } from 'express';
import { HttpError, wrap, getRange } from '../lib/http.js';
import { loadRange } from '../lib/data.js';
import { buildAttendanceWorkbook, buildPayrollWorkbook } from '../services/excel.js';

const router = Router();
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function send(res, wb, filename) {
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

async function prepare(query) {
  const { from, to } = getRange(query);
  const data = await loadRange(from, to);
  if (!data.students.length) throw new HttpError(400, 'No students yet. Add students first.');
  if (!data.workingDays.length) throw new HttpError(400, 'There are no school days in the selected range.');
  return { ...data, from, to };
}

// GET /api/export/attendance.xlsx?from=&to=   printable A4 sheet (one tab per month + Summary)
router.get('/attendance.xlsx', wrap(async (req, res) => {
  const d = await prepare(req.query);
  await send(res, buildAttendanceWorkbook(d), `attendance_${d.from}_to_${d.to}.xlsx`);
}));

// GET /api/export/payroll.xlsx?from=&to=
router.get('/payroll.xlsx', wrap(async (req, res) => {
  const d = await prepare(req.query);
  await send(res, buildPayrollWorkbook(d), `payroll_attendance_${d.from}_to_${d.to}.xlsx`);
}));

export default router;
