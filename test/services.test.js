import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  isValidDate, weekdayOf, workingDaysBetween, parseCalendarCsv, formatLongDate, dayInfo,
} from '../src/services/calendar.js';
import { buildSummary } from '../src/services/summary.js';
import { buildReport, DEFAULT_TEMPLATE, renderTemplate } from '../src/services/telegram.js';
import { buildAttendanceWorkbook, buildPayrollWorkbook } from '../src/services/excel.js';
import { parseStudentText, normalizeSex } from '../src/services/studentImport.js';

const weekdays = [1, 2, 3, 4, 5];
const students = [
  { id: 's1', name: 'Sok Dara', code: 'A01', sex: 'M', phone: '012 345 678' },
  { id: 's2', name: 'Chan Nita', code: 'A02', sex: 'F', phone: '' },
  { id: 's3', name: 'Vann Rith', code: '', sex: '', phone: '' },
];
const settings = {
  schoolName: 'Demo School',
  className: 'PLE3',
  teacherName: 'Ms. Lina',
  teacherSex: 'F',
  teacherPhone: '011 111 111',
  roomNumber: '103',
  studyShift: 'Evening',
  messageTemplate: DEFAULT_TEMPLATE,
};

test('date helpers', () => {
  assert.equal(isValidDate('2026-11-02'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('11/02/2026'), false);
  assert.equal(weekdayOf('2026-11-02'), 1); // Monday
  assert.equal(formatLongDate('2026-11-02'), 'Monday, 02 November 2026');
});

test('working days follow weekly pattern and overrides', () => {
  const overrides = new Map([
    ['2026-11-09', { type: 'holiday', note: 'Independence Day' }],
    ['2026-11-07', { type: 'working', note: 'Make-up Saturday' }],
  ]);
  const days = workingDaysBetween('2026-11-02', '2026-11-10', overrides, weekdays);
  assert.deepEqual(days, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-10']);
});

test('study date ranges decide which days are school days', () => {
  const none = new Map();
  const periods = [{ from: '2026-10-19', to: '2026-11-20' }];

  // no ranges set -> weekly pattern all year
  assert.equal(dayInfo('2027-03-01', none, weekdays, []).isWorking, true);

  // inside the range: normal weekday pattern
  assert.equal(dayInfo('2026-10-19', none, weekdays, periods).isWorking, true); // Monday, first day
  assert.equal(dayInfo('2026-11-20', none, weekdays, periods).isWorking, true); // Friday, last day
  assert.equal(dayInfo('2026-10-24', none, weekdays, periods).isWorking, false); // Saturday

  // outside the range: not a school day, and says why
  const out = dayInfo('2026-11-23', none, weekdays, periods);
  assert.deepEqual([out.isWorking, out.source, out.note], [false, 'outside', 'Outside study dates']);
  assert.equal(dayInfo('2026-10-16', none, weekdays, periods).isWorking, false);

  // single-day exceptions still win: a holiday inside, an extra working day outside
  const overrides = new Map([
    ['2026-11-09', { type: 'holiday', note: 'Independence Day' }],
    ['2026-11-21', { type: 'working', note: 'Make-up class' }],
  ]);
  assert.equal(dayInfo('2026-11-09', overrides, weekdays, periods).isWorking, false);
  assert.equal(dayInfo('2026-11-21', overrides, weekdays, periods).isWorking, true);

  // two ranges (e.g. two terms) with a gap between them
  const two = [...periods, { from: '2026-12-01', to: '2026-12-04' }];
  assert.deepEqual(workingDaysBetween('2026-11-19', '2026-12-02', none, weekdays, two), [
    '2026-11-19', '2026-11-20', '2026-12-01', '2026-12-02',
  ]);

  // the form's real period: 19 Oct -> 20 Nov with the two public holidays = 23 days
  const holidays = new Map([['2026-10-29', { type: 'holiday' }], ['2026-11-09', { type: 'holiday' }]]);
  assert.equal(workingDaysBetween('2026-10-01', '2026-12-31', holidays, weekdays, periods).length, 23);
});

test('calendar csv parsing', () => {
  const { days, errors } = parseCalendarCsv('date,type,note\n2026-11-09,holiday,Independence Day, observed\n2026-11-14\n2026-11-21,working\nbad,holiday\n2026-11-22,maybe');
  assert.equal(days.length, 3);
  assert.equal(days[0].note, 'Independence Day, observed');
  assert.equal(days[1].type, 'holiday');
  assert.equal(days[2].type, 'working');
  assert.equal(errors.length, 2);
});

test('student paste import', () => {
  assert.equal(normalizeSex('Male'), 'M');
  assert.equal(normalizeSex(' f '), 'F');
  assert.equal(normalizeSex('x'), '');

  // pasted from Excel: tab separated, with a header row
  const tabbed = "Student's ID\tStudent's Name\tSex\tContact Number\nB1-001\tSok Dara\tM\t012 345 678\n\tChan Nita\tF\t\n";
  const a = parseStudentText(tabbed);
  assert.equal(a.errors.length, 0);
  assert.deepEqual(a.students, [
    { code: 'B1-001', name: 'Sok Dara', sex: 'M', phone: '012 345 678' },
    { code: '', name: 'Chan Nita', sex: 'F', phone: '' },
  ]);

  // comma separated; phone numbers containing commas are kept together
  const b = parseStudentText('B1-003,Vann Rith,M,096 111 222,088 333 444\n,,F\nB1-004,Lim Sophea,Q');
  assert.equal(b.students.length, 2);
  assert.equal(b.students[0].phone, '096 111 222 088 333 444');
  assert.equal(b.students[1].sex, '');
  assert.equal(b.errors.length, 2); // missing name + unknown sex
});

const workingDays = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-12-01', '2026-12-02'];
const recordMap = new Map([
  ['s1', new Map([
    ['2026-11-02', { status: 'P', reason: '' }],
    ['2026-11-03', { status: 'A', reason: '' }],
    ['2026-11-04', { status: 'PM', reason: 'Sick' }],
    ['2026-11-05', { status: 'P', reason: '' }], // not a school day -> must be ignored
    ['2026-12-01', { status: 'P', reason: '' }],
  ])],
  ['s2', new Map([['2026-11-02', { status: 'P', reason: '' }]])],
]);

test('summary counts only scheduled days', () => {
  const s = buildSummary({ students, recordMap, workingDays });
  assert.deepEqual(s.months, ['2026-11', '2026-12']);
  assert.equal(s.scheduled, 5);
  const r1 = s.rows[0];
  assert.deepEqual(r1.byMonth['2026-11'], { P: 1, A: 1, PM: 1 });
  assert.deepEqual(r1.total, { P: 2, A: 1, PM: 1, unrecorded: 1 });
  assert.equal(s.rows[2].total.unrecorded, 5);
});

test('telegram report lists absences only, in the requested wording', () => {
  const rosterOf32 = [
    { name: 'Oul sophaneat', status: 'A', reason: '' },
    { name: 'Chan Nita', status: 'PM', reason: 'Doctor visit' }, // permission: not listed
    ...Array.from({ length: 30 }, (_, i) => ({ name: `Student ${i + 1}`, status: 'P', reason: '' })),
    { name: 'Not marked yet', status: null, reason: '' },
  ];
  const s = { ...settings, teacherName: 'Chiev Lypheng' };
  const { text, counts } = buildReport(s, '2026-11-02', rosterOf32);
  assert.deepEqual(counts, { present: 30, absent: 1, permission: 1, unmarked: 1, total: 33 });
  assert.equal(
    text,
    [
      'Dear CP, and DCP',
      "I would like to update the attendance for today's class:",
      "Teacher's name: Chiev Lypheng",
      'Date: 2/Nov/ 2026',
      'Shift: Evening',
      'Level: PLE3',
      'Total students: 33',
      'Absences: 1',
      '1.Oul sophaneat',
      'Please kindly note. Many thanks!',
    ].join('\n'),
  );
  assert.ok(!text.includes('Chan Nita') && !text.includes('Doctor visit') && !text.includes('Student 1'));

  // several absences are numbered; none says "None"
  const three = ['A1', 'A2', 'A3'].map((name) => ({ name, status: 'A', reason: '' }));
  assert.match(buildReport(s, '2026-11-02', three).text, /Absences: 3\n1\.A1\n2\.A2\n3\.A3\nPlease/);
  assert.match(buildReport(s, '2026-11-02', [{ name: 'X', status: 'P', reason: '' }]).text, /Absences: 0\nNone\nPlease/);

  // other placeholders still work for custom templates
  assert.equal(renderTemplate('{{nope}} {{ date }}', { date: 'x' }), '{{nope}} x');
  const long = buildReport({ ...s, messageTemplate: '{{date}} | {{permission_list}}' }, '2026-11-02', rosterOf32);
  assert.equal(long.text, 'Monday, 02 November 2026 | 1.Chan Nita — Doctor visit');
});

const build = (over = {}) =>
  buildAttendanceWorkbook({
    students, recordMap, workingDays, settings: { ...settings, ...over }, from: '2026-11-01', to: '2026-12-31',
  });

test('attendance workbook follows the school form layout', async () => {
  const wb = build();
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Evening', 'Summary']);
  const f = wb.getWorksheet('Evening');

  // page setup: A4 landscape, one page wide, header rows repeat
  assert.equal(f.pageSetup.paperSize, 9);
  assert.equal(f.pageSetup.orientation, 'landscape');
  assert.equal(f.pageSetup.fitToWidth, 1);
  assert.equal(f.pageSetup.printTitlesRow, '7:8');

  // title block
  assert.equal(f.getCell('C1').value, 'Demo School');
  assert.equal(f.getCell('B2').value, 'Daily Student Attendance List');
  assert.equal(f.getCell('C3').value, "Class Teacher's name: Ms. Lina");
  assert.equal(f.getCell('O3').value, 'Sex: Female');
  assert.equal(f.getCell('C4').value, 'Level: PLE3');
  assert.equal(f.getCell('C5').value, 'Room Number: 103');
  // 20 date slots (F..Y) -> the 4 tick columns start at Z, phone AD, remark AE
  assert.equal(f.getCell('Z3').value, 'Month: December     Year: 2026');
  assert.equal(f.getCell('Z4').value, 'Phone Number: 011 111 111');
  assert.equal(f.getCell('Z5').value, 'Study Shift: Evening');

  // table header
  assert.equal(f.getCell('B7').value, 'No');
  assert.equal(f.getCell('C7').value, "Student's ID");
  assert.equal(f.getCell('D7').value, "Student's Name");
  assert.equal(f.getCell('E7').value, 'Sex');
  assert.match(f.getCell('F7').value, /closing date/);
  assert.deepEqual([6, 7, 8, 9, 10].map((c) => f.getCell(8, c).value), [2, 3, 4, 1, 2]);
  assert.equal(f.getCell(8, 11).value, null); // spare slot
  assert.deepEqual(['Z', 'AA', 'AB', 'AC'].map((c) => f.getCell(`${c}7`).value), ['Uniform', 'Sp. Uniform', 'Text Book', 'ID Card']);
  assert.equal(f.getCell('AD7').value, 'Contact  Number');
  assert.equal(f.getCell('AE7').value, 'Remark');

  // student rows
  assert.equal(f.getCell('D9').value, 'Sok Dara');
  assert.equal(f.getCell('C9').value, 'A01');
  assert.equal(f.getCell('E9').value, 'M');
  assert.equal(f.getCell('AD9').value, '012 345 678');
  // tick = present, A = absent, P = permission
  assert.deepEqual([6, 7, 8, 9, 10].map((c) => f.getCell(9, c).value), ['✓', 'A', 'P', '✓', null]);
  assert.deepEqual([6, 7, 8].map((c) => f.getCell(10, c).value), ['✓', null, null]);
  assert.equal(f.getCell('D11').value, 'Vann Rith');

  // notes copied from the paper form
  assert.equal(f.getCell('C13').value, 'Notes: ');
  assert.match(f.getCell('C14').value, /^1\. Number of remaining students/);
  assert.match(f.getCell('C20').value, /^\*Formula of Number 6/);

  // only codes on the printed sheet; permission reasons never appear
  let text = '';
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { text += `${typeof c.value === 'object' && c.value ? '' : c.value} `; })));
  assert.ok(!text.includes('Sick'));

  // round trip through a real xlsx file
  const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf);
  assert.equal(back.getWorksheet('Evening').getCell('H9').value, 'P');
  if (process.env.XLSX_OUT) await wb.xlsx.writeFile(process.env.XLSX_OUT);
});

