// src/routes/analyticsRoutes.js
const express = require('express');
const {
  getPatientAnalytics,
  getPractitionerAnalytics,
  getAdminAnalytics
} = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/patient/:id?', authenticate, getPatientAnalytics);
router.get('/practitioner/:id?', authenticate, getPractitionerAnalytics);
router.get('/admin', authenticate, getAdminAnalytics);

module.exports = router;