// src/models/Session.js
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  therapy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Therapy',
    required: true
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  practitioner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show'],
    default: 'scheduled'
  },
  cancellationReason: String,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: Date,
  notes: {
    preSession: String,
    duringSession: String,
    postSession: String
  },
  vitals: {
    bloodPressure: {
      systolic: Number,
      diastolic: Number
    },
    heartRate: Number,
    temperature: Number,
    weight: Number,
    recordedAt: Date
  },
  symptoms: {
    before: [String],
    during: [String],
    after: [String]
  },
  price: {
    type: Number,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  reminders: {
    sent24h: { type: Boolean, default: false },
    sent2h: { type: Boolean, default: false },
    sent30min: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
sessionSchema.index({ patient: 1, scheduledDate: -1 });
sessionSchema.index({ practitioner: 1, scheduledDate: -1 });
sessionSchema.index({ status: 1, scheduledDate: 1 });
sessionSchema.index({ startTime: 1, endTime: 1 });

// Validate session timing
sessionSchema.pre('save', function(next) {
  if (this.startTime >= this.endTime) {
    return next(new Error('End time must be after start time'));
  }
  if (this.startTime < new Date()) {
    return next(new Error('Cannot schedule session in the past'));
  }
  next();
});

module.exports = mongoose.model('Session', sessionSchema);