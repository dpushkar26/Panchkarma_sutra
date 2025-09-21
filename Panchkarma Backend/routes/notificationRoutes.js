// src/routes/notificationRoutes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getUserNotifications, markAsRead } = require('../services/notificationService');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await getUserNotifications(req.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      unreadOnly: unreadOnly === 'true'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
});

router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const notification = await markAsRead(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: { notification }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
});

module.exports = router;