// recordMap: Map(studentId -> Map(date -> {status, reason}))
// Only dates that are scheduled working days are counted, so payroll always follows the calendar.
export function buildSummary({ students, recordMap, workingDays }) {
  const workingSet = new Set(workingDays);
  const months = [...new Set(workingDays.map((d) => d.slice(0, 7)))];
  const scheduledByMonth = Object.fromEntries(
    months.map((m) => [m, workingDays.filter((d) => d.startsWith(m)).length]),
  );

  const rows = students.map((s) => {
    const byMonth = Object.fromEntries(months.map((m) => [m, { P: 0, A: 0, PM: 0 }]));
    const total = { P: 0, A: 0, PM: 0 };
    for (const [date, rec] of recordMap.get(s.id) || []) {
      if (!workingSet.has(date)) continue;
      byMonth[date.slice(0, 7)][rec.status] += 1;
      total[rec.status] += 1;
    }
    return {
      ...s,
      byMonth,
      total: { ...total, unrecorded: workingDays.length - total.P - total.A - total.PM },
    };
  });

  return { months, scheduledByMonth, scheduled: workingDays.length, rows };
}
