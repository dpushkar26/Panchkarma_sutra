// src/utils/cronJobs.js
const cron = require('node-cron');
const Session = require('../models/session.models');
const Notification = require('../models/notification.models');
const User = require('../models/user.models');
const { sendNotification } = require('../services/notificationService');

/**
 * Start all cron jobs for the Panchakarma Management System
 */
const startCronJobs = () => {
  console.log('🔄 Starting cron jobs...');

  // Send appointment reminders - runs every hour
  cron.schedule('0 * * * *', async () => {
    console.log('📅 Running appointment reminders job...');
    await sendAppointmentReminders();
  }, {
    name: 'appointment-reminders',
    timezone: 'Asia/Kolkata'
  });

  // Clean up expired notifications - runs daily at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('🧹 Running notification cleanup job...');
    await cleanupExpiredNotifications();
  }, {
    name: 'notification-cleanup',
    timezone: 'Asia/Kolkata'
  });

  // Update session statuses - runs every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('📊 Running session status update job...');
    await updateOverdueSessions();
  }, {
    name: 'session-status-update',
    timezone: 'Asia/Kolkata'
  });

  // Send daily summary reports - runs daily at 8 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('📈 Running daily summary job...');
    await sendDailySummaryReports();
  }, {
    name: 'daily-summary',
    timezone: 'Asia/Kolkata'
  });

  // Cleanup incomplete sessions - runs daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🔄 Running session cleanup job...');
    await cleanupIncompleteSessions();
  }, {
    name: 'session-cleanup',
    timezone: 'Asia/Kolkata'
  });

  // Send feedback reminders - runs daily at 6 PM
  cron.schedule('0 18 * * *', async () => {
    console.log('💬 Running feedback reminder job...');
    await sendFeedbackReminders();
  }, {
    name: 'feedback-reminders',
    timezone: 'Asia/Kolkata'
  });

  // Check and notify practitioners about schedule - runs daily at 7 AM
  cron.schedule('0 7 * * *', async () => {
    console.log('👨‍⚕️ Running practitioner schedule notifications...');
    await sendPractitionerScheduleReminders();
  }, {
    name: 'practitioner-schedule',
    timezone: 'Asia/Kolkata'
  });

  // Weekly analytics report - runs every Sunday at 9 AM
  cron.schedule('0 9 * * 0', async () => {
    console.log('📊 Running weekly analytics job...');
    await sendWeeklyAnalyticsReport();
  }, {
    name: 'weekly-analytics',
    timezone: 'Asia/Kolkata'
  });

  // Database maintenance - runs every Sunday at 3 AM
  cron.schedule('0 3 * * 0', async () => {
    console.log('🔧 Running database maintenance job...');
    await performDatabaseMaintenance();
  }, {
    name: 'database-maintenance',
    timezone: 'Asia/Kolkata'
  });

  console.log('✅ All cron jobs started successfully');
};

/**
 * Send appointment reminders at different intervals
 */
