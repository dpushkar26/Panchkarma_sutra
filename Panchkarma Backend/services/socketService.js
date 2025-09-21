// src/services/socketService.js
const jwt = require('jsonwebtoken');
const User = require('../models/user.models');

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return next(new Error('Authentication error'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
};

const setupSocketEvents = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.email}`);

    // Join user to their personal room
    socket.join(`user_${socket.user._id}`);

    // Join practitioner to practitioner room
    if (socket.user.role === 'practitioner') {
      socket.join('practitioners');
    }

    // Handle slot booking events
    socket.on('bookSlot', async (data) => {
      // Emit to practitioner
      socket.to(`user_${data.practitionerId}`).emit('slotBooked', {
        ...data,
        bookedBy: socket.user._id
      });
    });

    // Handle real-time session status updates
    socket.on('sessionStatusUpdate', async (data) => {
      const { sessionId, status } = data;
      
      // Emit to patient and practitioner
      socket.to(`session_${sessionId}`).emit('sessionStatusChanged', {
        sessionId,
        status,
        updatedBy: socket.user._id
      });
    });

    // Join session room for real-time updates
    socket.on('joinSession', (sessionId) => {
      socket.join(`session_${sessionId}`);
    });

    // Leave session room
    socket.on('leaveSession', (sessionId) => {
      socket.leave(`session_${sessionId}`);
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.email}`);
    });
  });
};

module.exports = {
  setupSocketEvents
};