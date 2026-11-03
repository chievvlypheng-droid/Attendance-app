import { Router } from 'express';
import CalendarDay from '../models/CalendarDay.js';
import { HttpError, wrap, assertDate, getRange } from '../lib/http.js';
import { getSettings, getPeriods } from '../lib/data.js';
import { dayInfo, eachDate, weekdayOf, parseCalendarCsv } from '../services/calendar.js';

const router = Router();
const TYPES = ['holiday', 'working'];

// GET /api/calendar?from=&to=  -> every date with isWorking, so the UI can draw a month
router.get('/', wrap(async (req, res) => {
  const { from, to } = getRange(req.query);
  const settings = await getSettings();
  const periods = await getPeriods();
  const overrides = new Map(
    (await CalendarDay.find({ date: { $gte: from, $lte: to } }).lean()).map((d) => [d.date, d]),
  );
  res.json(
    eachDate(from, to).map((date) => ({
      date,
      weekday: weekdayOf(date),
      ...dayInfo(date, overrides, settings.workingWeekdays, periods),
    })),
  );
}));

// PUT /api/calendar/:date  { type: 'holiday'|'working', note }
// If the result equals what the weekly pattern and study dates already give (and has no note),
// the exception is removed.
router.put('/:date', wrap(async (req, res) => {
  const date = assertDate(req.params.date);
  const { type } = req.body;
  const note = String(req.body.note || '').trim();
  if (!TYPES.includes(type)) throw new HttpError(400, 'type must be "holiday" or "working".');

  const settings = await getSettings();
  const usual = dayInfo(date, new Map(), settings.workingWeekdays, await getPeriods());
  const normal = usual.isWorking ? 'working' : 'holiday';
  if (type === normal && !note) {
    await CalendarDay.deleteOne({ date });
  } else {
    await CalendarDay.findOneAndUpdate({ date }, { type, note }, { upsert: true });
  }
  res.json({ date, type, note });
}));

router.delete('/:date', wrap(async (req, res) => {
  await CalendarDay.deleteOne({ date: assertDate(req.params.date) });
  res.json({ ok: true });
}));

// POST /api/calendar/range  { from, to, type, note }  e.g. a school break
router.post('/range', wrap(async (req, res) => {
  const { from, to } = getRange(req.body);
  const { type } = req.body;
  const note = String(req.body.note || '').trim();
  if (!TYPES.includes(type)) throw new HttpError(400, 'type must be "holiday" or "working".');
  const ops = eachDate(from, to).map((date) => ({
    updateOne: { filter: { date }, update: { $set: { type, note } }, upsert: true },
  }));
  await CalendarDay.bulkWrite(ops);
  res.json({ updated: ops.length });
}));

// POST /api/calendar/import  { csv }   lines: date,type,note   (type defaults to holiday)
router.post('/import', wrap(async (req, res) => {
  const { days, errors } = parseCalendarCsv(req.body.csv);
  if (days.length) {
    await CalendarDay.bulkWrite(
      days.map((d) => ({
        updateOne: { filter: { date: d.date }, update: { $set: { type: d.type, note: d.note } }, upsert: true },
      })),
    );
  }
  res.json({ imported: days.length, errors });
}));

export default router;