test('summary tab counts with live formulas pointing at the form', () => {
  const wb = build();
  const s = wb.getWorksheet('Summary');
  assert.equal(s.pageSetup.orientation, 'landscape');
  assert.equal(s.getCell('C5').value, 'Present');
  assert.equal(s.getCell('E5').value, 'Permission');
  // student 1, November (cols F..H), then December (I..J)
  assert.equal(s.getCell('C6').value.formula, `COUNTIF('Evening'!$F$9:$H$9,"✓")`); // present
  assert.equal(s.getCell('D6').value.formula, `COUNTIF('Evening'!$F$9:$H$9,"A")`); // absent
  assert.equal(s.getCell('E6').value.formula, `COUNTIF('Evening'!$F$9:$H$9,"P")`); // permission
  assert.equal(s.getCell('F6').value.formula, `COUNTIF('Evening'!$I$9:$J$9,"✓")`);
  const cached = (c) => s.getCell(6, c).value.result ?? 0; // ExcelJS omits a cached 0
  assert.deepEqual([3, 4, 5, 6, 7, 8].map(cached), [1, 1, 1, 1, 0, 0]);
  // totals + not recorded
  assert.deepEqual([9, 10, 11, 12].map(cached), [2, 1, 1, 1]);
  assert.equal(wb.calcProperties.fullCalcOnLoad, true);
});

