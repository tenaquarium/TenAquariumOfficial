const mongoose = require('mongoose');

// Global cache for Vercel Serverless to keep connection alive
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  // If a connection already exists, return it instantly (Zero load time!)
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // IMPORTANT: We do NOT use bufferCommands: false here.
    // Mongoose buffering is required so that we don't have to rewrite every single 
    // API route to explicitly `await connectDB()`. It will hold queries for milliseconds 
    // until the connection finishes, avoiding the 500 errors.
    cached.promise = mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://tenaquarium_db_user:tenaquariumdb@tenaquariumcluster.1tpyeeh.mongodb.net/tenaquarium').then((mongoose) => {
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
