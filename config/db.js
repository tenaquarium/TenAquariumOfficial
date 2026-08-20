const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://tenaquarium_db_user:tenaquariumdb@tenaquariumcluster.1tpyeeh.mongodb.net/tenaquarium');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Automatically seed default categories if none exist
    const { seedDefaultCategories } = require('../controllers/categoryController');
    await seedDefaultCategories();

    // Automatically seed default free shipping campaign configuration
    const Settings = require('../models/Settings');
    await Settings.findOneAndUpdate(
      { key: 'freeShipping' },
      {
        $setOnInsert: {
          key: 'freeShipping',
          value: {
            status: 'ON',
            startDate: '2026-08-01',
            endDate: '2026-08-31',
          }
        }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
