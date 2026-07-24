const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = 'mongodb+srv://tenaquarium_db_user:tenaquariumdb@tenaquariumcluster.1tpyeeh.mongodb.net/tenaquarium';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to Database successfully!');

    // Get models
    const User = mongoose.model('User', new mongoose.Schema({
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      phone: { type: String, required: true },
      role: { type: String, enum: ['admin', 'dealer', 'customer'], default: 'customer' },
      status: { type: String, enum: ['active', 'blocked'], default: 'active' }
    }, { timestamps: true }));

    const Dealer = mongoose.model('Dealer', new mongoose.Schema({
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
      businessName: { type: String, required: true },
      ownerName: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      logo: { type: String, default: '' },
      description: { type: String, default: '' },
      approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
      courierServices: { type: [String], default: ['DTDC', 'Professional Courier', 'ST Courier'] },
      bankDetails: {
        holderName: { type: String, default: '' },
        bankName: { type: String, default: '' },
        accountNo: { type: String, default: '' },
        ifscCode: { type: String, default: '' }
      }
    }, { timestamps: true }));

    const Product = mongoose.model('Product', new mongoose.Schema({
      productName: { type: String, required: true },
      description: { type: String, required: true },
      category: { type: String, required: true },
      price: { type: Number, required: true },
      stock: { type: Number, required: true },
      images: { type: [String], required: true },
      dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      averageRating: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
      isReturnable: { type: Boolean, default: true }
    }, { timestamps: true }));

    // 1. Check/Create Dealer User
    let dealerUser = await User.findOne({ email: 'dealer@tenaquarium.com' });
    if (!dealerUser) {
      console.log('Dealer user not found. Creating a new dealer user...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('dealer123', salt);
      
      dealerUser = await User.create({
        name: 'Aqua Marine Dealer',
        email: 'dealer@tenaquarium.com',
        password: hashedPassword,
        phone: '9677572150',
        role: 'dealer',
        status: 'active'
      });
      console.log(`Created dealer user: ${dealerUser.name} (${dealerUser._id})`);
    } else {
      console.log(`Dealer user exists: ${dealerUser.name} (${dealerUser._id})`);
    }

    // 2. Check/Create Dealer Profile
    let dealerProfile = await Dealer.findOne({ userId: dealerUser._id });
    if (!dealerProfile) {
      console.log('Dealer profile not found. Creating a new dealer profile...');
      dealerProfile = await Dealer.create({
        userId: dealerUser._id,
        businessName: 'Aqua Marine Shop',
        ownerName: 'Aqua Marine Dealer',
        email: 'dealer@tenaquarium.com',
        phone: '9677572150',
        address: '123 Ocean Way, Salem',
        approvalStatus: 'approved',
        courierServices: ['DTDC', 'Professional Courier', 'ST Courier'],
        bankDetails: {
          holderName: 'Aqua Marine Shop',
          bankName: 'State Bank of India',
          accountNo: '12345678901',
          ifscCode: 'SBIN0001234'
        }
      });
      console.log(`Created dealer profile: ${dealerProfile.businessName}`);
    } else {
      console.log(`Dealer profile exists: ${dealerProfile.businessName}`);
    }

    // 3. Define 8 real high-quality aquarium products
    const dummyProducts = [
      {
        productName: 'Neon Tetra Schooling Pack (10 Fish)',
        description: 'A beautiful pack of 10 active, healthy Neon Tetra fish. Perfect for community planted aquariums.',
        category: 'Aquarium Fish',
        price: 350,
        stock: 25,
        images: ['https://images.unsplash.com/photo-1534080391025-09795d197360?w=800'],
        dealerId: dealerUser._id,
        averageRating: 4.8,
        totalReviews: 12,
        isReturnable: true
      },
      {
        productName: 'Royal Blue Betta Fish (Male)',
        description: 'Vibrant, hand-selected male Siamese Fighting Fish. Stunning show-quality fins and colors.',
        category: 'Aquarium Fish',
        price: 450,
        stock: 15,
        images: ['https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?w=800'],
        dealerId: dealerUser._id,
        averageRating: 4.7,
        totalReviews: 9,
        isReturnable: true
      },
      {
        productName: 'Premium Red Oranda Goldfish',
        description: 'High-quality Oranda goldfish with a well-developed red wen. Calm temperament and highly active.',
        category: 'Aquarium Fish',
        price: 850,
        stock: 10,
        images: ['https://images.unsplash.com/photo-1524704654690-b56c05c78a02?w=800'],
        dealerId: dealerUser._id,
        averageRating: 4.9,
        totalReviews: 14,
        isReturnable: true
      },
      {
        productName: 'Vibrant Blue Discus Fish (Medium)',
        description: 'Spectacular, farm-bred Discus fish with brilliant blue patterning. Highly sought after by aquarists.',
        category: 'Aquarium Fish',
        price: 1800,
        stock: 6,
        images: ['https://images.unsplash.com/photo-1572111504021-40afd33e15dd?w=800'],
        dealerId: dealerUser._id,
        averageRating: 4.9,
        totalReviews: 7,
        isReturnable: true
      },
      {
        productName: 'Red Cherry Shrimp (Pack of 10)',
        description: 'Active and healthy freshwater dwarf shrimp. Excellent scavengers for clean aquariums and nano tanks.',
        category: 'Aquarium Fish',
        price: 290,
        stock: 30,
        images: ['https://images.unsplash.com/photo-1618477388954-7852f32655ec?w=800'],
        dealerId: dealerUser._id,
        averageRating: 4.8,
        totalReviews: 11,
        isReturnable: true
      },
      {
        productName: 'Anubias Barteri on Driftwood',
        description: 'Lush green aquatic plant pre-attached to natural driftwood. Easy to maintain and hardy.',
        category: 'Aquarium Plants',
        price: 450,
        stock: 12,
        images: ['https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=800'],
        dealerId: dealerUser._id,
        averageRating: 4.6,
        totalReviews: 8,
        isReturnable: true
      },
      {
        productName: 'Ultra-Clear Rimless Glass Tank (60L)',
        description: 'Rimless low-iron glass aquarium. Provides stunning high-definition views of your aquascape.',
        category: 'Aquarium Tanks',
        price: 4800,
        stock: 5,
        images: ['https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800'],
        dealerId: dealerUser._id,
        averageRating: 4.9,
        totalReviews: 15,
        isReturnable: false
      },
      {
        productName: 'Vibrant Yellow Tang Marine Fish',
        description: 'Stunning reef-safe saltwater marine tang. Active swimmer with a brilliant yellow coloring.',
        category: 'Aquarium Fish',
        price: 2500,
        stock: 8,
        images: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800'],
        dealerId: dealerUser._id,
        averageRating: 4.8,
        totalReviews: 10,
        isReturnable: true
      }
    ];

    // Delete any previous products with matching names to avoid duplicates
    const names = dummyProducts.map(p => p.productName);
    // Also delete the previous 5 dummy product names to keep it clean
    const oldNames = ['Neon Tetra Schooling Pack', 'Premium Spirulina Pellets', 'Ultra-Clear Rimless Glass Tank', 'Smart LED Aquascaping Light', 'Java Moss Tissue Culture Cup'];
    await Product.deleteMany({ productName: { $in: [...names, ...oldNames] } });

    // Insert new dummy products
    const inserted = await Product.insertMany(dummyProducts);
    console.log(`Successfully seeded ${inserted.length} real aquarium products!`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error connecting or seeding database:', err);
    process.exit(1);
  });
