// Parses text pasted from Excel (tab separated) or a CSV (comma separated).
// Column order matches the school form:  Student ID | Student's Name | Sex | Contact Number
// Only the name is required. A header row is skipped automatically.

export function normalizeSex(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['m', 'male', 'boy'].includes(s)) return 'M';
  if (['f', 'female', 'girl'].includes(s)) return 'F';
  return '';
}

export function parseStudentText(text) {
  const students = [];
  const errors = [];
  const lines = String(text || '').split(/\r?\n/);

  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = (raw.includes('\t') ? raw.split('\t') : raw.split(',')).map((c) => c.trim());
    const [code = '', name = '', sex = '', ...rest] = cells;

    const looksLikeHeader = /^(student'?s?\s*)?(id|no|name)$/i.test(code) || /^student'?s?\s*name$/i.test(name);
    if (looksLikeHeader) return;

    if (!name) {
      errors.push(`Line ${i + 1}: no name`);
      return;
    }
    const sexCode = normalizeSex(sex);
    if (sex && !sexCode) {
      errors.push(`Line ${i + 1}: sex "${sex}" not recognised (use M or F), left blank`);
    }
    students.push({ code, name, sex: sexCode, phone: rest.join(' ').trim() });
  });

  return { students, errors };
}
