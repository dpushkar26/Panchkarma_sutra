// src/controllers/sessionController.js
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Session = require('../models/session.models');
const User = require('../models/user.models');
const Therapy = require('../models/therapy.models');
const { sendNotification } = require('../services/notificationService');
const { checkSlotAvailability, reallocateSlot, getPractitionerSchedule } = require('../services/slotService');

/**
 * Book a new therapy session
 */
const bookSession = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { therapyId, practitionerId, startTime, endTime, notes, preferences } = req.body;
    const patientId = req.user.id;

    // Validate therapy exists and is active
    const therapy = await Therapy.findById(therapyId);
    if (!therapy || !therapy.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Therapy not found or inactive'
      });
    }

    // Validate practitioner exists and is approved
    const practitioner = await User.findById(practitionerId);
    if (!practitioner || 
        practitioner.role !== 'practitioner' || 
        !practitioner.practitionerInfo.isApproved ||
        !practitioner.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Practitioner not found, not approved, or inactive'
      });
    }

    // Validate patient exists and get their details
    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient' || !patient.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found or inactive'
      });
    }

    // Validate session timing
    const sessionStart = new Date(startTime);
    const sessionEnd = new Date(endTime);
    const now = new Date();

    if (sessionStart <= now) {
      return res.status(400).json({
        success: false,
        message: 'Cannot book session in the past'
      });
    }

    if (sessionEnd <= sessionStart) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time'
      });
    }

    const sessionDuration = (sessionEnd - sessionStart) / (1000 * 60); // in minutes
    if (sessionDuration < therapy.duration * 0.8 || sessionDuration > therapy.duration * 1.2) {
      return res.status(400).json({
        success: false,
        message: `Session duration should be approximately ${therapy.duration} minutes`
      });
    }

    // Check if patient has any conflicting sessions
    const patientConflict = await Session.findOne({
      patient: patientId,
      status: { $in: ['scheduled', 'confirmed', 'in-progress'] },
      $or: [
        { startTime: { $lt: sessionEnd }, endTime: { $gt: sessionStart } }
      ]
    });

    if (patientConflict) {
      return res.status(409).json({
        success: false,
        message: 'You have a conflicting session at this time'
      });
    }

    // Check slot availability with practitioner
    const isAvailable = await checkSlotAvailability(practitionerId, sessionStart, sessionEnd);
    if (!isAvailable) {
      return res.status(409).json({
        success: false,
        message: 'Selected time slot is not available with this practitioner'
      });
    }

    // Create session with transaction to ensure atomicity
    const session = await mongoose.connection.transaction(async (mongoSession) => {
      const newSession = await Session.create([{
        therapy: therapyId,
        patient: patientId,
        practitioner: practitionerId,
        scheduledDate: sessionStart.toISOString().split('T')[0],
        startTime: sessionStart,
        endTime: sessionEnd,
        price: therapy.price,
        notes: { 
          preSession: notes || '',
          preferences: preferences || ''
        },
        status: 'scheduled',
        paymentStatus: 'pending'
      }], { session: mongoSession });

      return newSession[0];
    });

    // Populate session data for response
    await session.populate([
      { path: 'therapy', select: 'name sanskritName description duration price category' },
      { path: 'patient', select: 'profile email phone' },
      { path: 'practitioner', select: 'profile practitionerInfo.specialization' }
    ]);

    // Send confirmation notifications
    await Promise.all([
      // Patient confirmation
      sendNotification({
        recipient: patientId,
        type: 'booking_confirmation',
        title: 'Booking Confirmed! 🎉',
        message: `Your ${therapy.name} session with Dr. ${practitioner.profile.firstName} ${practitioner.profile.lastName} is confirmed for ${sessionStart.toLocaleDateString('en-IN')} at ${sessionStart.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
        data: { 
          sessionId: session._id,
          therapyName: therapy.name,
          practitionerName: practitioner.fullName,
          appointmentTime: sessionStart,
          actionUrl: `/sessions/${session._id}`,
          priority: 'high'
        },
        channels: { email: true, inApp: true, whatsapp: true }
      }),
      
      // Practitioner notification
      sendNotification({
        recipient: practitionerId,
        type: 'booking_confirmation',
        title: 'New Appointment Booked',
        message: `New ${therapy.name} session booked by ${patient.fullName} for ${sessionStart.toLocaleDateString('en-IN')} at ${sessionStart.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
        data: { 
          sessionId: session._id,
          patientName: patient.fullName,
          patientPhone: patient.profile.phone,
          therapyName: therapy.name,
          appointmentTime: sessionStart,
          actionUrl: `/sessions/${session._id}`
        },
        channels: { inApp: true, email: true }
      })
    ]);

    // Emit real-time update for slot booking
    req.io.emit('slotBooked', {
      sessionId: session._id,
      practitionerId,
      startTime: sessionStart,
      endTime: sessionEnd,
      therapyId: therapyId,
      patientName: patient.fullName
    });

    // Send to practitioner's room specifically
    req.io.to(`user_${practitionerId}`).emit('newBooking', {
      sessionId: session._id,
      patientName: patient.fullName,
      therapyName: therapy.name,
      startTime: sessionStart,
      endTime: sessionEnd
    });

    res.status(201).json({
      success: true,
      message: 'Session booked successfully',
      data: { 
        session,
        estimatedPreparationTime: 15, // minutes
        arrivalInstructions: 'Please arrive 15 minutes before your scheduled time'
      }
    });
  } catch (error) {
    console.error('Book session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Cancel a therapy session
 */
const cancelSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, cancellationType = 'patient' } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason must be at least 10 characters'
      });
    }

    const session = await Session.findById(id).populate(['therapy', 'patient', 'practitioner']);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Check authorization
    const isPatient = session.patient._id.toString() === userId;
    const isPractitioner = session.practitioner._id.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isPatient && !isPractitioner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this session'
      });
    }

    // Check if session can be cancelled
    if (['completed', 'cancelled', 'in-progress'].includes(session.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel ${session.status} session`
      });
    }

    // Check cancellation timing
    const now = new Date();
    const sessionStart = new Date(session.startTime);
    const hoursUntilSession = (sessionStart - now) / (1000 * 60 * 60);

    let cancellationFee = 0;
    let refundAmount = session.price;

    // Calculate cancellation charges based on timing
    if (hoursUntilSession < 2) {
      cancellationFee = session.price * 0.5; // 50% cancellation fee
      refundAmount = session.price * 0.5;
    } else if (hoursUntilSession < 24) {
      cancellationFee = session.price * 0.25; // 25% cancellation fee  
      refundAmount = session.price * 0.75;
    }

    // Update session in transaction
    await mongoose.connection.transaction(async (mongoSession) => {
      session.status = 'cancelled';
      session.cancellationReason = reason.trim();
      session.cancelledBy = userId;
      session.cancelledAt = now;
      session.cancellationFee = cancellationFee;
      session.refundAmount = refundAmount;
      session.cancellationType = cancellationType;

      await session.save({ session: mongoSession });
    });

    // Determine who to notify based on who cancelled
    const cancelledByName = isPatient ? session.patient.fullName : 
                           isPractitioner ? `Dr. ${session.practitioner.fullName}` : 'Admin';
    const notifyUserId = isPatient ? session.practitioner._id : session.patient._id;
    const notifyUserType = isPatient ? 'practitioner' : 'patient';

    // Send cancellation notifications
    await Promise.all([
      // Notify the other party
      sendNotification({
        recipient: notifyUserId,
        type: 'cancellation',
        title: 'Session Cancelled',
        message: `Your ${session.therapy.name} session scheduled for ${session.startTime.toLocaleDateString('en-IN')} at ${session.startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} has been cancelled by ${cancelledByName}.`,
        data: { 
          sessionId: session._id,
          cancelledBy: cancelledByName,
          reason: reason,
          refundAmount: notifyUserType === 'patient' ? refundAmount : undefined,
          actionUrl: `/sessions/${session._id}`
        },
        channels: { email: true, inApp: true, whatsapp: true }
      }),

      // Confirmation to the person who cancelled
      sendNotification({
        recipient: userId,
        type: 'cancellation',
        title: 'Cancellation Confirmed',
        message: `Your ${session.therapy.name} session has been cancelled successfully. ${refundAmount > 0 ? `Refund of ₹${refundAmount} will be processed within 3-5 business days.` : ''}`,
        data: { 
          sessionId: session._id,
          refundAmount: refundAmount,
          cancellationFee: cancellationFee,
          actionUrl: `/sessions/${session._id}`
        },
        channels: { email: true, inApp: true }
      })
    ]);

    // Perform slot reallocation
    try {
      await reallocateSlot(session);
    } catch (reallocationError) {
      console.error('Slot reallocation failed:', reallocationError);
      // Don't fail the cancellation if reallocation fails
    }

    // Emit real-time updates
    req.io.emit('slotAvailable', {
      practitionerId: session.practitioner._id,
      startTime: session.startTime,
      endTime: session.endTime,
      therapyId: session.therapy._id,
      therapyName: session.therapy.name
    });

    req.io.to(`user_${session.patient._id}`).emit('sessionCancelled', {
      sessionId: session._id,
      cancelledBy: cancelledByName,
      refundAmount
    });

    req.io.to(`user_${session.practitioner._id}`).emit('sessionCancelled', {
      sessionId: session._id,
      cancelledBy: cancelledByName,
      patientName: session.patient.fullName
    });

    res.json({
      success: true,
      message: 'Session cancelled successfully',
      data: { 
        session,
        cancellationFee,
        refundAmount,
        refundTimeline: refundAmount > 0 ? '3-5 business days' : null
      }
    });
  } catch (error) {
    console.error('Cancel session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get available slots for a practitioner
 */
const getAvailableSlots = async (req, res) => {
  try {
    const { practitionerId, date, therapyId, duration } = req.query;
    
    if (!practitionerId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Practitioner ID and date are required'
      });
    }

    // Validate practitioner
    const practitioner = await User.findById(practitionerId);
    if (!practitioner || practitioner.role !== 'practitioner' || !practitioner.practitionerInfo.isApproved) {
      return res.status(404).json({
        success: false,
        message: 'Practitioner not found or not approved'
      });
    }

    // Get therapy details for duration
    let therapyDuration = parseInt(duration) || 60; // default 60 minutes
    let therapy = null;
    
    if (therapyId) {
      therapy = await Therapy.findById(therapyId);
      if (therapy) {
        therapyDuration = therapy.duration;
      }
    }

    // Parse and validate date
    const targetDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (targetDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot get slots for past dates'
      });
    }

    // Set date boundaries
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get existing bookings for the practitioner on this date
    const bookedSessions = await Session.find({
      practitioner: practitionerId,
      startTime: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['scheduled', 'confirmed', 'in-progress'] }
    }).sort({ startTime: 1 });

    // Define working hours (can be made configurable per practitioner)
    const workingHours = {
      start: 9, // 9 AM
      end: 18,  // 6 PM
      lunchBreak: {
        start: 13, // 1 PM
        end: 14    // 2 PM
      }
    };

    // Generate available slots
    const availableSlots = [];
    const slotInterval = 30; // 30-minute intervals

    for (let hour = workingHours.start; hour < workingHours.end; hour++) {
      for (let minute = 0; minute < 60; minute += slotInterval) {
        // Skip lunch break
        if (hour >= workingHours.lunchBreak.start && hour < workingHours.lunchBreak.end) {
          continue;
        }

        const slotStart = new Date(targetDate);
        slotStart.setHours(hour, minute, 0, 0);
        
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + therapyDuration);

        // Skip if slot would extend beyond working hours
        if (slotEnd.getHours() >= workingHours.end || 
            (slotEnd.getHours() === workingHours.lunchBreak.start && slotEnd.getMinutes() > 0)) {
          continue;
        }

        // Skip if slot is in the past
        if (slotStart <= new Date()) {
          continue;
        }

        // Check for conflicts with existing bookings
        const hasConflict = bookedSessions.some(session => {
          return (slotStart < session.endTime && slotEnd > session.startTime);
        });

        if (!hasConflict) {
          availableSlots.push({
            startTime: slotStart,
            endTime: slotEnd,
            duration: therapyDuration,
            available: true,
            slotId: `${practitionerId}-${slotStart.getTime()}`
          });
        }
      }
    }

    // Get practitioner's existing schedule for context
    const schedule = await getPractitionerSchedule(practitionerId, startOfDay, endOfDay);

    res.json({
      success: true,
      data: { 
        availableSlots,
        date: targetDate.toISOString().split('T')[0],
        practitioner: {
          id: practitioner._id,
          name: practitioner.fullName,
          specializations: practitioner.practitionerInfo.specialization
        },
        therapy: therapy ? {
          id: therapy._id,
          name: therapy.name,
          duration: therapy.duration
        } : null,
        workingHours,
        existingSchedule: schedule,
        totalAvailableSlots: availableSlots.length
      }
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available slots',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get user's sessions (patient or practitioner)
 */
const getUserSessions = async (req, res) => {
  try {
    const { 
      status, 
      startDate, 
      endDate, 
      therapyId,
      page = 1, 
      limit = 10,
      sortBy = 'startTime',
      sortOrder = 'desc'
    } = req.query;
    
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role
    let query = {};
    if (userRole === 'patient') {
      query.patient = userId;
    } else if (userRole === 'practitioner') {
      query.practitioner = userId;
    } else if (userRole === 'admin') {
      // Admin can see all sessions, but typically filtered by other parameters
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Add filters
    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }

    if (therapyId) {
      query.therapy = therapyId;
    }

    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) {
        query.startTime.$gte = new Date(startDate);
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.startTime.$lte = endOfDay;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [sessions, totalCount] = await Promise.all([
      Session.find(query)
        .populate({
          path: 'therapy', 
          select: 'name sanskritName duration price category benefits'
        })
        .populate({
          path: 'patient', 
          select: 'profile.firstName profile.lastName email profile.phone healthHistory.allergies'
        })
        .populate({
          path: 'practitioner', 
          select: 'profile.firstName profile.lastName practitionerInfo.specialization practitionerInfo.experience'
        })
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      Session.countDocuments(query)
    ]);

    // Get session statistics
    const [statusCounts, upcomingSessions, recentFeedback] = await Promise.all([
      Session.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Session.countDocuments({
        ...query,
        startTime: { $gt: new Date() },
        status: { $in: ['scheduled', 'confirmed'] }
      }),
      Session.aggregate([
        { $match: { ...query, status: 'completed' } },
        { $lookup: { from: 'feedbacks', localField: '_id', foreignField: 'session', as: 'feedback' } },
        { $match: { 'feedback.0': { $exists: true } } },
        { $sort: { endTime: -1 } },
        { $limit: 5 },
        { $project: { 'feedback.rating.overall': 1, therapy: 1, endTime: 1 } }
      ])
    ]);

    const stats = {
      total: totalCount,
      upcoming: upcomingSessions,
      statusBreakdown: statusCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };

    res.json({
      success: true,
      data: {
        sessions,
        stats,
        recentFeedback,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasMore: skip + sessions.length < totalCount,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update session status (practitioner/admin only)
 */
const updateSessionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, vitals, symptoms, complications, recommendations } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const session = await Session.findById(id).populate(['therapy', 'patient', 'practitioner']);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Authorization check
    const isPractitioner = session.practitioner._id.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isPractitioner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned practitioner or admin can update session status'
      });
    }

    // Validate status transition
    const validTransitions = {
      'scheduled': ['confirmed', 'cancelled', 'no-show'],
      'confirmed': ['in-progress', 'cancelled', 'no-show'],
      'in-progress': ['completed', 'cancelled'],
      'completed': [], // Cannot change from completed
      'cancelled': [], // Cannot change from cancelled
      'no-show': []   // Cannot change from no-show
    };

    if (status && !validTransitions[session.status].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${session.status} to ${status}`
      });
    }

    // Update session fields
    const updates = {
      updatedAt: new Date()
    };

    if (status) {
      updates.status = status;
      
      // Set timestamps based on status
      if (status === 'in-progress' && !session.actualStartTime) {
        updates.actualStartTime = new Date();
      } else if (status === 'completed' && !session.actualEndTime) {
        updates.actualEndTime = new Date();
      }
    }

    // Update notes based on current status
    if (notes) {
      if (session.status === 'scheduled' || session.status === 'confirmed') {
        updates['notes.preSession'] = notes;
      } else if (session.status === 'in-progress' || status === 'in-progress') {
        updates['notes.duringSession'] = notes;
      } else if (status === 'completed') {
        updates['notes.postSession'] = notes;
      }
    }

    // Update vitals if provided
    if (vitals && Object.keys(vitals).length > 0) {
      updates.vitals = {
        ...session.vitals,
        ...vitals,
        recordedAt: new Date(),
        recordedBy: userId
      };
    }

    // Update symptoms if provided
    if (symptoms) {
      updates.symptoms = {
        ...session.symptoms,
        ...symptoms,
        recordedAt: new Date()
      };
    }

    // Add complications if any
    if (complications) {
      updates.complications = complications;
    }

    // Add practitioner recommendations
    if (recommendations) {
      updates.recommendations = recommendations;
    }

    // Perform update
    const updatedSession = await Session.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate(['therapy', 'patient', 'practitioner']);

    // Send notifications based on status change
    const notifications = [];

    if (status === 'confirmed') {
      notifications.push(sendNotification({
        recipient: session.patient._id,
        type: 'booking_confirmation',
        title: 'Appointment Confirmed',
        message: `Your ${session.therapy.name} appointment has been confirmed by Dr. ${session.practitioner.fullName}.`,
        data: { sessionId: session._id, actionUrl: `/sessions/${session._id}` },
        channels: { inApp: true, whatsapp: true }
      }));
    } else if (status === 'in-progress') {
      notifications.push(sendNotification({
        recipient: session.patient._id,
        type: 'treatment_complete',
        title: 'Session Started',
        message: `Your ${session.therapy.name} session has started. Relax and enjoy your treatment.`,
        data: { sessionId: session._id },
        channels: { inApp: true }
      }));
    } else if (status === 'completed') {
      notifications.push(
        sendNotification({
          recipient: session.patient._id,
          type: 'treatment_complete',
          title: 'Session Completed Successfully! ✨',
          message: `Your ${session.therapy.name} session is complete. Please take rest and follow post-treatment instructions. We'd love to hear your feedback!`,
          data: { 
            sessionId: session._id, 
            actionUrl: `/sessions/${session._id}/feedback`,
            therapyName: session.therapy.name
          },
          channels: { email: true, inApp: true, whatsapp: true }
        }),
        // Schedule feedback reminder for later
        sendNotification({
          recipient: session.patient._id,
          type: 'feedback_request',
          title: 'How was your experience?',
          message: `Please share your feedback about the ${session.therapy.name} session with Dr. ${session.practitioner.fullName}.`,
          data: { 
            sessionId: session._id, 
            actionUrl: `/sessions/${session._id}/feedback` 
          },
          channels: { inApp: true },
          scheduledFor: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours later
        })
      );
    }

    // Send all notifications
    await Promise.allSettled(notifications);

    // Emit real-time update
    req.io.to(`user_${session.patient._id}`).emit('sessionStatusUpdate', {
      sessionId: session._id,
      status: updatedSession.status,
      updatedBy: session.practitioner.fullName
    });

    req.io.to(`user_${session.practitioner._id}`).emit('sessionStatusUpdate', {
      sessionId: session._id,
      status: updatedSession.status,
      patientName: session.patient.fullName
    });

    res.json({
      success: true,
      message: 'Session updated successfully',
      data: { session: updatedSession }
    });
  } catch (error) {
    console.error('Update session status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get detailed session information
 */
const getSessionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const session = await Session.findById(id)
      .populate({
        path: 'therapy',
        select: 'name sanskritName description duration price benefits indications contraindications preInstructions postInstructions'
      })
      .populate({
        path: 'patient', 
        select: 'profile email profile.phone healthHistory preferences'
      })
      .populate({
        path: 'practitioner', 
        select: 'profile practitionerInfo email'
      })
      .populate({
        path: 'cancelledBy',
        select: 'profile.firstName profile.lastName role'
      });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Check access permissions
    const isPatient = session.patient._id.toString() === userId;
    const isPractitioner = session.practitioner._id.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isPatient && !isPractitioner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own sessions.'
      });
    }

    // Get related data
    const [feedback, paymentHistory, relatedSessions] = await Promise.all([
      // Get feedback for this session
      mongoose.model('Feedback').findOne({ session: id })
        .populate('patient', 'profile.firstName profile.lastName'),
      
      // Get payment history (if payment model exists)
      // For now, we'll use the session's payment status
      Promise.resolve([{
        amount: session.price,
        status: session.paymentStatus,
        date: session.createdAt,
        type: 'session_payment'
      }]),
      
      // Get other sessions between same patient and practitioner
      Session.find({
        patient: session.patient._id,
        practitioner: session.practitioner._id,
        _id: { $ne: session._id },
        status: { $in: ['completed', 'in-progress', 'scheduled', 'confirmed'] }
      })
      .populate('therapy', 'name')
      .sort({ startTime: -1 })
      .limit(5)
    ]);

    // Calculate session metrics
    const sessionMetrics = {
      actualDuration: session.actualStartTime && session.actualEndTime ? 
        Math.round((session.actualEndTime - session.actualStartTime) / (1000 * 60)) : null,
      scheduledDuration: session.therapy.duration,
      isOnTime: session.actualStartTime ? 
        (session.actualStartTime <= session.startTime) : null,
      timeUntilSession: session.startTime > new Date() ? 
        Math.round((session.startTime - new Date()) / (1000 * 60 * 60)) : null
    };

    // Prepare response data based on user role
    let responseData = {
      session,
      sessionMetrics,
      feedback,
      paymentHistory,
      relatedSessions: relatedSessions.map(s => ({
        id: s._id,
        therapy: s.therapy.name,
        date: s.startTime,
        status: s.status
      }))
    };

    // Add role-specific data
    if (isPractitioner || isAdmin) {
      // Practitioners get full patient health history
      responseData.patientHealthHistory = session.patient.healthHistory;
      responseData.sessionNotes = {
        pre: session.notes?.preSession,
        during: session.notes?.duringSession,
        post: session.notes?.postSession,
        preferences: session.notes?.preferences
      };
    } else if (isPatient) {
      // Patients get practitioner info and treatment guidelines
      responseData.practitionerInfo = {
        name: session.practitioner.fullName,
        specialization: session.practitioner.practitionerInfo.specialization,
        experience: session.practitioner.practitionerInfo.experience,
        qualifications: session.practitioner.practitionerInfo.qualifications
      };
      responseData.treatmentGuidelines = {
        preInstructions: session.therapy.preInstructions,
        postInstructions: session.therapy.postInstructions,
        benefits: session.therapy.benefits,
        contraindications: session.therapy.contraindications
      };
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Reschedule a session
 */
const rescheduleSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { newStartTime, newEndTime, reason } = req.body;
    const userId = req.user.id;

    if (!newStartTime || !newEndTime || !reason) {
      return res.status(400).json({
        success: false,
        message: 'New start time, end time, and reason are required'
      });
    }

    const session = await Session.findById(id).populate(['therapy', 'patient', 'practitioner']);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Check authorization
    const isPatient = session.patient._id.toString() === userId;
    const isPractitioner = session.practitioner._id.toString() === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isPatient && !isPractitioner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reschedule this session'
      });
    }

    // Check if session can be rescheduled
    if (!['scheduled', 'confirmed'].includes(session.status)) {
      return res.status(400).json({
        success: false,
        message: 'Can only reschedule scheduled or confirmed sessions'
      });
    }

    // Validate new timing
    const newStart = new Date(newStartTime);
    const newEnd = new Date(newEndTime);
    const now = new Date();

    if (newStart <= now) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reschedule to a past time'
      });
    }

    if (newEnd <= newStart) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time'
      });
    }

    // Check slot availability
    const isAvailable = await checkSlotAvailability(session.practitioner._id, newStart, newEnd, session._id);
    if (!isAvailable) {
      return res.status(409).json({
        success: false,
        message: 'New time slot is not available'
      });
    }

    // Check patient availability
    const patientConflict = await Session.findOne({
      patient: session.patient._id,
      _id: { $ne: session._id },
      status: { $in: ['scheduled', 'confirmed', 'in-progress'] },
      $or: [
        { startTime: { $lt: newEnd }, endTime: { $gt: newStart } }
      ]
    });

    if (patientConflict) {
      return res.status(409).json({
        success: false,
        message: 'Patient has a conflicting appointment at the new time'
      });
    }

    // Store original timing for notifications
    const originalStart = session.startTime;
    const originalEnd = session.endTime;

    // Update session
    await mongoose.connection.transaction(async (mongoSession) => {
      session.startTime = newStart;
      session.endTime = newEnd;
      session.scheduledDate = newStart.toISOString().split('T')[0];
      session.rescheduleHistory = session.rescheduleHistory || [];
      session.rescheduleHistory.push({
        originalStart,
        originalEnd,
        newStart,
        newEnd,
        reason,
        rescheduledBy: userId,
        rescheduledAt: new Date()
      });
      session.status = 'scheduled'; // Reset to scheduled after reschedule

      await session.save({ session: mongoSession });
    });

    // Send notifications
    const rescheduledBy = isPatient ? session.patient.fullName : 
                         isPractitioner ? `Dr. ${session.practitioner.fullName}` : 'Admin';
    const notifyUserId = isPatient ? session.practitioner._id : session.patient._id;

    await Promise.all([
      sendNotification({
        recipient: notifyUserId,
        type: 'rescheduling',
        title: 'Session Rescheduled',
        message: `Your ${session.therapy.name} session has been rescheduled by ${rescheduledBy} from ${originalStart.toLocaleDateString()} ${originalStart.toLocaleTimeString()} to ${newStart.toLocaleDateString()} ${newStart.toLocaleTimeString()}.`,
        data: {
          sessionId: session._id,
          originalTime: originalStart,
          newTime: newStart,
          reason,
          rescheduledBy,
          actionUrl: `/sessions/${session._id}`
        },
        channels: { email: true, inApp: true, whatsapp: true }
      }),

      sendNotification({
        recipient: userId,
        type: 'rescheduling',
        title: 'Reschedule Confirmed',
        message: `Your ${session.therapy.name} session has been successfully rescheduled to ${newStart.toLocaleDateString()} at ${newStart.toLocaleTimeString()}.`,
        data: {
          sessionId: session._id,
          newTime: newStart,
          actionUrl: `/sessions/${session._id}`
        },
        channels: { inApp: true, email: true }
      })
    ]);

    // Emit real-time updates
    req.io.emit('sessionRescheduled', {
      sessionId: session._id,
      originalTime: originalStart,
      newTime: newStart,
      practitionerId: session.practitioner._id
    });

    res.json({
      success: true,
      message: 'Session rescheduled successfully',
      data: { 
        session: await session.populate(['therapy', 'patient', 'practitioner']),
        originalTiming: { start: originalStart, end: originalEnd },
        newTiming: { start: newStart, end: newEnd }
      }
    });
  } catch (error) {
    console.error('Reschedule session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reschedule session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get practitioner's schedule for a date range
 */
const getPractitionerScheduleController = async (req, res) => {
  try {
    const { practitionerId, startDate, endDate, view = 'week' } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Authorization check
    if (userRole === 'practitioner' && practitionerId && practitionerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Can only view your own schedule'
      });
    }

    const targetPractitionerId = practitionerId || userId;

    if (userRole === 'patient' && !practitionerId) {
      return res.status(400).json({
        success: false,
        message: 'Practitioner ID is required'
      });
    }

    // Validate practitioner
    const practitioner = await User.findById(targetPractitionerId);
    if (!practitioner || practitioner.role !== 'practitioner') {
      return res.status(404).json({
        success: false,
        message: 'Practitioner not found'
      });
    }

    // Set date range based on view
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      const now = new Date();
      if (view === 'day') {
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
      } else if (view === 'week') {
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay()); // Start of week
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6); // End of week
        end.setHours(23, 59, 59, 999);
      } else if (view === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      }
    }

    // Get sessions in date range
    const sessions = await Session.find({
      practitioner: targetPractitionerId,
      startTime: { $gte: start, $lte: end }
    })
    .populate('therapy', 'name duration price category')
    .populate('patient', 'profile.firstName profile.lastName profile.phone')
    .sort({ startTime: 1 });

    // Group sessions by date
    const scheduleByDate = {};
    sessions.forEach(session => {
      const dateKey = session.startTime.toISOString().split('T')[0];
      if (!scheduleByDate[dateKey]) {
        scheduleByDate[dateKey] = [];
      }
      scheduleByDate[dateKey].push({
        id: session._id,
        therapy: session.therapy,
        patient: userRole !== 'patient' ? session.patient : null, // Hide patient info from other patients
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        price: session.price
      });
    });

    // Calculate statistics
    const stats = {
      totalSessions: sessions.length,
      confirmedSessions: sessions.filter(s => s.status === 'confirmed').length,
      completedSessions: sessions.filter(s => s.status === 'completed').length,
      cancelledSessions: sessions.filter(s => s.status === 'cancelled').length,
      totalRevenue: sessions
        .filter(s => s.status === 'completed')
        .reduce((sum, s) => sum + s.price, 0)
    };

    res.json({
      success: true,
      data: {
        practitioner: {
          id: practitioner._id,
          name: practitioner.fullName,
          specializations: practitioner.practitionerInfo.specialization
        },
        schedule: scheduleByDate,
        dateRange: { start, end },
        view,
        stats
      }
    });
  } catch (error) {
    console.error('Get practitioner schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch practitioner schedule',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get session statistics for dashboard
 */
const getSessionStatistics = async (req, res) => {
  try {
    const { period = 'month', practitionerId } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build base query
    let baseQuery = {};
    
    if (userRole === 'patient') {
      baseQuery.patient = userId;
    } else if (userRole === 'practitioner') {
      baseQuery.practitioner = practitionerId || userId;
    } else if (userRole === 'admin' && practitionerId) {
      baseQuery.practitioner = practitionerId;
    }

    // Set date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    baseQuery.createdAt = { $gte: startDate };

    // Get comprehensive statistics
    const [
      statusStats,
      therapyStats,
      revenueStats,
      trendData,
      upcomingStats
    ] = await Promise.all([
      // Status distribution
      Session.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),

      // Popular therapies
      Session.aggregate([
        { $match: baseQuery },
        { $lookup: { from: 'therapies', localField: 'therapy', foreignField: '_id', as: 'therapy' } },
        { $unwind: '$therapy' },
        { $group: { _id: '$therapy._id', name: { $first: '$therapy.name' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),

      // Revenue statistics
      Session.aggregate([
        { $match: { ...baseQuery, paymentStatus: 'paid' } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            averageSessionValue: { $avg: '$price' },
            sessionCount: { $sum: 1 }
          }
        }
      ]),

      // Trend data (weekly breakdown)
      Session.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              week: { $week: '$createdAt' }
            },
            sessionCount: { $sum: 1 },
            revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$price', 0] } }
          }
        },
        { $sort: { '_id.year': 1, '_id.week': 1 } }
      ]),

      // Upcoming sessions (next 7 days)
      Session.countDocuments({
        ...baseQuery,
        startTime: {
          $gte: now,
          $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        },
        status: { $in: ['scheduled', 'confirmed'] }
      })
    ]);

    const statistics = {
      period,
      dateRange: { start: startDate, end: now },
      statusDistribution: statusStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      popularTherapies: therapyStats,
      revenue: revenueStats[0] || { totalRevenue: 0, averageSessionValue: 0, sessionCount: 0 },
      trends: trendData,
      upcomingSessions: upcomingStats,
      totalSessions: statusStats.reduce((sum, stat) => sum + stat.count, 0)
    };

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('Get session statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  bookSession,
  cancelSession,
  getAvailableSlots,
  getUserSessions,
  updateSessionStatus,
  getSessionDetails,
  rescheduleSession,
  getPractitionerSchedule: getPractitionerScheduleController,
  getSessionStatistics
};