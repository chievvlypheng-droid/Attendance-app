import { Router } from 'express';
import StudyPeriod from '../models/StudyPeriod.js';
import { HttpError, wrap, assertDate } from '../lib/http.js';
import { getPeriods } from '../lib/data.js';

const router = Router();

function readBody(body) {
  const from = assertDate(body.from, 'from');
  const to = assertDate(body.to, 'to');
  if (from > to) throw new HttpError(400, 'The start date must not be after the end date.');
  return { name: String(body.name || '').trim(), from, to };
}

router.get('/', wrap(async (req, res) => {
  res.json(await getPeriods());
}));

router.post('/', wrap(async (req, res) => {
  const p = await StudyPeriod.create(readBody(req.body));
  res.status(201).json({ id: String(p._id), name: p.name, from: p.from, to: p.to });
}));

router.put('/:id', wrap(async (req, res) => {
  const p = await StudyPeriod.findByIdAndUpdate(req.params.id, readBody(req.body), { new: true });
  if (!p) throw new HttpError(404, 'Study dates not found.');
  res.json({ id: String(p._id), name: p.name, from: p.from, to: p.to });
}));

router.delete('/:id', wrap(async (req, res) => {
  await StudyPeriod.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

export default router;
