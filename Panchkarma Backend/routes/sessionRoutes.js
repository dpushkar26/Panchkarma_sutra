
const express = require('express');
const { body } = require('express-validator');
const {
  bookSession,
  cancelSession,
  getAvailableSlots,
  getUserSessions,
  updateSessionStatus,
  getSessionDetails,
  getPractitionerSchedule
} = require('../controllers/session.controller');
const { authenticate } = require('../middleware/auth');
const { rescheduleSession, getSessionStatistics } = require('../controllers/session.controller');

const router = express.Router();

// Validation rules
const bookSessionValidation = [
  body('therapyId').isMongoId().withMessage('Valid therapy ID is required'),
  body('practitionerId').isMongoId().withMessage('Valid practitioner ID is required'),
  body('startTime').isISO8601().withMessage('Valid start time is required'),
  body('endTime').isISO8601().withMessage('Valid end time is required')
];

// Routes
router.post('/book', authenticate, bookSessionValidation, bookSession);
router.patch('/:id/cancel', authenticate, cancelSession);
router.get('/available-slots', authenticate, getAvailableSlots);
router.get('/my-sessions', authenticate, getUserSessions);
router.patch('/:id/status', authenticate, updateSessionStatus);
router.get('/:id', authenticate, getSessionDetails);
router.post('/reschedule/:id',authenticate,rescheduleSession);
router.get('/practitioner/:id', authenticate, getPractitionerSchedule);
router.get('/analytics/:id',authenticate,getSessionStatistics)


module.exports = router;

