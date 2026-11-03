import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { monthLabel, weekdayOf, MONTH_NAMES, WEEKDAY_NAMES } from './calendar.js';
import { buildSummary } from './summary.js';

const thin = { style: 'thin', color: { argb: 'FF000000' } };
const medium = { style: 'medium', color: { argb: 'FF000000' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const HEAD_FILL = solid('FFE5E7EB'); // Summary / payroll sheets
const FORM_FILL = solid('FFDCE5F1'); // school form header blue
const CENTER = { horizontal: 'center', vertical: 'middle' };

// What goes inside an attendance cell, as on the paper form: tick = present, A = absent, P = permission.
// (Stored statuses are P / A / PM; this maps them to what is printed.)
const MARKS = { P: '✓', A: 'A', PM: 'P' };

const LOGO_URL = new URL('../../assets/logo.png', import.meta.url);

// '2026-11-02' -> '02 Nov 2026'
const shortDate = (s) => `${s.slice(8)} ${MONTH_NAMES[Number(s.slice(5, 7)) - 1].slice(0, 3)} ${s.slice(0, 4)}`;

const FOOTER = '&RPage &P of &N';

// A4, fit all columns on one page wide, as many pages tall as needed
function pageSetup(orientation, printTitlesRow) {
  return {
    paperSize: 9,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    ...(printTitlesRow ? { printTitlesRow } : {}),
  };
}

function boxCells(ws, r1, c1, r2, c2, extra = {}) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.border = BORDER;
      Object.assign(cell, extra);
    }
  }
}