const sendAppointmentReminders = async () => {
  try {
    const now = new Date();
    let reminderCount = 0;

    // =====================
    // 24-HOUR REMINDERS
    // =====================
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStart = new Date(tomorrow);
    tomorrowStart.setHours(tomorrow.getHours() - 1); // 1 hour window
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(tomorrow.getHours() + 1);

    const sessions24h = await Session.find({
      startTime: { $gte: tomorrowStart, $lte: tomorrowEnd },
      status: { $in: ['scheduled', 'confirmed'] },
      'reminders.sent24h': false
    }).populate(['therapy', 'patient', 'practitioner']);

    for (const session of sessions24h) {
      try {
        await sendNotification({
          recipient: session.patient._id,
          type: 'appointment_reminder',
          title: '24-Hour Appointment Reminder',
          message: `Your ${session.therapy.name} appointment with Dr. ${session.practitioner.profile.firstName} ${session.practitioner.profile.lastName} is scheduled for tomorrow at ${session.startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
          data: {
            sessionId: session._id,
            therapyName: session.therapy.name,
            practitionerName: session.practitioner.fullName,
            appointmentTime: session.startTime,
            actionUrl: `/sessions/${session._id}`,
            priority: 'medium'
          },
          channels: { email: true, inApp: true, whatsapp: true }
        });

        // Update reminder status
        session.reminders.sent24h = true;
        await session.save();
        reminderCount++;

        console.log(`✅ 24h reminder sent for session ${session._id}`);
      } catch (error) {
        console.error(`❌ Failed to send 24h reminder for session ${session._id}:`, error.message);
      }
    }

    // =====================
    // 2-HOUR REMINDERS
    // =====================
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const twoHoursStart = new Date(twoHoursLater);
    twoHoursStart.setMinutes(twoHoursLater.getMinutes() - 30); // 30-minute window
    const twoHoursEnd = new Date(twoHoursLater);
    twoHoursEnd.setMinutes(twoHoursLater.getMinutes() + 30);

    const sessions2h = await Session.find({
      startTime: { $gte: twoHoursStart, $lte: twoHoursEnd },
      status: { $in: ['scheduled', 'confirmed'] },
      'reminders.sent2h': false
    }).populate(['therapy', 'patient', 'practitioner']);

    for (const session of sessions2h) {
      try {
        await sendNotification({
          recipient: session.patient._id,
          type: 'appointment_reminder',
          title: '2-Hour Appointment Reminder',
          message: `Your ${session.therapy.name} appointment is in 2 hours. Please arrive 15 minutes early for preparation. Location: ${session.practitioner.profile.address?.street || 'Main Clinic'}`,
          data: {
            sessionId: session._id,
            therapyName: session.therapy.name,
            practitionerName: session.practitioner.fullName,
            appointmentTime: session.startTime,
            actionUrl: `/sessions/${session._id}`,
            priority: 'high'
          },
          channels: { inApp: true, whatsapp: true }
        });

        session.reminders.sent2h = true;
        await session.save();
        reminderCount++;

        console.log(`✅ 2h reminder sent for session ${session._id}`);
      } catch (error) {
        console.error(`❌ Failed to send 2h reminder for session ${session._id}:`, error.message);
      }
    }

    // =====================
    // 30-MINUTE REMINDERS
    // =====================
    const thirtyMinLater = new Date(now.getTime() + 30 * 60 * 1000);
    const thirtyMinStart = new Date(thirtyMinLater);
    thirtyMinStart.setMinutes(thirtyMinLater.getMinutes() - 15); // 15-minute window
    const thirtyMinEnd = new Date(thirtyMinLater);
    thirtyMinEnd.setMinutes(thirtyMinLater.getMinutes() + 15);

    const sessions30min = await Session.find({
      startTime: { $gte: thirtyMinStart, $lte: thirtyMinEnd },
      status: { $in: ['scheduled', 'confirmed'] },
      'reminders.sent30min': false
    }).populate(['therapy', 'patient', 'practitioner']);

    for (const session of sessions30min) {
      try {
        await sendNotification({
          recipient: session.patient._id,
          type: 'appointment_reminder',
          title: '🚨 Final Reminder - 30 Minutes',
          message: `Your ${session.therapy.name} appointment starts in 30 minutes! Please head to the clinic now. Dr. ${session.practitioner.profile.firstName} is ready for your session.`,
          data: {
            sessionId: session._id,
            therapyName: session.therapy.name,
            practitionerName: session.practitioner.fullName,
            appointmentTime: session.startTime,
            actionUrl: `/sessions/${session._id}`,
            priority: 'high'
          },
          channels: { inApp: true, whatsapp: true }
        });

        session.reminders.sent30min = true;
        await session.save();
        reminderCount++;

        console.log(`✅ 30min reminder sent for session ${session._id}`);
      } catch (error) {
        console.error(`❌ Failed to send 30min reminder for session ${session._id}:`, error.message);
      }
    }

    console.log(`📅 Sent ${reminderCount} appointment reminders successfully`);
  } catch (error) {
    console.error('❌ Error in sendAppointmentReminders:', error);
  }
};

/**
 * Clean up expired notifications from the database
 */
const cleanupExpiredNotifications = async () => {
  try {
    const result = await Notification.deleteMany({
      expiresAt: { $lt: new Date() }
    });

    // Also cleanup very old read notifications (older than 90 days)
    const oldReadResult = await Notification.deleteMany({
      readAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      readAt: { $exists: true }
    });

    console.log(`🧹 Cleaned up ${result.deletedCount} expired notifications and ${oldReadResult.deletedCount} old read notifications`);
  } catch (error) {
    console.error('❌ Error in cleanupExpiredNotifications:', error);
  }
};

/**
 * Update overdue session statuses
 */
const updateOverdueSessions = async () => {
  try {
    const now = new Date();
    let updatedCount = 0;

    // Mark sessions as no-show if they're 30 minutes past start time and still scheduled
    const noShowResult = await Session.updateMany(
      {
        startTime: { $lt: new Date(now.getTime() - 30 * 60 * 1000) },
        status: { $in: ['scheduled', 'confirmed'] }
      },
      { 
        $set: { 
          status: 'no-show',
          updatedAt: now
        } 
      }
    );
    updatedCount += noShowResult.modifiedCount;

    // Auto-complete sessions that are past their end time and marked as in-progress
    const autoCompleteResult = await Session.updateMany(
      {
        endTime: { $lt: new Date(now.getTime() - 15 * 60 * 1000) }, // 15 minutes buffer
        status: 'in-progress'
      },
      { 
        $set: { 
          status: 'completed',
          updatedAt: now
        } 
      }
    );
    updatedCount += autoCompleteResult.modifiedCount;

    if (updatedCount > 0) {
      // Send notifications for no-shows and auto-completed sessions
      const updatedSessions = await Session.find({
        $or: [
          { status: 'no-show', updatedAt: { $gte: now } },
          { status: 'completed', updatedAt: { $gte: now } }
        ]
      }).populate(['patient', 'practitioner', 'therapy']);

      for (const session of updatedSessions) {
        if (session.status === 'no-show') {
          // Notify practitioner about no-show
          await sendNotification({
            recipient: session.practitioner._id,
            type: 'cancellation',
            title: 'Patient No-Show',
            message: `Patient ${session.patient.fullName} did not attend the ${session.therapy.name} session scheduled at ${session.startTime.toLocaleString()}.`,
            data: { sessionId: session._id },
            channels: { inApp: true }
          });
        } else if (session.status === 'completed') {
          // Send completion notification and feedback request
          await sendNotification({
            recipient: session.patient._id,
            type: 'treatment_complete',
            title: 'Session Completed',
            message: `Your ${session.therapy.name} session has been completed. How was your experience?`,
            data: { 
              sessionId: session._id,
              actionUrl: `/sessions/${session._id}/feedback`
            },
            channels: { inApp: true, email: true }
          });
        }
      }
    }

    console.log(`📊 Updated ${updatedCount} session statuses (${noShowResult.modifiedCount} no-shows, ${autoCompleteResult.modifiedCount} auto-completed)`);
  } catch (error) {
    console.error('❌ Error in updateOverdueSessions:', error);
  }
};

/**
 * Send daily summary reports to practitioners
 */
const sendDailySummaryReports = async () => {
  try {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all approved practitioners
    const practitioners = await User.find({
      role: 'practitioner',
      'practitionerInfo.isApproved': true,
      isActive: true
    });

    for (const practitioner of practitioners) {
      try {
        // Get today's sessions for this practitioner
        const todaysSessions = await Session.find({
          practitioner: practitioner._id,
          startTime: { $gte: startOfDay, $lte: endOfDay }
        }).populate(['patient', 'therapy']).sort({ startTime: 1 });

        if (todaysSessions.length === 0) {
          continue; // Skip if no sessions today
        }

        const upcomingSessions = todaysSessions.filter(s => s.status === 'scheduled' || s.status === 'confirmed');
        const completedSessions = todaysSessions.filter(s => s.status === 'completed');
        const cancelledSessions = todaysSessions.filter(s => s.status === 'cancelled');

        let summaryMessage = `📋 Daily Summary for ${today.toLocaleDateString('en-IN')}\n\n`;
        summaryMessage += `📊 Total Sessions: ${todaysSessions.length}\n`;
        summaryMessage += `✅ Completed: ${completedSessions.length}\n`;
        summaryMessage += `⏳ Upcoming: ${upcomingSessions.length}\n`;
        summaryMessage += `❌ Cancelled: ${cancelledSessions.length}\n\n`;

        if (upcomingSessions.length > 0) {
          summaryMessage += `🕐 Today's Upcoming Sessions:\n`;
          upcomingSessions.forEach(session => {
            summaryMessage += `• ${session.startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - ${session.therapy.name} with ${session.patient.profile.firstName} ${session.patient.profile.lastName}\n`;
          });
        }

        await sendNotification({
          recipient: practitioner._id,
          type: 'appointment_reminder',
          title: 'Daily Schedule Summary',
          message: summaryMessage,
          data: {
            date: today.toISOString(),
            totalSessions: todaysSessions.length,
            completed: completedSessions.length,
            upcoming: upcomingSessions.length,
            cancelled: cancelledSessions.length,
            actionUrl: '/dashboard/practitioner'
          },
          channels: { inApp: true, email: true }
        });

        console.log(`✅ Daily summary sent to ${practitioner.fullName}`);
      } catch (error) {
        console.error(`❌ Failed to send daily summary to ${practitioner.fullName}:`, error.message);
      }
    }

    console.log(`📈 Daily summary reports sent to ${practitioners.length} practitioners`);
  } catch (error) {
    console.error('❌ Error in sendDailySummaryReports:', error);
  }
};

/**
 * Cleanup incomplete or abandoned sessions
 */
const cleanupIncompleteSessions = async () => {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    
    // Find sessions that are stuck in 'in-progress' status for more than 3 days
    const stuckSessions = await Session.find({
      status: 'in-progress',
      startTime: { $lt: threeDaysAgo }
    });

    if (stuckSessions.length > 0) {
      await Session.updateMany(
        { _id: { $in: stuckSessions.map(s => s._id) } },
        { 
          $set: { 
            status: 'completed', // Assume completed if stuck for 3 days
            notes: {
              ...stuckSessions[0].notes,
              postSession: 'Auto-completed by system due to extended duration'
            },
            updatedAt: new Date()
          } 
        }
      );

      console.log(`🔄 Auto-completed ${stuckSessions.length} stuck sessions`);
    }

    // Remove draft/incomplete sessions older than 24 hours
    const abandonedSessions = await Session.deleteMany({
      status: { $in: ['draft', 'incomplete'] },
      createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    console.log(`🧹 Removed ${abandonedSessions.deletedCount} abandoned sessions`);
  } catch (error) {
    console.error('❌ Error in cleanupIncompleteSessions:', error);
  }
};

/**
 * Send feedback reminders to patients
 */
const sendFeedbackReminders = async () => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    // Find completed sessions without feedback
    const sessionsWithoutFeedback = await Session.aggregate([
      {
        $match: {
          status: 'completed',
          endTime: { $gte: threeDaysAgo, $lte: oneDayAgo }
        }
      },
      {
        $lookup: {
          from: 'feedbacks',
          localField: '_id',
          foreignField: 'session',
          as: 'feedback'
        }
      },
      {
        $match: { 'feedback.0': { $exists: false } }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'patient',
          foreignField: '_id',
          as: 'patient'
        }
      },
      {
        $lookup: {
          from: 'therapies',
          localField: 'therapy',
          foreignField: '_id',
          as: 'therapy'
        }
      },
      { $unwind: '$patient' },
      { $unwind: '$therapy' }
    ]);

    for (const session of sessionsWithoutFeedback) {
      try {
        await sendNotification({
          recipient: session.patient._id,
          type: 'feedback_request',
          title: 'Share Your Experience',
          message: `How was your ${session.therapy.name} session? Your feedback helps us improve our services and assists other patients in making informed decisions.`,
          data: {
            sessionId: session._id,
            therapyName: session.therapy.name,
            actionUrl: `/sessions/${session._id}/feedback`,
            priority: 'medium'
          },
          channels: { inApp: true, email: true }
        });

        console.log(`✅ Feedback reminder sent for session ${session._id}`);
      } catch (error) {
        console.error(`❌ Failed to send feedback reminder for session ${session._id}:`, error.message);
      }
    }

    console.log(`💬 Sent ${sessionsWithoutFeedback.length} feedback reminders`);
  } catch (error) {
    console.error('❌ Error in sendFeedbackReminders:', error);
  }
};

