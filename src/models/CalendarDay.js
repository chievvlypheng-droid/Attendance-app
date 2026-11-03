import mongoose from 'mongoose';

// Exceptions to the weekly pattern: a holiday on a normal school day,
// or a working day on a normally closed day (e.g. a Saturday class).
const calendarDaySchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  type: { type: String, enum: ['holiday', 'working'], required: true },
  note: { type: String, trim: true, default: '' },
});

export default mongoose.model('CalendarDay', calendarDaySchema);
