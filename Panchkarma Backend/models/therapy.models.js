// src/models/Therapy.js
const mongoose = require('mongoose');

const therapySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  sanskritName: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['purification', 'rejuvenation', 'therapeutic', 'preventive']
  },
  duration: {
    type: Number, // in minutes
    required: true,
    min: 15
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  benefits: [String],
  indications: [String],
  contraindications: [String],
  preInstructions: [String],
  postInstructions: [String],
  requiredEquipment: [String],
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

therapySchema.index({ name: 'text', description: 'text' });
therapySchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('Therapy', therapySchema);