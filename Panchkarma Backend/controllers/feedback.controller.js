const { validationResult } = require('express-validator');
const Feedback = require('../models/feedbacke.models');
const Session = require('../models/session.models');
const { sendNotification } = require('../services/notificationService');

const submitFeedback = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { sessionId, rating, comments, symptoms, recommendation, followUp, isAnonymous } = req.body;
    const patientId = req.user.id;

    // Validate session exists and belongs to patient
    const session = await Session.findById(sessionId).populate('practitioner');
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    if (session.patient.toString() !== patientId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to provide feedback for this session'
      });
    }

    if (session.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only provide feedback for completed sessions'
      });
    }

    // Check if feedback already exists
    const existingFeedback = await Feedback.findOne({ session: sessionId });
    if (existingFeedback) {
      return res.status(400).json({
        success: false,
        message: 'Feedback already submitted for this session'
      });
    }

    // Create feedback
    const feedback = await Feedback.create({
      session: sessionId,
      patient: patientId,
      practitioner: session.practitioner._id,
      rating,
      comments,
      symptoms,
      recommendation,
      followUp,
      isAnonymous
    });

    await feedback.populate(['session', 'patient', 'practitioner']);

    // Send notification to practitioner
    await sendNotification({
      recipient: session.practitioner._id,
      type: 'feedback_request',
      title: 'New Feedback Received',
      message: `${isAnonymous ? 'A patient' : feedback.patient.fullName} has provided feedback for your session.`,
      data: { 
        sessionId: sessionId, 
        feedbackId: feedback._id,
        actionUrl: `/feedback/${feedback._id}` 
      },
      channels: { inApp: true }
    });

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: { feedback }
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
      error: error.message
    });
  }
};

const getFeedback = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const feedback = await Feedback.findOne({ session: sessionId })
      .populate('session')
      .populate('patient', 'profile')
      .populate('practitioner', 'profile');

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }

    // Check access permissions
    const hasAccess = feedback.patient._id.toString() === userId || 
                     feedback.practitioner._id.toString() === userId || 
                     req.user.role === 'admin';

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: { feedback }
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback',
      error: error.message
    });
  }
};

const getPractitionerFeedback = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const practitionerId = req.user.role === 'practitioner' ? req.user.id : req.params.practitionerId;

    const skip = (page - 1) * limit;

    const [feedback, totalCount] = await Promise.all([
      Feedback.find({ practitioner: practitionerId })
        .populate('session', 'therapy startTime')
        .populate('patient', 'profile.firstName profile.lastName')
        .populate('practitioner', 'profile.firstName profile.lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Feedback.countDocuments({ practitioner: practitionerId })
    ]);

    // Calculate average ratings
    const ratingStats = await Feedback.aggregate([
      { $match: { practitioner: mongoose.Types.ObjectId(practitionerId) } },
      {
        $group: {
          _id: null,
          avgOverall: { $avg: '$rating.overall' },
          avgSkill: { $avg: '$rating.practitionerSkill' },
          avgCleanliness: { $avg: '$rating.facilityClanliness' },
          avgCommunication: { $avg: '$rating.communication' },
          avgEffectiveness: { $avg: '$rating.effectiveness' },
          totalFeedbacks: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        feedback,
        stats: ratingStats[0] || {
          avgOverall: 0,
          avgSkill: 0,
          avgCleanliness: 0,
          avgCommunication: 0,
          avgEffectiveness: 0,
          totalFeedbacks: 0
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasMore: skip + feedback.length < totalCount
        }
      }
    });
  } catch (error) {
    console.error('Get practitioner feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch practitioner feedback',
      error: error.message
    });
  }
};

module.exports = {
  submitFeedback,
  getFeedback,
  getPractitionerFeedback
};