/**
 * Send schedule reminders to practitioners
 */
const sendPractitionerScheduleReminders = async () => {
  try {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const practitioners = await User.find({
      role: 'practitioner',
      'practitionerInfo.isApproved': true,
      isActive: true
    });

    for (const practitioner of practitioners) {
      const todaysSessions = await Session.find({
        practitioner: practitioner._id,
        startTime: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['scheduled', 'confirmed'] }
      }).populate(['patient', 'therapy']).sort({ startTime: 1 });

      if (todaysSessions.length > 0) {
        let scheduleMessage = `👨‍⚕️ Today's Schedule (${today.toLocaleDateString('en-IN')}):\n\n`;
        
        todaysSessions.forEach((session, index) => {
          const time = session.startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          const duration = session.therapy.duration;
          scheduleMessage += `${index + 1}. ${time} (${duration}min) - ${session.therapy.name}\n`;
          scheduleMessage += `   Patient: ${session.patient.fullName}\n`;
          scheduleMessage += `   Phone: ${session.patient.profile.phone}\n\n`;
        });

        scheduleMessage += `📞 Contact clinic for any schedule changes.`;

        await sendNotification({
          recipient: practitioner._id,
          type: 'appointment_reminder',
          title: `Today's Schedule - ${todaysSessions.length} Appointments`,
          message: scheduleMessage,
          data: {
            date: today.toISOString(),
            sessionCount: todaysSessions.length,
            actionUrl: '/dashboard/practitioner/schedule'
          },
          channels: { inApp: true, email: true }
        });
      }
    }

    console.log(`👨‍⚕️ Schedule reminders sent to practitioners`);
  } catch (error) {
    console.error('❌ Error in sendPractitionerScheduleReminders:', error);
  }
};

