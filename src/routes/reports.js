import { Router } from 'express';
import { HttpError, wrap, assertDate, getRange } from '../lib/http.js';
import { loadDay, loadRange } from '../lib/data.js';
import { buildReport, sendTelegram } from '../services/telegram.js';
import { buildSummary } from '../services/summary.js';
import { monthLabel } from '../services/calendar.js';

const router = Router();

// GET /api/reports/telegram?date=  -> generated message from the saved records
router.get('/telegram', wrap(async (req, res) => {
  const date = assertDate(req.query.date);
  const { settings, students } = await loadDay(date);
  res.json(buildReport(settings, date, students));
}));

// POST /api/reports/telegram/send  { date, text? }
// text lets you send the message after editing it by hand in the UI.
router.post('/telegram/send', wrap(async (req, res) => {
  const date = assertDate(req.body.date);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const { settings, students } = await loadDay(date);
  const chatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID;
  if (!token) throw new HttpError(400, 'TELEGRAM_BOT_TOKEN is not set in server/.env.');
  if (!chatId) throw new HttpError(400, 'Set the Telegram chat ID in Settings first.');

  const custom = typeof req.body.text === 'string' && req.body.text.trim();
  const text = custom || buildReport(settings, date, students).text;
  await sendTelegram({ token, chatId, text });
  res.json({ ok: true });
}));

// GET /api/reports/summary?from=&to=  -> per-student totals (used for the preview on the Export page)
router.get('/summary', wrap(async (req, res) => {
  const { from, to } = getRange(req.query);
  const { students, recordMap, workingDays } = await loadRange(from, to);
  const s = buildSummary({ students, recordMap, workingDays });
  res.json({
    scheduled: s.scheduled,
    months: s.months.map((m) => ({ month: m, label: monthLabel(m), scheduled: s.scheduledByMonth[m] })),
    rows: s.rows.map((r) => ({ id: r.id, name: r.name, code: r.code, ...r.total })),
  });
}));

export default router;
