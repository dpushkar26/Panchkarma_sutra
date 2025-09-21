// src/routes/therapyRoutes.js
const express = require('express');
const { body } = require('express-validator');
const Therapy = require('../models/therapy.models');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get all active therapies
router.get('/', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const query = { isActive: true };

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$text = { $search: search };
    }

    const skip = (page - 1) * limit;

    const [therapies, totalCount] = await Promise.all([
      Therapy.find(query)
        .populate('createdBy', 'profile.firstName profile.lastName')
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Therapy.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        therapies,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasMore: skip + therapies.length < totalCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch therapies',
      error: error.message
    });
  }
});

// Get therapy by ID
router.get('/:id', async (req, res) => {
  try {
    const therapy = await Therapy.findById(req.params.id)
      .populate('createdBy', 'profile.firstName profile.lastName');

    if (!therapy) {
      return res.status(404).json({
        success: false,
        message: 'Therapy not found'
      });
    }

    res.json({
      success: true,
      data: { therapy }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch therapy',
      error: error.message
    });
  }
});

// Create therapy (Admin only)
router.post('/', 
  authenticate, 
  authorize(['admin']),
  [
    body('name').notEmpty().trim().withMessage('Therapy name is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('category').isIn(['purification', 'rejuvenation', 'therapeutic', 'preventive']).withMessage('Invalid category'),
    body('duration').isInt({ min: 15 }).withMessage('Duration must be at least 15 minutes'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number')
  ],
  async (req, res) => {
    try {
      const therapy = await Therapy.create({
        ...req.body,
        createdBy: req.user.id
      });

      res.status(201).json({
        success: true,
        message: 'Therapy created successfully',
        data: { therapy }
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Therapy with this name already exists'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create therapy',
        error: error.message
      });
    }
  }
);

module.exports = router;