/**
 * Send weekly analytics report to admins
 */
const sendWeeklyAnalyticsReport = async () => {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get admin users
    const admins = await User.find({ role: 'admin', isActive: true });

    // Generate analytics data
    const [sessionStats, userStats, revenueStats] = await Promise.all([
      // Session statistics
      Session.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            revenue: { $sum: '$price' }
          }
        }
      ]),

      // User registration statistics
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ]),

      // Revenue statistics
      Session.aggregate([
        {
          $match: {
            paymentStatus: 'paid',
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            sessionCount: { $sum: 1 }
          }
        }
      ])
    ]);

    const totalSessions = sessionStats.reduce((sum, stat) => sum + stat.count, 0);
    const totalRevenue = revenueStats[0]?.totalRevenue || 0;
    const newUsers = userStats.reduce((sum, stat) => sum + stat.count, 0);

    let reportMessage = `📊 Weekly Analytics Report\n`;
    reportMessage += `📅 Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}\n\n`;
    reportMessage += `📈 Key Metrics:\n`;
    reportMessage += `• Total Sessions: ${totalSessions}\n`;
    reportMessage += `• Revenue Generated: ₹${totalRevenue.toLocaleString('en-IN')}\n`;
    reportMessage += `• New User Registrations: ${newUsers}\n\n`;
    reportMessage += `📋 Session Breakdown:\n`;
    
    sessionStats.forEach(stat => {
      reportMessage += `• ${stat._id}: ${stat.count} sessions\n`;
    });

    for (const admin of admins) {
      await sendNotification({
        recipient: admin._id,
        type: 'treatment_complete',
        title: 'Weekly Analytics Report',
        message: reportMessage,
        data: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          totalSessions,
          totalRevenue,
          newUsers,
          actionUrl: '/admin/analytics'
        },
        channels: { inApp: true, email: true }
      });
    }

    console.log(`📊 Weekly analytics report sent to ${admins.length} admins`);
  } catch (error) {
    console.error('❌ Error in sendWeeklyAnalyticsReport:', error);
  }
};

