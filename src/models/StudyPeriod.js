import mongoose from 'mongoose';

// A date range the class is studying, e.g. 2026-10-19 to 2026-11-20 (one closing-date period).
const studyPeriodSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: '' },
  from: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  to: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
});

export default mongoose.model('StudyPeriod', studyPeriodSchema);
