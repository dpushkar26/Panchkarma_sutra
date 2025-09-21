// src/services/notificationService.js
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const Notification = require('../models/notification.models');
const User = require('../models/user.models');

// Initialize email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Initialize Twilio client
const twilioClient = process.env.TWILIO_ACCOUNT_SID ? 
  twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : 
  null;

const sendNotification = async ({
  recipient,
  type,
  title,
  message,
  data = {},
  channels = { inApp: true, email: false, whatsapp: false },
  scheduledFor = null
}) => {
  try {
    // Get recipient user data
    const user = await User.findById(recipient);
    if (!user) {
      throw new Error('Recipient not found');
    }

    // Respect user preferences
    const userPrefs = user.preferences.notifications;
    const finalChannels = {
      inApp: channels.inApp && userPrefs.inApp,
      email: channels.email && userPrefs.email,
      whatsapp: channels.whatsapp && userPrefs.whatsapp
    };

    // Create notification record
    const notification = await Notification.create({
      recipient,
      type,
      title,
      message,
      data,
      channels: finalChannels,
      scheduledFor: scheduledFor || new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });

    // Send immediately if not scheduled
    if (!scheduledFor || scheduledFor <= new Date()) {
      await processNotification(notification, user);
    }

    return notification;
  } catch (error) {
    console.error('Send notification error:', error);
    throw error;
  }
};

const processNotification = async (notification, user) => {
  const promises = [];

  // In-app notification (always processed)
  if (notification.channels.inApp) {
    promises.push(processInAppNotification(notification));
  }

  // Email notification
  if (notification.channels.email && emailTransporter) {
    promises.push(processEmailNotification(notification, user));
  }

  // WhatsApp notification
  if (notification.channels.whatsapp && twilioClient) {
    promises.push(processWhatsAppNotification(notification, user));
  }

  await Promise.allSettled(promises);
};

const processInAppNotification = async (notification) => {
  try {
    notification.status.inApp = 'sent';
    await notification.save();
    return true;
  } catch (error) {
    notification.status.inApp = 'failed';
    await notification.save();
    console.error('In-app notification error:', error);
    return false;
  }
};

const processEmailNotification = async (notification, user) => {
  try {
    const emailTemplate = getEmailTemplate(notification.type, {
      title: notification.title,
      message: notification.message,
      userName: user.fullName,
      actionUrl: notification.data.actionUrl
    });

    await emailTransporter.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@panchakarma.com',
      to: user.email,
      subject: notification.title,
      html: emailTemplate
    });

    notification.status.email = 'sent';
    await notification.save();
    return true;
  } catch (error) {
    notification.status.email = 'failed';
    await notification.save();
    console.error('Email notification error:', error);
    return false;
  }
};

const processWhatsAppNotification = async (notification, user) => {
  try {
    const whatsappTemplate = getWhatsAppTemplate(notification.type, {
      title: notification.title,
      message: notification.message,
      userName: user.fullName
    });

    await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:+91${user.profile.phone}`,
      body: whatsappTemplate
    });

    notification.status.whatsapp = 'sent';
    await notification.save();
    return true;
  } catch (error) {
    notification.status.whatsapp = 'failed';
    await notification.save();
    console.error('WhatsApp notification error:', error);
    return false;
  }
};

const getEmailTemplate = (type, data) => {
  const baseTemplate = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
        <h2 style="color: #2c5530; margin-bottom: 20px;">${data.title}</h2>
        <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">Dear ${data.userName},</p>
        <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">${data.message}</p>
        ${data.actionUrl ? `<a href="${data.actionUrl}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View Details</a>` : ''}
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
          <p style="color: #6c757d; font-size: 14px;">Best regards,<br>Panchakarma Management Team</p>
        </div>
      </div>
    </div>
  `;
  return baseTemplate;
};

const getWhatsAppTemplate = (type, data) => {
  return `🌿 *${data.title}*\n\nHello ${data.userName},\n\n${data.message}\n\nRegards,\nPanchakarma Management Team`;
};

const getUserNotifications = async (userId, { page = 1, limit = 20, unreadOnly = false } = {}) => {
  try {
    const query = { recipient: userId };
    if (unreadOnly) {
      query.readAt = { $exists: false };
    }

    const skip = (page - 1) * limit;

    const [notifications, totalCount, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Notification.countDocuments(query),
      Notification.countDocuments({ recipient: userId, readAt: { $exists: false } })
    ]);

    return {
      notifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        unreadCount,
        hasMore: skip + notifications.length < totalCount
      }
    };
  } catch (error) {
    console.error('Get user notifications error:', error);
    throw error;
  }
};

const markAsRead = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { readAt: new Date() },
      { new: true }
    );
    return notification;
  } catch (error) {
    console.error('Mark as read error:', error);
    throw error;
  }
};

module.exports = {
  sendNotification,
  processNotification,
  getUserNotifications,
  markAsRead
};