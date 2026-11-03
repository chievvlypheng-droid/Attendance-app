import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    studentCode: { type: String, trim: true, default: '' },
    sex: { type: String, enum: ['M', 'F', ''], default: '' },
    phone: { type: String, trim: true, default: '' }, // parent / contact number, printed on the sheet
    // "removed" students are deactivated, not deleted, so past attendance and payroll stay correct
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('Student', studentSchema);
