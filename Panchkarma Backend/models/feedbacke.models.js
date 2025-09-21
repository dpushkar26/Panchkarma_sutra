// src/models/Feedback.js
const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
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
  rating: {
    overall: { type: Number, min: 1, max: 5, required: true },
    practitionerSkill: { type: Number, min: 1, max: 5 },
    facilityClanliness: { type: Number, min: 1, max: 5 },
    communication: { type: Number, min: 1, max: 5 },
    effectiveness: { type: Number, min: 1, max: 5 }
  },
  comments: {
    positive: String,
    improvement: String,
    sideEffects: String
  },
  symptoms: {
    improved: [String],
    worsened: [String],
    new: [String]
  },
  recommendation: {
    wouldRecommend: { type: Boolean, required: true },
    toWho: String
  },
  followUp: {
    needed: { type: Boolean, default: false },
    preferredDate: Date,
    concerns: String
  },
  isAnonymous: { type: Boolean, default: false }
}, {
  timestamps: true
});

feedbackSchema.index({ session: 1 }, { unique: true });
feedbackSchema.index({ patient: 1, createdAt: -1 });
feedbackSchema.index({ practitioner: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);