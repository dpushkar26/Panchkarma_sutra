// src/routes/scheduleRoutes.js
const express = require('express');
const { body } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get doctor's schedule
router.get('/doctor/:doctorId', authenticate, async (req, res) => {
  try {
    const { doctorId } = req.params;
    
    // Simple in-memory storage for now - in production, use MongoDB
    // For demo purposes, return a default schedule structure
    const defaultSchedule = {
      _id: `schedule_${doctorId}`,
      doctorId: doctorId,
      weeklySchedule: {
        monday: { 
          isAvailable: true, 
          timeSlots: [{ startTime: "09:00", endTime: "17:00", isActive: true }] 
        },
        tuesday: { 
          isAvailable: true, 
          timeSlots: [{ startTime: "09:00", endTime: "17:00", isActive: true }] 
        },
        wednesday: { 
          isAvailable: true, 
          timeSlots: [{ startTime: "09:00", endTime: "17:00", isActive: true }] 
        },
        thursday: { 
          isAvailable: true, 
          timeSlots: [{ startTime: "09:00", endTime: "17:00", isActive: true }] 
        },
        friday: { 
          isAvailable: true, 
          timeSlots: [{ startTime: "09:00", endTime: "17:00", isActive: true }] 
        },
        saturday: { isAvailable: false, timeSlots: [] },
        sunday: { isAvailable: false, timeSlots: [] },
      },
      exceptions: [],
      defaultSlotDuration: 60,
      bufferTime: 15,
      advanceBookingDays: 30,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    res.json({
      success: true,
      data: {
        schedule: defaultSchedule
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch schedule',
      error: error.message
    });
  }
});

// Save/Update doctor's schedule
router.post('/doctor/:doctorId', authenticate, authorize(['practitioner']), async (req, res) => {
  try {
    const { doctorId } = req.params;
    const scheduleData = req.body;
    
    // Validate that the authenticated user is the same as the doctor
    if (req.user.id !== doctorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own schedule'
      });
    }

    // In a real application, you would save this to MongoDB
    // For now, we'll just return the updated schedule
    const updatedSchedule = {
      ...scheduleData,
      _id: `schedule_${doctorId}`,
      doctorId: doctorId,
      updatedAt: new Date()
    };

    res.json({
      success: true,
      message: 'Schedule updated successfully',
      data: {
        schedule: updatedSchedule
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to save schedule',
      error: error.message
    });
  }
});

// Get available slots for a doctor on a specific date (for patient booking)
router.get('/doctor/:doctorId/slots', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query; // YYYY-MM-DD format
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }

    // Get day of week
    const dateObj = new Date(date);
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = dayNames[dateObj.getDay()];

    // For demo, generate sample time slots based on a typical schedule
    const sampleSlots = [
      { slotId: '1', startTime: `${date}T09:00:00`, endTime: `${date}T10:00:00`, duration: 60, isAvailable: true },
      { slotId: '2', startTime: `${date}T10:00:00`, endTime: `${date}T11:00:00`, duration: 60, isAvailable: true },
      { slotId: '3', startTime: `${date}T11:00:00`, endTime: `${date}T12:00:00`, duration: 60, isAvailable: false },
      { slotId: '4', startTime: `${date}T14:00:00`, endTime: `${date}T15:00:00`, duration: 60, isAvailable: true },
      { slotId: '5', startTime: `${date}T15:00:00`, endTime: `${date}T16:00:00`, duration: 60, isAvailable: true },
      { slotId: '6', startTime: `${date}T16:00:00`, endTime: `${date}T17:00:00`, duration: 60, isAvailable: true },
    ];

    // Filter only available slots
    const availableSlots = sampleSlots.filter(slot => slot.isAvailable);

    res.json({
      success: true,
      data: {
        date,
        doctorId,
        dayOfWeek,
        availableSlots,
        totalSlots: availableSlots.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available slots',
      error: error.message
    });
  }
});

// Block/Unblock specific time slots
router.post('/doctor/:doctorId/slots/block', authenticate, authorize(['practitioner']), async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, startTime, endTime, reason } = req.body;
    
    // Validate that the authenticated user is the same as the doctor
    if (req.user.id !== doctorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only block your own time slots'
      });
    }

    // In a real application, you would save this to the database
    res.json({
      success: true,
      message: 'Time slot blocked successfully',
      data: {
        doctorId,
        date,
        startTime,
        endTime,
        reason: reason || 'Blocked by doctor',
        blockedAt: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to block time slot',
      error: error.message
    });
  }
});

module.exports = router;