/**
 * Perform database maintenance tasks
 */
const performDatabaseMaintenance = async () => {
  try {
    let maintenanceCount = 0;

    // Update user last activity
    const inactiveUsers = await User.updateMany(
      { 
        lastLogin: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        isActive: true
      },
      { 
        $set: { 
          isActive: false,
          updatedAt: new Date()
        } 
      }
    );
    maintenanceCount += inactiveUsers.modifiedCount;

    // Archive old completed sessions (older than 2 years)
    const oldSessions = await Session.updateMany(
      {
        status: 'completed',
        endTime: { $lt: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) },
        archived: { $ne: true }
      },
      {
        $set: { 
          archived: true,
          updatedAt: new Date()
        }
      }
    );
    maintenanceCount += oldSessions.modifiedCount;

    // Remove very old cancelled sessions (older than 1 year)
    const deletedSessions = await Session.deleteMany({
      status: 'cancelled',
      cancelledAt: { $lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
    });
    maintenanceCount += deletedSessions.deletedCount;

    console.log(`🔧 Database maintenance completed: ${maintenanceCount} records updated/archived`);
    console.log(`  - Deactivated ${inactiveUsers.modifiedCount} inactive users`);
    console.log(`  - Archived ${oldSessions.modifiedCount} old sessions`);
    console.log(`  - Deleted ${deletedSessions.deletedCount} old cancelled sessions`);

  } catch (error) {
    console.error('❌ Error in performDatabaseMaintenance:', error);
  }
};

/**
 * Stop all cron jobs
 */
const stopCronJobs = () => {
  const tasks = cron.getTasks();
  tasks.forEach((task, name) => {
    task.destroy();
    console.log(`⏹️ Stopped cron job: ${name}`);
  });
  console.log('🛑 All cron jobs stopped');
};

/**
 * Get status of all cron jobs
 */
const getCronJobStatus = () => {
  const tasks = cron.getTasks();
  const status = [];
  
  tasks.forEach((task, name) => {
    status.push({
      name,
      running: task.running,
      scheduled: task.scheduled,
      timezone: task.options?.timezone || 'UTC'
    });
  });
  
  return status;
};

// Export individual functions for testing
module.exports = {
  startCronJobs,
  stopCronJobs,
  getCronJobStatus,
  sendAppointmentReminders,
  cleanupExpiredNotifications,
  updateOverdueSessions,
  sendDailySummaryReports,
  cleanupIncompleteSessions,
  sendFeedbackReminders,
  sendPractitionerScheduleReminders,
  sendWeeklyAnalyticsReport,
  performDatabaseMaintenance
};