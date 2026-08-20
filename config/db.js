const mongoose = require('mongoose');

// Global cache for Vercel Serverless
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };
    cached.promise = mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://tenaquarium_db_user:tenaquariumdb@tenaquariumcluster.1tpyeeh.mongodb.net/tenaquarium', opts).then((mongoose) => {
      console.log(`MongoDB Connected: ${mongoose.connection.host}`);
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;

    
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
