import { formatLongDate, MONTH_NAMES } from './calendar.js';
import { HttpError } from '../lib/http.js';

// First version of the default message (present / absent / permission lists).
// A saved settings document still holding exactly this text is upgraded to the new default.
const OLD_DEFAULT_TEMPLATE = `📋 Attendance Report
📅 Date: {{date}}
🏫 Class: {{class}}
👩‍🏫 Teacher: {{teacher}}

✅ Present ({{present_count}}):
{{present_list}}

❌ Absent ({{absent_count}}):
{{absent_list}}

📝 Permission ({{permission_count}}):
{{permission_list}}

👥 Total students: {{total}}`;

export const LEGACY_TEMPLATES = [OLD_DEFAULT_TEMPLATE];

// Absences only. Students with permission and present students are not listed.
export const DEFAULT_TEMPLATE = `Dear CP, and DCP
I would like to update the attendance for today's class:
Teacher's name: {{teacher}}
Date: {{day}}/{{month_short}}/ {{year}}
Shift: {{shift}}
Level: {{level}}
Total students: {{total}}
Absences: {{absent_count}}
{{absent_list}}
Please kindly note. Many thanks!`;

export const PLACEHOLDERS = [
  'date', 'day', 'month_short', 'year',
  'class', 'level', 'shift', 'teacher', 'school', 'total',
  'present_count', 'present_list',
  'absent_count', 'absent_list',
  'permission_count', 'permission_list',
  'unmarked_count', 'unmarked_list',
];

const numbered = (items, fmt) =>
  items.length ? items.map((s, i) => `${i + 1}.${fmt(s)}`).join('\n') : 'None';

export function renderTemplate(template, ctx) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in ctx ? String(ctx[key]) : match));
}

// students: [{name, status: 'P'|'A'|'PM'|null, reason}]
export function buildReport(settings, date, students) {
  const by = (code) => students.filter((s) => s.status === code);
  const present = by('P');
  const absent = by('A');
  const permission = by('PM');
  const unmarked = students.filter((s) => !s.status);

  const [year, month, day] = date.split('-');
  const ctx = {
    date: formatLongDate(date),
    day: Number(day), // 2
    month_short: MONTH_NAMES[Number(month) - 1].slice(0, 3), // Nov
    year,
    class: settings.className || '-',
    level: settings.className || '-',
    shift: settings.studyShift || '-',
    teacher: settings.teacherName || '-',
    school: settings.schoolName || '',
    total: students.length,
    present_count: present.length,
    present_list: numbered(present, (s) => s.name),
    absent_count: absent.length,
    absent_list: numbered(absent, (s) => s.name),
    permission_count: permission.length,
    permission_list: numbered(permission, (s) => (s.reason ? `${s.name} — ${s.reason}` : s.name)),
    unmarked_count: unmarked.length,
    unmarked_list: numbered(unmarked, (s) => s.name),
  };

  return {
    text: renderTemplate(settings.messageTemplate || DEFAULT_TEMPLATE, ctx),
    counts: {
      present: present.length,
      absent: absent.length,
      permission: permission.length,
      unmarked: unmarked.length,
      total: students.length,
    },
  };
}

export async function sendTelegram({ token, chatId, text }) {
  if (text.length > 4096) {
    throw new HttpError(400, 'Message is longer than Telegram allows (4096 characters). Shorten the template.');
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new HttpError(502, `Telegram error: ${data.description || res.statusText}`);
  }
}
