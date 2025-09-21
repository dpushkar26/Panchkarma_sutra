// src/models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'booking_confirmation',
      'appointment_reminder',
      'cancellation',
      'rescheduling',
      'slot_available',
      'feedback_request',
      'practitioner_approved',
      'payment_due',
      'treatment_complete'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    sessionId: mongoose.Schema.Types.ObjectId,
    therapyId: mongoose.Schema.Types.ObjectId,
    actionUrl: String,
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
  },
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false }
  },
  status: {
    inApp: { type: String, enum: ['pending', 'sent', 'read', 'failed'], default: 'pending' },
    email: { type: String, enum: ['pending', 'sent', 'delivered', 'failed'], default: 'pending' },
    whatsapp: { type: String, enum: ['pending', 'sent', 'delivered', 'read', 'failed'], default: 'pending' }
  },
  scheduledFor: Date,
  readAt: Date,
  expiresAt: Date
}, {
  timestamps: true
});

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1, scheduledFor: 1 });
notificationSchema.index({ status: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
