// src/controllers/analyticsController.js
const Session = require('../models/session.models');
const Feedback = require('../models/feedbacke.models');
const User = require('../models/user.models');
const Therapy = require('../models/therapy.models');

const getPatientAnalytics = async (req, res) => {
  try {
    const patientId = req.params.id || req.user.id;
    
    // Verify access
    if (patientId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const [sessionStats, recentSessions, feedbackStats, healthProgress] = await Promise.all([
      // Session statistics
      Session.aggregate([
        { $match: { patient: mongoose.Types.ObjectId(patientId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalSpent: { $sum: '$price' }
          }
        }
      ]),
      
      // Recent sessions
      Session.find({ patient: patientId })
        .populate('therapy', 'name category')
        .populate('practitioner', 'profile.firstName profile.lastName')
        .sort({ startTime: -1 })
        .limit(10),
      
      // Feedback statistics
      Feedback.aggregate([
        { $match: { patient: mongoose.Types.ObjectId(patientId) } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating.overall' },
            totalFeedbacks: { $sum: 1 }
          }
        }
      ]),
      
      // Health progress tracking
      Session.aggregate([
        { $match: { patient: mongoose.Types.ObjectId(patientId), status: 'completed' } },
        { $sort: { startTime: 1 } },
        {
          $project: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$startTime' } },
            therapy: 1,
            'vitals.weight': 1,
            'vitals.bloodPressure': 1,
            'symptoms.after': 1
          }
        }
      ])
    ]);

    // Process session stats
    const processedSessionStats = {
      total: 0,
      completed: 0,
      cancelled: 0,
      upcoming: 0,
      totalSpent: 0
    };

    sessionStats.forEach(stat => {
      processedSessionStats.total += stat.count;
      processedSessionStats[stat._id] = stat.count;
      processedSessionStats.totalSpent += stat.totalSpent || 0;
    });

    // Get upcoming sessions count
    const upcomingSessions = await Session.countDocuments({
      patient: patientId,
      startTime: { $gt: new Date() },
      status: { $in: ['scheduled', 'confirmed'] }
    });

    processedSessionStats.upcoming = upcomingSessions;

    res.json({
      success: true,
      data: {
        sessionStats: processedSessionStats,
        recentSessions,
        feedbackStats: feedbackStats[0] || { avgRating: 0, totalFeedbacks: 0 },
        healthProgress,
        insights: generatePatientInsights(sessionStats, feedbackStats[0])
      }
    });
  } catch (error) {
    console.error('Get patient analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
};

const getPractitionerAnalytics = async (req, res) => {
  try {
    const practitionerId = req.params.id || req.user.id;
    
    // Verify access
    if (practitionerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const [sessionStats, revenueStats, feedbackStats, therapyStats, monthlyTrends] = await Promise.all([
      // Session statistics
      Session.aggregate([
        { $match: { practitioner: mongoose.Types.ObjectId(practitionerId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Revenue statistics
      Session.aggregate([
        { 
          $match: { 
            practitioner: mongoose.Types.ObjectId(practitionerId),
            paymentStatus: 'paid'
          } 
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            avgSessionPrice: { $avg: '$price' }
          }
        }
      ]),
      
      // Feedback statistics
      Feedback.aggregate([
        { $match: { practitioner: mongoose.Types.ObjectId(practitionerId) } },
        {
          $group: {
            _id: null,
            avgOverallRating: { $avg: '$rating.overall' },
            avgSkillRating: { $avg: '$rating.practitionerSkill' },
            avgCommunicationRating: { $avg: '$rating.communication' },
            totalFeedbacks: { $sum: 1 },
            recommendationRate: { $avg: { $cond: ['$recommendation.wouldRecommend', 1, 0] } }
          }
        }
      ]),
      
      // Therapy-wise statistics
      Session.aggregate([
        { $match: { practitioner: mongoose.Types.ObjectId(practitionerId) } },
        { $lookup: { from: 'therapies', localField: 'therapy', foreignField: '_id', as: 'therapy' } },
        { $unwind: '$therapy' },
        {
          $group: {
            _id: '$therapy._id',
            therapyName: { $first: '$therapy.name' },
            sessionCount: { $sum: 1 },
            revenue: { $sum: '$price' }
          }
        },
        { $sort: { sessionCount: -1 } }
      ]),
      
      // Monthly trends
      Session.aggregate([
        { 
          $match: { 
            practitioner: mongoose.Types.ObjectId(practitionerId),
            startTime: { $gte: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000) }
          } 
        },
        {
          $group: {
            _id: {
              year: { $year: '$startTime' },
              month: { $month: '$startTime' }
            },
            sessionCount: { $sum: 1 },
            revenue: { $sum: '$price' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        sessionStats: processSessionStats(sessionStats),
        revenueStats: revenueStats[0] || { totalRevenue: 0, avgSessionPrice: 0 },
        feedbackStats: feedbackStats[0] || { 
          avgOverallRating: 0, 
          totalFeedbacks: 0, 
          recommendationRate: 0 
        },
        therapyStats,
        monthlyTrends,
        insights: generatePractitionerInsights(sessionStats, feedbackStats[0])
      }
    });
  } catch (error) {
    console.error('Get practitioner analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
};

const getAdminAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const [userStats, sessionStats, revenueStats, therapyStats, feedbackStats] = await Promise.all([
      // User statistics
      User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } }
          }
        }
      ]),
      
      // Session statistics
      Session.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            revenue: { $sum: '$price' }
          }
        }
      ]),
      
      // Revenue trends
      Session.aggregate([
        { 
          $match: { 
            paymentStatus: 'paid',
            startTime: { $gte: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000) }
          } 
        },
        {
          $group: {
            _id: {
              year: { $year: '$startTime' },
              month: { $month: '$startTime' }
            },
            revenue: { $sum: '$price' },
            sessionCount: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      
      // Popular therapies
      Session.aggregate([
        { $lookup: { from: 'therapies', localField: 'therapy', foreignField: '_id', as: 'therapy' } },
        { $unwind: '$therapy' },
        {
          $group: {
            _id: '$therapy._id',
            therapyName: { $first: '$therapy.name' },
            category: { $first: '$therapy.category' },
            sessionCount: { $sum: 1 },
            revenue: { $sum: '$price' }
          }
        },
        { $sort: { sessionCount: -1 } },
        { $limit: 10 }
      ]),
      
      // Overall feedback statistics
      Feedback.aggregate([
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating.overall' },
            totalFeedbacks: { $sum: 1 },
            recommendationRate: { $avg: { $cond: ['$recommendation.wouldRecommend', 1, 0] } }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        userStats: processUserStats(userStats),
        sessionStats: processSessionStats(sessionStats),
        revenueStats,
        therapyStats,
        feedbackStats: feedbackStats[0] || { avgRating: 0, totalFeedbacks: 0, recommendationRate: 0 },
        insights: generateAdminInsights(userStats, sessionStats, feedbackStats[0])
      }
    });
  } catch (error) {
    console.error('Get admin analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
};

const processUserStats = (userStats) => {
  const stats = { total: 0, patients: 0, practitioners: 0, admins: 0, activeUsers: 0 };
  userStats.forEach(stat => {
    stats.total += stat.count;
    stats.activeUsers += stat.active;
    stats[stat._id + 's'] = stat.count;
  });
  return stats;
};

const processSessionStats = (sessionStats) => {
  const stats = { total: 0, completed: 0, cancelled: 0, scheduled: 0, 'in-progress': 0 };
  sessionStats.forEach(stat => {
    stats.total += stat.count;
    stats[stat._id] = stat.count;
  });
  return stats;
};

const generatePatientInsights = (sessionStats, feedbackStats) => {
  const insights = [];
  
  if (feedbackStats && feedbackStats.avgRating >= 4.5) {
    insights.push('Excellent treatment satisfaction! Your feedback shows great improvement.');
  }
  
  const completedSessions = sessionStats.find(s => s._id === 'completed')?.count || 0;
  if (completedSessions >= 10) {
    insights.push('Consistent treatment participation. Keep up the excellent work!');
  }
  
  return insights;
};

const generatePractitionerInsights = (sessionStats, feedbackStats) => {
  const insights = [];
  
  if (feedbackStats && feedbackStats.avgOverallRating >= 4.5) {
    insights.push('Outstanding patient satisfaction ratings!');
  }
  
  if (feedbackStats && feedbackStats.recommendationRate >= 0.9) {
    insights.push('Excellent recommendation rate from patients.');
  }
  
  const completedSessions = sessionStats.find(s => s._id === 'completed')?.count || 0;
  if (completedSessions >= 100) {
    insights.push('Highly experienced practitioner with extensive session history.');
  }
  
  return insights;
};

const generateAdminInsights = (userStats, sessionStats, feedbackStats) => {
  const insights = [];
  
  const totalUsers = userStats.reduce((sum, stat) => sum + stat.count, 0);
  const activeRate = userStats.reduce((sum, stat) => sum + stat.active, 0) / totalUsers;
  
  if (activeRate >= 0.8) {
    insights.push('High user engagement rate across the platform.');
  }
  
  if (feedbackStats && feedbackStats.avgRating >= 4.0) {
    insights.push('Overall platform satisfaction is excellent.');
  }
  
  return insights;
};

module.exports = {
  getPatientAnalytics,
  getPractitionerAnalytics,
  getAdminAnalytics
};