test('sheet name falls back safely and long ranges widen the form', () => {
  assert.equal(build({ studyShift: '' }).worksheets[0].name, 'Attendance');
  assert.equal(build({ studyShift: 'Eve/ning?' }).worksheets[0].name, 'Evening');
  assert.equal(build({ studyShift: 'Summary' }).worksheets[0].name, 'Attendance');

  const many = Array.from({ length: 23 }, (_, i) => `2026-11-${String(i + 2).padStart(2, '0')}`);
  const wb = buildAttendanceWorkbook({ students, recordMap: new Map(), workingDays: many, settings, from: '2026-11-02', to: '2026-11-24' });
  const f = wb.worksheets[0];
  assert.equal(f.getCell(8, 6 + 22).value, 24); // 23rd date sits in column AB
  assert.equal(f.getCell(7, 6 + 23).value, 'Uniform'); // ticks start right after the 23 dates
});

test('payroll workbook', async () => {
  const wb = buildPayrollWorkbook({ students, recordMap, workingDays, settings, from: '2026-11-01', to: '2026-12-31' });
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Payroll by month', 'Totals', 'Details']);
  const p = wb.getWorksheet('Payroll by month');
  assert.equal(p.getCell(4, 1).value, 'Month');
  assert.equal(p.getCell(5, 1).value, 'November 2026');
  assert.equal(p.getCell(5, 5).value, 3); // school days in Nov
  assert.equal(p.getCell(5, 6).value, 1); // Sok Dara present in Nov
  const d = wb.getWorksheet('Details');
  const reasons = [];
  d.eachRow((row) => reasons.push(row.getCell(5).value));
  assert.ok(reasons.includes('Sick'));
  assert.equal(d.rowCount, 1 + 5); // header + 4 for s1 (non-school day excluded) + 1 for s2
  if (process.env.PAYROLL_OUT) await wb.xlsx.writeFile(process.env.PAYROLL_OUT);
});
