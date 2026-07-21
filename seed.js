const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Dealer = require('./models/Dealer');
const Product = require('./models/Product');
const Order = require('./models/Order');
const Review = require('./models/Review');
const Cart = require('./models/Cart');

dotenv.config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tenaquarium');
    console.log('MongoDB Connected for Seeding...');

    // Clear existing data
    await User.deleteMany();
    await Dealer.deleteMany();
    await Product.deleteMany();
    await Order.deleteMany();
    await Review.deleteMany();
    await Cart.deleteMany();

    console.log('Cleared existing database entries.');

    // 1. Create Users
    // Admin
    const adminUser = await User.create({
      name: 'Super Admin',
      email: 'admin457@tenaquarium.com',
      password: 'admin457@',
      phone: '9677572150',
      role: 'admin',
      status: 'active',
    });

    // Approved Dealer
    const dealerUser1 = await User.create({
      name: 'Ten Aquarium',
      email: 'tenaquarium4570@gmail.com',
      password: 'dealer123',
      phone: '9677572150',
      role: 'dealer',
      status: 'active',
    });

    // Pending Dealer
    const dealerUser2 = await User.create({
      name: 'Coral Reef Systems',
      email: 'pending_dealer@tenaquarium.com',
      password: 'dealer123',
      phone: '7777777777',
      role: 'dealer',
      status: 'active',
    });

    // Customer
    const customerUser = await User.create({
      name: 'John Doe',
      email: 'customer@tenaquarium.com',
      password: 'customer12',
      phone: '6666666666',
      role: 'customer',
      status: 'active',
    });

    console.log('Users created.');

    // 2. Create Dealer Profiles
    const approvedDealer = await Dealer.create({
      userId: dealerUser1._id,
      businessName: 'Ten Aquarium',
      ownerName: 'Ten Aquarium Owner',
      email: 'tenaquarium4570@gmail.com',
      phone: '9677572150',
      address: '183/81, 2nd North Street, Puthumariamman Kovil Bus Stop, Ponnamapet, Salem - 636003',
      logo: '/logo.png',
      description: 'Ten Aquarium is a premium retail and wholesale dealer of high-quality freshwater fish, aquatic live plants, imported canister filters, energy-efficient LED lights, and nutritious fish feeds.',
      msmeCertificate: '/msme_certificate.jpg',
      approvalStatus: 'approved',
    });

    const pendingDealer = await Dealer.create({
      userId: dealerUser2._id,
      businessName: 'Coral Reef Systems Inc',
      ownerName: 'Coral Reef Systems',
      email: 'pending_dealer@tenaquarium.com',
      phone: '7777777777',
      address: '456 Lagoon Ave, Coral Cove',
      approvalStatus: 'pending',
    });

    console.log('Dealer Profiles created.');

    // Create Cart for customer
    await Cart.create({ customerId: customerUser._id, products: [] });

    // 3. Create Products for Approved Dealer
    const productsData = [
      {
        productName: 'Neon Tetra (Pack of 10)',
        description: 'Vibrant blue and red freshwater schooling fish, perfect for community aquariums. Extremely active and hardy.',
        category: 'Aquarium Fish',
        price: 350,
        stock: 50,
        images: ['https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600'],
        dealerId: dealerUser1._id,
        averageRating: 4.8,
        totalReviews: 2,
      },
      {
        productName: 'Premium Goldfish Pellets 200g',
        description: 'Nutritionally balanced floating pellets containing high-quality protein to support growth and color enhancement.',
        category: 'Fish Food',
        price: 250,
        stock: 100,
        images: ['https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?w=600'],
        dealerId: dealerUser1._id,
        averageRating: 4.5,
        totalReviews: 1,
      },
      {
        productName: 'Rimless Glass Aquarium Tank 20 Gallon',
        description: 'High-clarity low-iron glass aquarium with polished edges for a sleek, modern look. Ideal for aquascaping.',
        category: 'Aquarium Tanks',
        price: 4500,
        stock: 15,
        images: ['https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?w=600'],
        dealerId: dealerUser1._id,
        averageRating: 5.0,
        totalReviews: 1,
      },
      {
        productName: 'Canister Filter 1000 L/H',
        description: 'Multi-stage external canister filter with quiet operation. Complete mechanical, chemical, and biological filtration.',
        category: 'Aquarium Filters',
        price: 3200,
        stock: 25,
        images: ['https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600'],
        dealerId: dealerUser1._id,
        averageRating: 4.2,
        totalReviews: 1,
      },
      {
        productName: 'Full Spectrum LED Light (24-inch)',
        description: 'App-controlled LED strip with dynamic light cycles (sunrise, sunset) to promote aquatic plant growth.',
        category: 'Aquarium Lights',
        price: 1800,
        stock: 30,
        images: ['https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=600'],
        dealerId: dealerUser1._id,
        averageRating: 4.7,
        totalReviews: 1,
      },
      {
        productName: 'Artificial Shipwreck Decoration',
        description: 'Detailed resin shipwreck layout. Creates natural hiding places for fish and a dramatic center piece.',
        category: 'Aquarium Decorations',
        price: 850,
        stock: 40,
        images: ['https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600'],
        dealerId: dealerUser1._id,
        averageRating: 4.0,
        totalReviews: 1,
      },
      {
        productName: 'Java Fern Live Plant',
        description: 'Hardy freshwater live plant. Easy to grow, perfect for beginners, attaches easily to driftwood or stones.',
        category: 'Aquarium Plants',
        price: 150,
        stock: 60,
        images: ['https://images.unsplash.com/photo-1534224039826-c7a0dea0e66a?w=600'],
        dealerId: dealerUser1._id,
        averageRating: 4.6,
        totalReviews: 1,
      },
      {
        productName: 'Magnetic Glass Cleaner',
        description: 'Strong magnetic glass scraper to easily clean algae off tank walls without getting your hands wet.',
        category: 'Aquarium Accessories',
        price: 450,
        stock: 80,
        images: ['https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600'],
        dealerId: dealerUser1._id,
        averageRating: 4.9,
        totalReviews: 1,
      },
    ];

    const seededProducts = await Product.create(productsData);
    console.log('Products seeded.');

    // 4. Create Reviews
    const reviewsData = [
      {
        customerId: customerUser._id,
        productId: seededProducts[0]._id, // Neon Tetra
        rating: 5,
        review: 'Extremely healthy fish! Arrived colorful and active. Doing great in my planted tank.',
        status: 'approved',
      },
      {
        customerId: customerUser._id,
        productId: seededProducts[1]._id, // Goldfish Pellets
        rating: 4,
        review: 'Good quality food. My goldfish love it, though the pellets sink slightly faster than expected.',
        status: 'approved',
      },
      {
        customerId: customerUser._id,
        productId: seededProducts[2]._id, // Rimless Tank
        rating: 5,
        review: 'Unbelievable clarity! The joints are seamless and look extremely clean. Fast delivery.',
        status: 'approved',
      },
    ];

    await Review.create(reviewsData);
    console.log('Reviews seeded.');

    // 5. Create Orders (simulated paid orders for stats)
    // We create a couple of orders over the last three months
    const date1 = new Date();
    date1.setMonth(date1.getMonth() - 2);

    const date2 = new Date();
    date2.setMonth(date2.getMonth() - 1);

    const date3 = new Date(); // Current month

    const ordersData = [
      {
        customerId: customerUser._id,
        products: [
          {
            productId: seededProducts[0]._id, // Neon Tetra
            quantity: 2,
            price: seededProducts[0].price,
            dealerId: dealerUser1._id,
          },
          {
            productId: seededProducts[2]._id, // Rimless Tank
            quantity: 1,
            price: seededProducts[2].price,
            dealerId: dealerUser1._id,
          }
        ],
        totalAmount: (seededProducts[0].price * 2) + seededProducts[2].price,
        shippingAddress: {
          address: '456 Aquarium Way',
          city: 'Mumbai',
          state: 'Maharashtra',
          zip: '400001',
          phone: '9876543210',
        },
        paymentMethod: 'UPI-QR',
        paymentStatus: 'paid',
        orderStatus: 'Delivered',
        customerUpiId: 'customer@okaxis',
        createdAt: date1,
      },
      {
        customerId: customerUser._id,
        products: [
          {
            productId: seededProducts[3]._id, // Filter
            quantity: 1,
            price: seededProducts[3].price,
            dealerId: dealerUser1._id,
          },
          {
            productId: seededProducts[4]._id, // Light
            quantity: 1,
            price: seededProducts[4].price,
            dealerId: dealerUser1._id,
          }
        ],
        totalAmount: seededProducts[3].price + seededProducts[4].price,
        shippingAddress: {
          address: '456 Aquarium Way',
          city: 'Mumbai',
          state: 'Maharashtra',
          zip: '400001',
          phone: '9876543210',
        },
        paymentMethod: 'UPI-QR',
        paymentStatus: 'paid',
        orderStatus: 'Shipped',
        customerUpiId: 'customer@okaxis',
        createdAt: date2,
      },
      {
        customerId: customerUser._id,
        products: [
          {
            productId: seededProducts[1]._id, // Goldfish Pellets
            quantity: 3,
            price: seededProducts[1].price,
            dealerId: dealerUser1._id,
          }
        ],
        totalAmount: seededProducts[1].price * 3,
        shippingAddress: {
          address: '789 Marine Drive',
          city: 'Mumbai',
          state: 'Maharashtra',
          zip: '400002',
          phone: '9876543210',
        },
        paymentMethod: 'COD',
        paymentStatus: 'pending',
        orderStatus: 'Processing',
        createdAt: date3,
      }
    ];

    await Order.create(ordersData);
    console.log('Orders seeded.');

    console.log('Database Seeding Completed Successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding Error:', error);
    process.exit(1);
  }
};

seedData();
