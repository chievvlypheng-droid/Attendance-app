// All dates are plain 'YYYY-MM-DD' strings so time zones never shift a day.

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const weekdayOf = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();

export function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function eachDate(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const inAnyPeriod = (date, periods) => periods.some((p) => date >= p.from && date <= p.to);

// overrides: Map(date -> {type:'holiday'|'working', note})   single-day exceptions, always win
// periods:   [{from, to}]  study date ranges set by the user. When there are any, a day outside
//            all of them is not a school day. With none, the weekly pattern applies all year.
export function dayInfo(date, overrides, workingWeekdays, periods = []) {
  const o = overrides.get(date);
  if (o) return { isWorking: o.type === 'working', source: 'override', type: o.type, note: o.note || '' };
  if (periods.length && !inAnyPeriod(date, periods)) {
    return { isWorking: false, source: 'outside', type: null, note: 'Outside study dates' };
  }
  return { isWorking: workingWeekdays.includes(weekdayOf(date)), source: 'weekly', type: null, note: '' };
}

export function workingDaysBetween(from, to, overrides, workingWeekdays, periods = []) {
  return eachDate(from, to).filter((d) => dayInfo(d, overrides, workingWeekdays, periods).isWorking);
}

export function formatLongDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${WEEKDAY_NAMES[weekdayOf(s)]}, ${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]} ${y}`;
}

// '2026-11' -> 'November 2026' (or 'Nov 2026' when short)
export function monthLabel(ym, short = false) {
  const [y, m] = ym.split('-').map(Number);
  const name = MONTH_NAMES[m - 1];
  return `${short ? name.slice(0, 3) : name} ${y}`;
}

const HOLIDAY_WORDS = ['holiday', 'off', 'closed', 'no', 'h'];
const WORKING_WORDS = ['working', 'work', 'school', 'on', 'yes', 'w'];

// Lines look like:  2026-11-09,holiday,Independence Day
// A line with only a date is treated as a holiday. A header line and # comments are skipped.
export function parseCalendarCsv(text) {
  const days = [];
  const errors = [];
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const [dateRaw, typeRaw, ...rest] = line.split(',');
    const date = dateRaw.trim();
    if (i === 0 && date.toLowerCase() === 'date') return;
    if (!isValidDate(date)) {
      errors.push(`Line ${i + 1}: invalid date "${date}"`);
      return;
    }
    const t = (typeRaw || 'holiday').trim().toLowerCase();
    let type = null;
    if (HOLIDAY_WORDS.includes(t)) type = 'holiday';
    else if (WORKING_WORDS.includes(t)) type = 'working';
    if (!type) {
      errors.push(`Line ${i + 1}: type must be holiday or working`);
      return;
    }
    days.push({ date, type, note: rest.join(',').trim() });
  });
  return { days, errors };
}
