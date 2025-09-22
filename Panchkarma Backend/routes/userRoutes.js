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

// Get patients
router.get('/patients', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const query = { 
      role: 'patient',
      isActive: true
    };

    const skip = (page - 1) * limit;

    const [patients, totalCount] = await Promise.all([
      User.find(query)
        .select('profile email phone createdAt')
        .sort({ 'profile.firstName': 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        patients,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasMore: skip + patients.length < totalCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patients',
      error: error.message
    });
  }
});

// Add therapy to practitioner's offerings
router.post('/therapies/add', authenticate, async (req, res) => {
  try {
    const { therapyId } = req.body;
    const userId = req.user.id;
    
    if (req.user.role !== 'practitioner') {
      return res.status(403).json({
        success: false,
        message: 'Only practitioners can add therapies'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (!user.practitionerInfo.offeredTherapies) {
      user.practitionerInfo.offeredTherapies = [];
    }
    
    if (!user.practitionerInfo.offeredTherapies.includes(therapyId)) {
      user.practitionerInfo.offeredTherapies.push(therapyId);
      await user.save();
    }
    
    res.json({
      success: true,
      message: 'Therapy added successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add therapy',
      error: error.message
    });
  }
});

// Remove therapy from practitioner's offerings
router.delete('/therapies/:therapyId', authenticate, async (req, res) => {
  try {
    const { therapyId } = req.params;
    const userId = req.user.id;
    
    if (req.user.role !== 'practitioner') {
      return res.status(403).json({
        success: false,
        message: 'Only practitioners can remove therapies'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (user.practitionerInfo.offeredTherapies) {
      user.practitionerInfo.offeredTherapies = user.practitionerInfo.offeredTherapies.filter(
        id => id.toString() !== therapyId
      );
      await user.save();
    }
    
    res.json({
      success: true,
      message: 'Therapy removed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove therapy',
      error: error.message
    });
  }
});

// Get user profile by ID
router.get('/profile/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile',
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
