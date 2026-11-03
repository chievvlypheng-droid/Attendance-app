import { Router } from 'express';
import Settings from '../models/Settings.js';
import { HttpError, wrap } from '../lib/http.js';
import { getSettings } from '../lib/data.js';
import { DEFAULT_TEMPLATE, PLACEHOLDERS } from '../services/telegram.js';
import { normalizeSex } from '../services/studentImport.js';

const router = Router();

// "|| ''" because a settings document saved by an older version may lack the newer fields
const shape = (s) => ({
  schoolName: s.schoolName || '',
  className: s.className || '',
  teacherName: s.teacherName || '',
  teacherSex: s.teacherSex || '',
  teacherPhone: s.teacherPhone || '',
  roomNumber: s.roomNumber || '',
  studyShift: s.studyShift || '',
  workingWeekdays: s.workingWeekdays,
  messageTemplate: s.messageTemplate,
  telegramChatId: s.telegramChatId || '',
  defaultTemplate: DEFAULT_TEMPLATE,
  placeholders: PLACEHOLDERS,
  telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
});

router.get('/', wrap(async (req, res) => {
  res.json(shape(await getSettings()));
}));

router.put('/', wrap(async (req, res) => {
  const update = {};
  for (const key of ['schoolName', 'className', 'teacherName', 'teacherPhone', 'roomNumber', 'studyShift', 'telegramChatId']) {
    if (req.body[key] !== undefined) update[key] = String(req.body[key]).trim();
  }
  if (req.body.teacherSex !== undefined) update.teacherSex = normalizeSex(req.body.teacherSex);
  if (req.body.messageTemplate !== undefined) {
    const t = String(req.body.messageTemplate);
    if (!t.trim()) throw new HttpError(400, 'Message template cannot be empty.');
    update.messageTemplate = t;
  }
  if (req.body.workingWeekdays !== undefined) {
    const w = req.body.workingWeekdays;
    if (!Array.isArray(w) || w.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) {
      throw new HttpError(400, 'workingWeekdays must be numbers 0-6 (0 = Sunday).');
    }
    update.workingWeekdays = [...new Set(w)].sort();
  }
  await getSettings(); // make sure the document exists
  const s = await Settings.findOneAndUpdate({ key: 'main' }, update, { new: true }).lean();
  res.json(shape(s));
}));

export default router;
