# README.md
# Panchakarma Management System - Backend

A comprehensive backend system for managing Panchakarma therapy centers with features for patient management, practitioner scheduling, real-time notifications, and analytics.

## 🚀 Features

- **Authentication & Authorization**: JWT-based auth with role-based access (Patient, Practitioner, Admin)
- **Therapy Management**: Complete CRUD operations for Ayurvedic therapies
- **Smart Scheduling**: Availability checking with conflict resolution
- **Quick Slot Reallocation**: Real-time slot availability updates after cancellations
- **Multi-channel Notifications**: Email, WhatsApp, and in-app notifications
- **Feedback System**: Comprehensive patient feedback and rating system
- **Analytics Dashboard**: Detailed insights for patients, practitioners, and admins
- **Real-time Updates**: WebSocket integration for live updates
- **Automated Reminders**: Cron-based appointment reminders
- **Production Ready**: Comprehensive error handling, validation, and security

## 🛠 Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Real-time**: Socket.IO
- **Notifications**: Nodemailer (Email), Twilio (WhatsApp)
- **Validation**: Express-validator
- **Security**: Helmet, CORS, Rate Limiting
- **Task Scheduling**: Node-cron

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd panchakarma-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start MongoDB**
   ```bash
   # Make sure MongoDB is running locally or update MONGODB_URI in .env
   mongod
   ```

5. **Seed the database (optional)**
   ```bash
   npm run seed
   ```

6. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 🔧 Environment Variables

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/panchakarma
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@panchakarma.com

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PATCH /api/auth/profile` - Update user profile

### Session Management
- `POST /api/sessions/book` - Book a therapy session
- `PATCH /api/sessions/:id/cancel` - Cancel a session
- `GET /api/sessions/available-slots` - Get available time slots
- `GET /api/sessions/my-sessions` - Get user's sessions
- `PATCH /api/sessions/:id/status` - Update session status
- `GET /api/sessions/:id` - Get session details

### Therapy Management
- `GET /api/therapies` - Get all therapies
- `GET /api/therapies/:id` - Get therapy by ID
- `POST /api/therapies` - Create new therapy (Admin only)

### User Management
- `GET /api/users/practitioners` - Get approved practitioners
- `PATCH /api/users/:id/approve` - Approve practitioner (Admin only)

### Notifications
- `GET /api/notifications` - Get user notifications
- `PATCH /api/notifications/:id/read` - Mark notification as read

### Feedback
- `POST /api/feedback` - Submit session feedback
- `GET /api/feedback/session/:sessionId` - Get session feedback
- `GET /api/feedback/practitioner/:id` - Get practitioner feedback

### Analytics
- `GET /api/analytics/patient/:id?` - Get patient analytics
- `GET /api/analytics/practitioner/:id?` - Get practitioner analytics
- `GET /api/analytics/admin` - Get admin analytics

## 🏗 Project Structure

```
src/
├── controllers/     # Route handlers
├── models/         # Mongoose schemas
├── routes/         # API routes
├── services/       # Business logic
├── middleware/     # Custom middleware
├── utils/          # Utility functions
└── server.js       # Main server file
```

## 🔐 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-based Access**: Different permissions for patients, practitioners, and admins
- **Rate Limiting**: API rate limiting to prevent abuse
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configured cross-origin resource sharing
- **Helmet Security**: HTTP security headers
- **Password Hashing**: BCrypt password hashing

## 📊 Real-time Features

- **Slot Availability**: Real-time updates when slots become available
- **Session Status**: Live session status updates
- **Notifications**: Real-time in-app notifications
- **Dashboard Updates**: Live analytics updates

## 🔄 Automated Tasks

- **Appointment Reminders**: 24h, 2h, and 30min reminders
- **Session Status Updates**: Automatic status updates for overdue sessions
- **Notification Cleanup**: Automated cleanup of expired notifications

## 🧪 Testing Credentials (After Seeding)

- **Admin**: admin@panchakarma.com / admin123
- **Practitioner**: dr.sharma@panchakarma.com / doctor123
- **Patient**: john.doe@email.com / patient123

## 🚀 Deployment

1. **Build for production**
   ```bash
   npm install --production
   ```

2. **Set environment variables**
   ```bash
   export NODE_ENV=production
   # Set other production environment variables
   ```

3. **Start with PM2 (recommended)**
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name "panchakarma-api"
   ```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support, email support@panchakarma.com or create an issue on GitHub. session.patient._id,