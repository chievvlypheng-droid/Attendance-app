import mongoose from 'mongoose';
import { DEFAULT_TEMPLATE } from '../services/telegram.js';

// single document holding app-wide defaults
const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  schoolName: { type: String, default: '' },
  className: { type: String, default: '' }, // printed as "Level" on the Excel form
  teacherName: { type: String, default: '' },
  teacherSex: { type: String, enum: ['M', 'F', ''], default: '' },
  teacherPhone: { type: String, default: '' },
  roomNumber: { type: String, default: '' },
  studyShift: { type: String, default: '' }, // e.g. Evening
  workingWeekdays: { type: [Number], default: [1, 2, 3, 4, 5] }, // 0 = Sunday
  messageTemplate: { type: String, default: DEFAULT_TEMPLATE },
  telegramChatId: { type: String, default: '' },
});

export default mongoose.model('Settings', settingsSchema);
