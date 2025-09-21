// src/services/slotService.js
const Session = require('../models/session.models');
const User = require('../models/user.models');
const { sendNotification } = require('./notificationService');

const checkSlotAvailability = async (practitionerId, startTime, endTime) => {
  try {
    const conflictingSession = await Session.findOne({
      practitioner: practitionerId,
      status: { $in: ['scheduled', 'confirmed', 'in-progress'] },
      $or: [
        { startTime: { $lt: endTime }, endTime: { $gt: startTime } }
      ]
    });

    return !conflictingSession;
  } catch (error) {
    console.error('Check slot availability error:', error);
    return false;
  }
};

const reallocateSlot = async (cancelledSession) => {
  try {
    // Find patients who might be interested in this slot
    // Look for patients who have had similar therapy sessions
    const interestedPatients = await Session.find({
      therapy: cancelledSession.therapy,
      patient: { $ne: cancelledSession.patient },
      status: 'completed',
      createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
    }).distinct('patient');

    // Send slot available notifications
    const notifications = interestedPatients.slice(0, 10).map(patientId => // Limit to 10 notifications
      sendNotification({
        recipient: patientId,
        type: 'slot_available',
        title: 'Therapy Slot Available',
        message: `A ${cancelledSession.therapy.name} slot is now available on ${cancelledSession.startTime.toLocaleDateString()} at ${cancelledSession.startTime.toLocaleTimeString()}`,
        data: {
          therapyId: cancelledSession.therapy,
          practitionerId: cancelledSession.practitioner,
          startTime: cancelledSession.startTime,
          endTime: cancelledSession.endTime,
          actionUrl: '/book-session'
        },
        channels: { inApp: true, email: false }
      })
    );

    await Promise.allSettled(notifications);

    console.log(`Slot reallocation notifications sent for session ${cancelledSession._id}`);
    return true;
  } catch (error) {
    console.error('Reallocate slot error:', error);
    return false;
  }
};

const getPractitionerSchedule = async (practitionerId, startDate, endDate) => {
  try {
    const sessions = await Session.find({
      practitioner: practitionerId,
      startTime: { $gte: startDate, $lte: endDate },
      status: { $in: ['scheduled', 'confirmed', 'in-progress'] }
    })
    .populate('therapy', 'name duration')
    .populate('patient', 'profile.firstName profile.lastName')
    .sort({ startTime: 1 });

    return sessions;
  } catch (error) {
    console.error('Get practitioner schedule error:', error);
    throw error;
  }
};

module.exports = {
  checkSlotAvailability,
  reallocateSlot,
  getPractitionerSchedule
};
