const mongoose = require('mongoose');
const User = require('./models/user.models');
const Therapy = require('./models/therapy.models');
const Session = require('./models/session.models');
const Feedback = require('./models/feedbacke.models');
require('dotenv').config();

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/panchakarma');
    console.log('Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Therapy.deleteMany({}),
      Session.deleteMany({}),
      Feedback.deleteMany({})
    ]);
    console.log('Cleared existing data');

    // Create Admin User
    const admin = await User.create({
      email: 'admin@panchakarma.com',
      password: 'admin123',
      role: 'admin',
      profile: {
        firstName: 'System',
        lastName: 'Administrator',
        phone: '9876543210',
        dateOfBirth: new Date('1980-01-01'),
        gender: 'male'
      },
      isActive: true
    });
    console.log('Created admin user');

    // Create Sample Practitioners
    const practitioner1 = await User.create({
      email: 'dr.sharma@panchakarma.com',
      password: 'doctor123',
      role: 'practitioner',
      profile: {
        firstName: 'Rajesh',
        lastName: 'Sharma',
        phone: '9876543211',
        dateOfBirth: new Date('1975-05-15'),
        gender: 'male',
        address: {
          street: '123 Wellness Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India'
        }
      },
      practitionerInfo: {
        specialization: ['Abhyanga', 'Shirodhara', 'Panchakarma'],
        experience: 15,
        qualifications: ['BAMS', 'MD Ayurveda'],
        licenseNumber: 'AYU12345',
        isApproved: true,
        approvedBy: admin._id,
        approvedAt: new Date()
      },
      isActive: true
    });

    const practitioner2 = await User.create({
      email: 'dr.patel@panchakarma.com',
      password: 'doctor123',
      role: 'practitioner',
      profile: {
        firstName: 'Priya',
        lastName: 'Patel',
        phone: '9876543212',
        dateOfBirth: new Date('1980-08-20'),
        gender: 'female',
        address: {
          street: '456 Ayurveda Lane',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400002',
          country: 'India'
        }
      },
      practitionerInfo: {
        specialization: ['Nasya', 'Basti', 'Udvartana'],
        experience: 10,
        qualifications: ['BAMS', 'PG Diploma Panchakarma'],
        licenseNumber: 'AYU67890',
        isApproved: true,
        approvedBy: admin._id,
        approvedAt: new Date()
      },
      isActive: true
    });

    console.log('Created practitioners');

    // Create Sample Patients
    const patient1 = await User.create({
      email: 'john.doe@email.com',
      password: 'patient123',
      role: 'patient',
      profile: {
        firstName: 'John',
        lastName: 'Doe',
        phone: '9876543213',
        dateOfBirth: new Date('1985-03-10'),
        gender: 'male',
        address: {
          street: '789 Health Avenue',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400003',
          country: 'India'
        }
      },
      healthHistory: {
        allergies: ['Peanuts'],
        medications: ['Vitamin D3'],
        medicalConditions: ['Hypertension'],
        previousTreatments: ['Allopathic treatment for BP'],
        emergencyContact: {
          name: 'Jane Doe',
          phone: '9876543214',
          relation: 'Spouse'
        }
      },
      isActive: true
    });

    const patient2 = await User.create({
      email: 'sarah.smith@email.com',
      password: 'patient123',
      role: 'patient',
      profile: {
        firstName: 'Sarah',
        lastName: 'Smith',
        phone: '9876543215',
        dateOfBirth: new Date('1990-07-25'),
        gender: 'female',
        address: {
          street: '321 Wellness Road',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400004',
          country: 'India'
        }
      },
      healthHistory: {
        allergies: [],
        medications: [],
        medicalConditions: ['Anxiety', 'Insomnia'],
        previousTreatments: ['Yoga therapy'],
        emergencyContact: {
          name: 'Michael Smith',
          phone: '9876543216',
          relation: 'Brother'
        }
      },
      isActive: true
    });

    console.log('Created patients');

    // Create Sample Therapies
    const therapies = await Therapy.create([
      {
        name: 'Abhyanga',
        sanskritName: 'अभ्यंग',
        description: 'Full body oil massage therapy that nourishes the skin, improves circulation, and promotes deep relaxation.',
        category: 'therapeutic',
        duration: 60,
        price: 2500,
        benefits: [
          'Improves blood circulation',
          'Nourishes skin and muscles',
          'Reduces stress and anxiety',
          'Improves sleep quality'
        ],
        indications: ['Stress', 'Fatigue', 'Muscle tension', 'Insomnia'],
        contraindications: ['Fever', 'Acute illness', 'Open wounds'],
        preInstructions: [
          'Avoid heavy meals 2 hours before treatment',
          'Inform about any allergies or medical conditions',
          'Wear comfortable, loose clothing'
        ],
        postInstructions: [
          'Rest for 30 minutes after treatment',
          'Drink warm water',
          'Avoid cold foods and drinks',
          'Take a warm shower after 2-3 hours'
        ],
        requiredEquipment: ['Massage table', 'Warm sesame oil', 'Towels'],
        difficulty: 'beginner',
        createdBy: admin._id
      },
      {
        name: 'Shirodhara',
        sanskritName: 'शिरोधारा',
        description: 'Continuous pouring of medicated oil or other liquids over the forehead to calm the mind and nervous system.',
        category: 'therapeutic',
        duration: 45,
        price: 3000,
        benefits: [
          'Calms nervous system',
          'Reduces stress and anxiety',
          'Improves mental clarity',
          'Treats insomnia'
        ],
        indications: ['Anxiety', 'Depression', 'Insomnia', 'Headaches'],
        contraindications: ['Head injuries', 'Neck problems', 'Cold and cough'],
        preInstructions: [
          'Empty bladder before treatment',
          'Inform about head/neck injuries',
          'Remove contact lenses if any'
        ],
        postInstructions: [
          'Rest in a quiet environment',
          'Avoid loud noises',
          'Keep head covered',
          'Avoid washing hair for 24 hours'
        ],
        requiredEquipment: ['Shirodhara table', 'Medicated oil', 'Dhara pot'],
        difficulty: 'intermediate',
        createdBy: admin._id
      },
      {
        name: 'Nasya',
        sanskritName: 'नस्य',
        description: 'Nasal administration of medicated oils or herbal preparations to cleanse and strengthen the nasal passages.',
        category: 'purification',
        duration: 30,
        price: 1500,
        benefits: [
          'Clears nasal passages',
          'Improves breathing',
          'Reduces headaches',
          'Enhances mental clarity'
        ],
        indications: ['Sinusitis', 'Allergic rhinitis', 'Headaches', 'Mental fog'],
        contraindications: ['Nasal bleeding', 'Acute cold', 'Pregnancy'],
        preInstructions: [
          'Avoid eating 1 hour before',
          'Clear nasal passages gently',
          'Inform about nasal conditions'
        ],
        postInstructions: [
          'Rest for 15 minutes',
          'Avoid cold air exposure',
          'Gargle with warm water',
          'Avoid smoking and alcohol'
        ],
        requiredEquipment: ['Nasal drops', 'Dropper', 'Tissues'],
        difficulty: 'intermediate',
        createdBy: admin._id
      },
      {
        name: 'Basti',
        sanskritName: 'बस्ति',
        description: 'Medicated enema therapy that cleanses the colon and balances Vata dosha.',
        category: 'purification',
        duration: 90,
        price: 4000,
        benefits: [
          'Detoxifies colon',
          'Balances Vata dosha',
          'Improves digestion',
          'Reduces joint pain'
        ],
        indications: ['Constipation', 'IBS', 'Arthritis', 'Sciatica'],
        contraindications: ['Diarrhea', 'Bleeding disorders', 'Pregnancy', 'Anal fissures'],
        preInstructions: [
          'Light diet for 3 days before',
          'Empty bladder and bowel',
          'Fasting for 12 hours before'
        ],
        postInstructions: [
          'Rest for 1-2 hours',
          'Light, warm food only',
          'Avoid physical exertion',
          'Monitor bowel movements'
        ],
        requiredEquipment: ['Enema kit', 'Medicated decoction', 'Towels'],
        difficulty: 'advanced',
        createdBy: admin._id
      },
      {
        name: 'Udvartana',
        sanskritName: 'उद्वर्तन',
        description: 'Herbal powder massage performed in upward strokes to reduce excess fat and improve skin texture.',
        category: 'therapeutic',
        duration: 45,
        price: 2000,
        benefits: [
          'Reduces cellulite',
          'Improves skin texture',
          'Promotes weight loss',
          'Enhances circulation'
        ],
        indications: ['Obesity', 'Cellulite', 'Poor circulation', 'Skin problems'],
        contraindications: ['Skin allergies', 'Open wounds', 'Pregnancy'],
        preInstructions: [
          'Shower before treatment',
          'Inform about skin allergies',
          'Wear disposable undergarments'
        ],
        postInstructions: [
          'Shower with warm water',
          'Apply moisturizer',
          'Drink plenty of water',
          'Light diet for rest of the day'
        ],
        requiredEquipment: ['Herbal powders', 'Massage table', 'Gloves'],
        difficulty: 'intermediate',
        createdBy: admin._id
      }
    ]);

    console.log('Created therapies');

    // Create Sample Sessions
    const now = new Date();
    const sessions = [];


    // Future scheduled sessions
    for (let i = 1; i <= 3; i++) {
      const sessionDate = new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      sessionDate.setHours(14, 0, 0, 0);
      
      sessions.push({
        therapy: therapies[i % therapies.length]._id,
        patient: i % 2 === 0 ? patient1._id : patient2._id,
        practitioner: i % 2 === 0 ? practitioner1._id : practitioner2._id,
        scheduledDate: sessionDate.toDateString(),
        startTime: sessionDate,
        endTime: new Date(sessionDate.getTime() + therapies[i % therapies.length].duration * 60 * 1000),
        status: 'scheduled',
        price: therapies[i % therapies.length].price,
        paymentStatus: 'pending',
        notes: { preSession: 'Looking forward to the session' }
      });
    }

    const createdSessions = await Session.create(sessions);
    console.log('Created sessions');

    // Create Sample Feedback for completed sessions
    const completedSessions = createdSessions.filter(session => session.status === 'completed');
    const feedbacks = completedSessions.map(session => ({
      session: session._id,
      patient: session.patient,
      practitioner: session.practitioner,
      rating: {
        overall: Math.floor(Math.random() * 2) + 4, // 4 or 5 stars
        practitionerSkill: Math.floor(Math.random() * 2) + 4,
        facilityClanliness: Math.floor(Math.random() * 2) + 4,
        communication: Math.floor(Math.random() * 2) + 4,
        effectiveness: Math.floor(Math.random() * 2) + 4
      },
      comments: {
        positive: 'Excellent treatment! Felt very relaxed and rejuvenated.',
        improvement: 'Could provide more detailed post-treatment instructions.',
        sideEffects: 'None observed'
      },
      symptoms: {
        improved: ['Stress', 'Muscle tension'],
        worsened: [],
        new: []
      },
      recommendation: {
        wouldRecommend: true,
        toWho: 'Anyone dealing with stress and fatigue'
      },
      followUp: {
        needed: false
      }
    }));

    await Feedback.create(feedbacks);
    console.log('Created feedback');

    console.log('✅ Seed data created successfully!');
    console.log('\n📧 Test Credentials:');
    console.log('Admin: admin@panchakarma.com / admin123');
    console.log('Practitioner 1: dr.sharma@panchakarma.com / doctor123');
    console.log('Practitioner 2: dr.patel@panchakarma.com / doctor123');
    console.log('Patient 1: john.doe@email.com / patient123');
    console.log('Patient 2: sarah.smith@email.com / patient123');

    process.exit(0);
  } catch (error) {
    console.error('Seed data error:', error);
    process.exit(1);
  }
};

// Run seed data if this file is executed directly
if (require.main === module) {
  seedData();
}

module.exports = seedData;
