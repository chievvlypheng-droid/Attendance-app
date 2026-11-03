import { isValidDate, eachDate } from '../services/calendar.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// lets async route handlers throw without try/catch
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === 11000) return res.status(409).json({ error: 'Duplicate record' });
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error' });
}

export function assertDate(date, label = 'date') {
  if (!isValidDate(date)) throw new HttpError(400, `Invalid ${label}. Use YYYY-MM-DD.`);
  return date;
}

export function getRange(query) {
  const { from, to } = query;
  assertDate(from, 'from');
  assertDate(to, 'to');
  if (from > to) throw new HttpError(400, '"from" must not be after "to".');
  if (eachDate(from, to).length > 366) throw new HttpError(400, 'Range is limited to 366 days.');
  return { from, to };
}