function titleRows(ws, lastCol, school, title, subtitle) {
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = school || 'Student Attendance';
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(1, 1).alignment = CENTER;
  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = title;
  ws.getCell(2, 1).font = { bold: true, size: 12 };
  ws.getCell(2, 1).alignment = CENTER;
  ws.mergeCells(3, 1, 3, lastCol);
  ws.getCell(3, 1).value = subtitle;
  ws.getCell(3, 1).font = { size: 10 };
  ws.getCell(3, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 16;
}

function classLine(settings) {
  return `Class: ${settings.className || '-'}     Teacher: ${settings.teacherName || '-'}`;
}

const sexLabel = (s) => (s === 'M' ? 'Male' : s === 'F' ? 'Female' : '');

// Excel sheet names: max 31 chars, none of  \ / ? * [ ] :  and no apostrophes (they break formulas)
function safeSheetName(name, fallback) {
  const clean = String(name || '').replace(/[\\/?*[\]:']/g, '').trim().slice(0, 31);
  return !clean || clean.toLowerCase() === 'summary' ? fallback : clean;
}

// ---------------------------------------------------------------------------
// Printable attendance workbook
//   Sheet 1: the school's "Daily Student Attendance List" form for the chosen range
//   Sheet 2: Summary with P / A / permission totals (live formulas pointing at sheet 1)
// ---------------------------------------------------------------------------
export function buildAttendanceWorkbook({ students, recordMap, workingDays, settings, from, to }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Attendance System';
  wb.created = new Date();
  // ExcelJS does not store a cached result of 0, so ask Excel to recalculate the Summary formulas on open
  wb.calcProperties = { fullCalcOnLoad: true };

  const form = addFormSheet(wb, { students, recordMap, workingDays, settings, to });
  const summary = buildSummary({ students, recordMap, workingDays });
  addSummarySheet(wb, { summary, form, settings, from, to });
  return wb;
}

const FIRST_DATE_COL = 6; // F, after A(margin) B(No) C(ID) D(Name) E(Sex)
const MIN_DATE_SLOTS = 20; // short ranges still print a full-width form, like the paper one

const NOTES = [
  'Notes: ',
  '1. Number of remaining students as of (End of last month): …………….',
  "2. Number of new students for this month (After last month's closing date until this month's closing date): ……………",
  "3. Number of churning students for this month (After last month's closing date until this month's closing date): …………",
  "4. Number of students changing into this shift (After last month's closing date until this month's closing date): ………………",
  "5. Number of students changing out of this shift (After last month's closing date until this month's closing date): ………………",
  '6. Number of existing students up to date: ………………….…',
  '*Formula of Number 6: (1+2-3+4-5=6)',
];

function addFormSheet(wb, { students, recordMap, workingDays, settings, to }) {
  const marks = MARKS;
  const days = workingDays;
  const slots = Math.max(days.length, MIN_DATE_SLOTS);
  const first = FIRST_DATE_COL;
  const lastDate = first + slots - 1;
  const cUni = lastDate + 1; // Uniform, Sp. Uniform, Text Book, ID Card
  const cPhone = lastDate + 5;
  const cRemark = lastDate + 6;
  const lastCol = cRemark;

  const ws = wb.addWorksheet(safeSheetName(settings.studyShift, 'Attendance'), {
    pageSetup: pageSetup('landscape', '7:8'),
  });
  ws.headerFooter.oddFooter = FOOTER;
  const L = (c) => ws.getColumn(c).letter;

  // column widths follow the paper form
  ws.getColumn(1).width = 1.5;
  ws.getColumn(2).width = 4.5;
  ws.getColumn(3).width = 13.1;
  ws.getColumn(4).width = 24.4;
  ws.getColumn(5).width = 4.4;
  for (let c = first; c <= cUni + 3; c++) ws.getColumn(c).width = 3.4;
  ws.getColumn(cPhone).width = 26;
  ws.getColumn(cRemark).width = 17.9;

  [39, 33.75, 20.25, 22.5, 22.5, 12, 22.75, 22.75].forEach((h, i) => (ws.getRow(i + 1).height = h));

  // ---- title block (rows 1-5) ----
  ws.getCell('C1').value = settings.schoolName || '';
  ws.getCell('C1').font = { name: 'Gabriola', size: 20, color: { argb: 'FF376092' } };
  ws.getCell('C1').alignment = { vertical: 'middle', indent: 2 };
  if (fs.existsSync(LOGO_URL)) {
    const logo = wb.addImage({ buffer: fs.readFileSync(LOGO_URL), extension: 'png' });
    ws.addImage(logo, { tl: { col: 1.05, row: 0.12 }, ext: { width: 44, height: 34 } });
  }

  ws.mergeCells(2, 2, 2, lastCol);
  ws.getCell(2, 2).value = 'Daily Student Attendance List';
  ws.getCell(2, 2).font = { name: 'Cambria', size: 18 };
  ws.getCell(2, 2).alignment = CENTER;

  const info = { name: 'Cambria', size: 12 };
  const put = (r, c1, c2, text) => {
    if (c2 > c1) ws.mergeCells(r, c1, r, c2);
    const cell = ws.getCell(r, c1);
    cell.value = text;
    cell.font = info;
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  };
  const monthName = MONTH_NAMES[Number(to.slice(5, 7)) - 1];
  put(3, 3, 10, `Class Teacher's name: ${settings.teacherName || ''}`);
  if (settings.teacherSex) put(3, 15, 18, `Sex: ${sexLabel(settings.teacherSex)}`);
  put(3, cUni, lastCol, `Month: ${monthName}     Year: ${to.slice(0, 4)}`);
  put(4, 3, 10, `Level: ${settings.className || ''}`);
  put(4, cUni, lastCol, `Phone Number: ${settings.teacherPhone || ''}`);
  put(5, 3, 10, `Room Number: ${settings.roomNumber || ''}`);
  put(5, cUni, lastCol, `Study Shift: ${settings.studyShift || ''}`);

  // ---- table header (rows 7-8) ----
  const head = { name: 'Cambria', size: 11, bold: true };
  boxCells(ws, 7, 2, 8, lastCol, { fill: FORM_FILL, alignment: { ...CENTER, wrapText: true }, font: head });
  const tall = (c, text, font) => {
    ws.getCell(7, c).value = text;
    if (font) ws.getCell(7, c).font = font;
    ws.mergeCells(7, c, 8, c);
  };
  tall(2, 'No');
  tall(3, "Student's ID");
  tall(4, "Student's Name");
  tall(5, 'Sex');
  ws.getCell(7, first).value = "From last month's closing date until this month's closing date";
  ws.getCell(7, first).font = { name: 'Trebuchet MS', size: 10, bold: true };
  ws.mergeCells(7, first, 7, lastDate);

  const monthStart = new Set(); // columns where a new month begins -> thicker left border
  days.forEach((d, j) => {
    if (j > 0 && d.slice(0, 7) !== days[j - 1].slice(0, 7)) monthStart.add(first + j);
  });
  for (let c = first; c <= lastDate; c++) {
    const cell = ws.getCell(8, c);
    cell.value = c - first < days.length ? Number(days[c - first].slice(8)) : null;
    cell.font = { name: 'Trebuchet MS', size: 11 };
    cell.fill = solid('FFDBE5F1');
  }
  ['Uniform', 'Sp. Uniform', 'Text Book', 'ID Card'].forEach((t, i) => {
    ws.getCell(7, cUni + i).value = t;
    ws.getCell(7, cUni + i).font = { name: 'Trebuchet MS', size: 8, bold: true };
    ws.getCell(7, cUni + i).alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 };
    ws.mergeCells(7, cUni + i, 8, cUni + i);
  });
  tall(cPhone, 'Contact  Number');
  tall(cRemark, 'Remark');

  // ---- student rows ----
  const r0 = 9;
  const rowOf = new Map();
  students.forEach((s, i) => {
    const r = r0 + i;
    rowOf.set(s.id, r);
    const recs = recordMap.get(s.id) || new Map();
    ws.getRow(r).height = 22;
    boxCells(ws, r, 2, r, lastCol, { alignment: CENTER, font: { name: 'Calibri', size: 11 } });

    ws.getCell(r, 2).value = i + 1;
    ws.getCell(r, 2).font = { name: 'Calibri', size: 10 };
    ws.getCell(r, 3).value = s.code || null;
    ws.getCell(r, 3).font = { name: 'Calibri', size: 10 };
    ws.getCell(r, 4).value = s.name;
    ws.getCell(r, 4).font = { name: 'Calibri', size: 10 };
    ws.getCell(r, 4).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getCell(r, 5).value = s.sex || null;
    ws.getCell(r, 5).font = { name: 'Calibri', size: 10 };
    ws.getCell(r, cPhone).value = s.phone || null;
    ws.getCell(r, cPhone).font = { name: 'Calibri', size: 10 };

    days.forEach((d, j) => {
      const rec = recs.get(d);
      if (!rec) return;
      const cell = ws.getCell(r, first + j);
      cell.value = marks[rec.status];
      cell.font = { name: 'Calibri', size: 10 }; // keeps "PM" inside the narrow date column
    });
  });

  const rEnd = r0 + students.length - 1;
  for (const c of monthStart) {
    for (let r = 8; r <= rEnd; r++) ws.getCell(r, c).border = { ...BORDER, left: medium };
  }

  // ---- notes under the table, same wording as the paper form ----
  NOTES.forEach((text, i) => {
    const r = rEnd + 2 + i;
    ws.getCell(r, 3).value = text;
    ws.getCell(r, 3).font = { name: 'Cambria', size: 11, bold: i === 0 };
    ws.getRow(r).height = 18;
  });

  ws.views = [{ state: 'frozen', xSplit: 4, ySplit: 8 }];

  // columns of each month's days, so the Summary tab can count them with formulas
  const monthCols = {};
  days.forEach((d, j) => {
    const m = d.slice(0, 7);
    const c = first + j;
    if (!monthCols[m]) monthCols[m] = { first: L(c), last: L(c) };
    monthCols[m].last = L(c);
  });
  return { name: ws.name, rowOf, monthCols, marks };
}

function addSummarySheet(wb, { summary, form, settings, from, to }) {
  const ws = wb.addWorksheet('Summary', { pageSetup: pageSetup('landscape', '4:5') });
  ws.headerFooter.oddFooter = FOOTER;

  const { months, rows } = summary;
  const totalStart = 3 + months.length * 3;
  const lastCol = totalStart + 3;
  const L = (c) => ws.getColumn(c).letter;

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 28;
  for (let c = 3; c <= lastCol; c++) ws.getColumn(c).width = 11.5;

  titleRows(
    ws,
    lastCol,
    settings.schoolName,
    `Attendance Summary - ${shortDate(from)} to ${shortDate(to)}`,
    classLine(settings),
  );

  boxCells(ws, 4, 1, 5, lastCol, { font: { bold: true, size: 10 }, fill: HEAD_FILL, alignment: CENTER });
  ws.getCell(4, 1).value = 'No';
  ws.getCell(4, 2).value = 'Student Name';
  ws.mergeCells(4, 1, 5, 1);
  ws.mergeCells(4, 2, 5, 2);
  const LABELS = ['Present', 'Absent', 'Permission'];
  months.forEach((m, k) => {
    const c = 3 + k * 3;
    ws.getCell(4, c).value = `${monthLabel(m, true)} (${summary.scheduledByMonth[m]} days)`;
    ws.mergeCells(4, c, 4, c + 2);
    LABELS.forEach((t, i) => (ws.getCell(5, c + i).value = t));
  });
  ws.getCell(4, totalStart).value = `Total (${summary.scheduled} days)`;
  ws.mergeCells(4, totalStart, 4, lastCol);
  [...LABELS, 'Not recorded'].forEach((t, i) => (ws.getCell(5, totalStart + i).value = t));

  const CODES = ['P', 'A', 'PM'];
  rows.forEach((row, i) => {
    const r = 6 + i;
    boxCells(ws, r, 1, r, lastCol, { alignment: CENTER, font: { size: 10 } });
    ws.getRow(r).height = 18;
    ws.getCell(r, 1).value = i + 1;
    ws.getCell(r, 2).value = row.name;
    ws.getCell(r, 2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    const cellsOf = { P: [], A: [], PM: [] };
    const srcRow = form.rowOf.get(row.id);
    months.forEach((m, k) => {
      const cols = form.monthCols[m];
      const range = `'${form.name}'!$${cols.first}$${srcRow}:$${cols.last}$${srcRow}`;
      CODES.forEach((code, idx) => {
        const c = 3 + k * 3 + idx;
        ws.getCell(r, c).value = {
          formula: `COUNTIF(${range},"${form.marks[code]}")`,
          result: row.byMonth[m][code],
        };
        cellsOf[code].push(`${L(c)}${r}`);
      });
    });

    CODES.forEach((code, idx) => {
      const cell = ws.getCell(r, totalStart + idx);
      cell.value = { formula: `SUM(${cellsOf[code].join(',')})`, result: row.total[code] };
      cell.font = { bold: true, size: 10 };
    });
    const nr = ws.getCell(r, lastCol);
    nr.value = {
      formula: `${summary.scheduled}-${L(totalStart)}${r}-${L(totalStart + 1)}${r}-${L(totalStart + 2)}${r}`,
      result: row.total.unrecorded,
    };
    nr.font = { bold: true, size: 10 };
  });

  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 5 }];
}

// ---------------------------------------------------------------------------
// Payroll export: monthly counts per student, whole-period totals, and a
// day-by-day detail list (with permission reasons) for checking
// ---------------------------------------------------------------------------
const STATUS_LONG = { P: 'Present', A: 'Absent', PM: 'Permission' };

function styleTableHeader(row, cols) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true };
    cell.fill = HEAD_FILL;
    cell.border = BORDER;
    cell.alignment = CENTER;
  }
}

