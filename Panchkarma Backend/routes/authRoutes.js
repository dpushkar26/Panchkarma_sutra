// src/routes/authRoutes.js
const express = require('express');
const { body } = require('express-validator');
const { register, login, getProfile, updateProfile } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['patient', 'practitioner', 'admin']).withMessage('Invalid role'),
  body('profile.firstName').notEmpty().trim().withMessage('First name is required'),
  body('profile.lastName').notEmpty().trim().withMessage('Last name is required'),
  body('profile.phone').isMobilePhone('en-IN').withMessage('Valid Indian mobile number is required')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

const updateProfileValidation = [
  body('profile.firstName').optional().notEmpty().trim(),
  body('profile.lastName').optional().notEmpty().trim(),
  body('profile.phone').optional().isMobilePhone('en-IN')
];

// Routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/profile', authenticate, getProfile);
router.patch('/profile', authenticate, updateProfileValidation, updateProfile);

module.exports = router;