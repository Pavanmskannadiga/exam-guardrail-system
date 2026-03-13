const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ['tab-switch', 'window-resize', 'keyboard', 'idle'] },
  detail: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true, trim: true },
  examCode: { type: String, default: '', trim: true },
  violations: { type: [violationSchema], default: [] },
  trustScore: { type: Number, default: 100 },
  connected: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('Student', studentSchema);