function borderRows(ws, r1, r2, cols) {
  for (let r = r1; r <= r2; r++) {
    for (let c = 1; c <= cols; c++) ws.getCell(r, c).border = BORDER;
  }
}

export function buildPayrollWorkbook({ students, recordMap, workingDays, settings, from, to }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Attendance System';
  wb.created = new Date();
  const summary = buildSummary({ students, recordMap, workingDays });
  const period = `Period: ${shortDate(from)} to ${shortDate(to)}`;

  // 1) per month
  const ws = wb.addWorksheet('Payroll by month', { pageSetup: pageSetup('portrait', '4:4') });
  ws.headerFooter.oddFooter = FOOTER;
  ws.columns = [
    { width: 16 }, { width: 5 }, { width: 28 }, { width: 12 },
    { width: 11 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 13 },
  ];
  titleRows(ws, 9, settings.schoolName, 'Payroll Attendance Export', `${period}     ${classLine(settings)}`);
  styleTableHeader(
    ws.addRow(['Month', 'No', 'Student Name', 'Student ID', 'School Days', 'Present', 'Absent', 'Permission', 'Not Recorded']),
    9,
  );
  // rows 1-3 are the title block, so the header above landed on row 4
  let r = 5;
  for (const m of summary.months) {
    summary.rows.forEach((row, i) => {
      const c = row.byMonth[m];
      const sched = summary.scheduledByMonth[m];
      ws.addRow([monthLabel(m), i + 1, row.name, row.code, sched, c.P, c.A, c.PM, sched - c.P - c.A - c.PM]);
      r += 1;
    });
  }
  borderRows(ws, 5, r - 1, 9);
  for (let rr = 5; rr < r; rr++) {
    [2, 4, 5, 6, 7, 8, 9].forEach((c) => (ws.getCell(rr, c).alignment = { horizontal: 'center' }));
  }
  ws.autoFilter = { from: 'A4', to: 'I4' };
  ws.views = [{ state: 'frozen', ySplit: 4 }];

  // 2) whole-period totals
  const wt = wb.addWorksheet('Totals', { pageSetup: pageSetup('portrait', '4:4') });
  wt.headerFooter.oddFooter = FOOTER;
  wt.columns = [{ width: 5 }, { width: 28 }, { width: 12 }, { width: 11 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 13 }];
  titleRows(wt, 8, settings.schoolName, 'Attendance Totals', `${period}     ${classLine(settings)}`);
  styleTableHeader(
    wt.addRow(['No', 'Student Name', 'Student ID', 'School Days', 'Present', 'Absent', 'Permission', 'Not Recorded']),
    8,
  );
  summary.rows.forEach((row, i) => {
    wt.addRow([i + 1, row.name, row.code, summary.scheduled, row.total.P, row.total.A, row.total.PM, row.total.unrecorded]);
  });
  borderRows(wt, 5, 4 + summary.rows.length, 8);
  for (let rr = 5; rr < 5 + summary.rows.length; rr++) {
    [1, 3, 4, 5, 6, 7, 8].forEach((c) => (wt.getCell(rr, c).alignment = { horizontal: 'center' }));
  }
  wt.views = [{ state: 'frozen', ySplit: 4 }];

  // 3) details
  const wd = wb.addWorksheet('Details', { pageSetup: pageSetup('portrait', '1:1') });
  wd.headerFooter.oddFooter = FOOTER;
  wd.columns = [{ width: 12 }, { width: 12 }, { width: 28 }, { width: 12 }, { width: 40 }];
  styleTableHeader(wd.addRow(['Date', 'Day', 'Student Name', 'Status', 'Reason']), 5);
  const workingSet = new Set(workingDays);
  const detail = [];
  for (const s of students) {
    for (const [date, rec] of recordMap.get(s.id) || []) {
      if (workingSet.has(date)) detail.push({ date, name: s.name, ...rec });
    }
  }
  detail.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  for (const d of detail) {
    wd.addRow([d.date, WEEKDAY_NAMES[weekdayOf(d.date)], d.name, STATUS_LONG[d.status], d.reason || '']);
  }
  borderRows(wd, 2, 1 + detail.length, 5);
  wd.autoFilter = { from: 'A1', to: 'E1' };
  wd.views = [{ state: 'frozen', ySplit: 1 }];

  return wb;
}
