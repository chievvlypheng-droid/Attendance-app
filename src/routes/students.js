import { Router } from "express";
import Student from "../models/Student.js";
import { HttpError, wrap } from "../lib/http.js";
import { normalizeSex, parseStudentText } from "../services/studentImport.js";

const router = Router();
const out = (s) => ({
  id: String(s._id),
  name: s.name,
  code: s.studentCode || "",
  sex: s.sex || "",
  phone: s.phone || "",
  active: s.active,
});

// GET /api/students            -> active students
// GET /api/students?all=1      -> including removed students
router.get(
  "/",
  wrap(async (req, res) => {
    const filter = req.query.all ? {} : { active: true };
    const list = await Student.find(filter).sort({ createdAt: 1 }).lean();

    res.json(list.map(out));
  }),
);

router.post(
  "/",
  wrap(async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) throw new HttpError(400, "Student name is required.");
    const s = await Student.create({
      name,
      studentCode: String(req.body.code || "").trim(),
      sex: normalizeSex(req.body.sex),
      phone: String(req.body.phone || "").trim(),
    });
    res.status(201).json(out(s));
  }),
);

// POST /api/students/import  { text }   paste from Excel: ID | Name | Sex | Contact
// Names already in the active list are skipped, so pasting twice does not create duplicates.
router.post(
  "/import",
  wrap(async (req, res) => {
    const { students, errors } = parseStudentText(req.body.text);
    const existing = new Set(
      (await Student.find({ active: true }).lean()).map((s) =>
        s.name.trim().toLowerCase(),
      ),
    );
    const fresh = [];
    let skipped = 0;
    for (const s of students) {
      const key = s.name.toLowerCase();
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      existing.add(key);
      fresh.push({
        name: s.name,
        studentCode: s.code,
        sex: s.sex,
        phone: s.phone,
      });
    }
    if (fresh.length) await Student.insertMany(fresh);
    res.json({ imported: fresh.length, skipped, errors });
  }),
);

router.put(
  "/:id",
  wrap(async (req, res) => {
    const update = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) throw new HttpError(400, "Student name is required.");
      update.name = name;
    }
    if (req.body.code !== undefined)
      update.studentCode = String(req.body.code).trim();
    if (req.body.sex !== undefined) update.sex = normalizeSex(req.body.sex);
    if (req.body.phone !== undefined)
      update.phone = String(req.body.phone).trim();
    if (req.body.active !== undefined) update.active = Boolean(req.body.active);
    const s = await Student.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!s) throw new HttpError(404, "Student not found.");
    res.json(out(s));
  }),
);

// "Remove" keeps the student and their history, but hides them from new attendance lists
router.delete(
  "/:id",
  wrap(async (req, res) => {
    const s = await Student.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true },
    );
    if (!s) throw new HttpError(404, "Student not found.");
    res.json(out(s));
  }),
);

export default router;
