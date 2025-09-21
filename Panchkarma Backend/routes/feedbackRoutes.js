// src/routes/feedbackRoutes.js
const express = require('express');
const { body } = require('express-validator');
const {
  submitFeedback,
  getFeedback,
  getPractitionerFeedback
} = require('../controllers/feedback.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const feedbackValidation = [
  body('sessionId').isMongoId().withMessage('Valid session ID is required'),
  body('rating.overall').isInt({ min: 1, max: 5 }).withMessage('Overall rating must be between 1 and 5'),
  body('recommendation.wouldRecommend').isBoolean().withMessage('Recommendation must be true or false')
];

// Routes
router.post('/', authenticate, feedbackValidation, submitFeedback);
router.get('/session/:sessionId', authenticate, getFeedback);
router.get('/practitioner/:practitionerId?', authenticate, getPractitionerFeedback);

module.exports = router;

