const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: 'd:/anti_project/backend/.env' });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://tenaquarium_db_user:tenaquariumdb@tenaquariumcluster.1tpyeeh.mongodb.net/tenaquarium';

mongoose.connect(mongoUri)
  .then(async () => {
    const User = require('../models/User');

    // Emails of dealers to delete
    const dealerEmails = [
      'elavarasim457@gmail.com',
      'support.jssofttoolsproducts@gmail.com',
      '2k19me070@kiot.ac.in'
    ];

    console.log('Initiating dealer deletions...');
    const result = await User.deleteMany({ email: { $in: dealerEmails } });
    console.log(`Deleted dealers count: ${result.deletedCount}`);

    // Query remaining users
    const users = await User.find({}).sort({ role: 1, createdAt: 1 }).lean();
    console.log('\n--- REMAINING USERS IN DATABASE ---');
    users.forEach(u => {
      console.log(`- ${u.name} (${u.email}) - Role: ${u.role}`);
    });
    console.log('-----------------------------------\n');

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error:', err);
  });
