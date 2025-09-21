// src/routes/userRoutes.js
const express = require('express');
const User = require('../models/user.models');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get practitioners
router.get('/practitioners', async (req, res) => {
  try {
    const { specialization, isApproved = true, page = 1, limit = 20 } = req.query;
    const query = { 
      role: 'practitioner',
      isActive: true
    };

    if (isApproved !== 'false') {
      query['practitionerInfo.isApproved'] = true;
    }

    if (specialization) {
      query['practitionerInfo.specialization'] = { $in: [specialization] };
    }

    const skip = (page - 1) * limit;

    const [practitioners, totalCount] = await Promise.all([
      User.find(query)
        .select('profile practitionerInfo email')
        .sort({ 'profile.firstName': 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        practitioners,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasMore: skip + practitioners.length < totalCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch practitioners',
      error: error.message
    });
  }
});

// Approve practitioner (Admin only)
router.patch('/:id/approve', 
  authenticate, 
  authorize(['admin']), 
  async (req, res) => {
    try {
      const practitioner = await User.findById(req.params.id);
      
      if (!practitioner || practitioner.role !== 'practitioner') {
        return res.status(404).json({
          success: false,
          message: 'Practitioner not found'
        });
      }

      practitioner.practitionerInfo.isApproved = true;
      practitioner.practitionerInfo.approvedBy = req.user.id;
      practitioner.practitionerInfo.approvedAt = new Date();
      await practitioner.save();

      // Send approval notification
      await sendNotification({
        recipient: practitioner._id,
        type: 'practitioner_approved',
        title: 'Account Approved',
        message: 'Congratulations! Your practitioner account has been approved. You can now start accepting appointments.',
        channels: { email: true, inApp: true }
      });

      res.json({
        success: true,
        message: 'Practitioner approved successfully',
        data: { practitioner }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to approve practitioner',
        error: error.message
      });
    }
  }
);

module.exports = router;
