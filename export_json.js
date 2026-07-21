const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const User = require('./models/User');
const Dealer = require('./models/Dealer');
const Product = require('./models/Product');
const Order = require('./models/Order');
const Review = require('./models/Review');
const Cart = require('./models/Cart');

const exportData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tenaquarium');
    console.log('Connected to MongoDB for exporting...');

    const dumpsDir = path.join(__dirname, '..', 'database_dumps');
    if (!fs.existsSync(dumpsDir)) {
      fs.mkdirSync(dumpsDir, { recursive: true });
    }

    const collections = [
      { model: User, name: 'users' },
      { model: Dealer, name: 'dealers' },
      { model: Product, name: 'products' },
      { model: Order, name: 'orders' },
      { model: Review, name: 'reviews' },
      { model: Cart, name: 'carts' }
    ];

    for (const coll of collections) {
      const data = await coll.model.find({});
      const filePath = path.join(dumpsDir, `${coll.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`Exported ${data.length} records to ${filePath}`);
    }

    console.log('Database export completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Export Error:', err);
    process.exit(1);
  }
};

exportData();
