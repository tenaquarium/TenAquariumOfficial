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
    }

    // 3. Category definitions and templates to generate 20 items per category
    const categoriesData = [
      {
        category: 'Aquarium Fish',
        image: 'https://images.unsplash.com/photo-1524704654690-b56c05c78a02?w=800',
        items: [
          'Red Cap Oranda Goldfish', 'Neon Tetra Schooling Pack', 'Royal Blue Betta Fish', 'Vibrant Blue Discus Fish', 
          'Red Cherry Shrimp Pack', 'Yellow Tang Marine Fish', 'Angelfish Classic Scalare', 'Fancy Guppy Breeding Pair', 
          'Zebra Danio Schooling Pack', 'Harlequin Rasbora School', 'Tiger Barb Active Group', 'Corydoras Bronze Catfish', 
          'Bristlenose Pleco Algae Eater', 'Black Moor Fancy Goldfish', 'White Cloud Mountain Minnow', 'Gourami Pearl Flame', 
          'German Blue Ram Cichlid', 'Kribensis Spawning Pair', 'Cherry Barb Schooling Group', 'Clown Loach Bottom Dweller'
        ]
      },
      {
        category: 'Fish Food',
        image: 'https://images.unsplash.com/photo-1534080391025-09795d197360?w=800',
        items: [
          'Premium Spirulina Pellets', 'Tropical Fish Flake Food', 'Algae Wafers for Plecos', 'Freeze-Dried Bloodworms', 
          'Tubifex Worm Feeding Blocks', 'Goldfish Floating Pellets', 'Betta Micro-Granules', 'Cichlid Floating Sticks', 
          'Baby Fish Liquid Fry Food', 'Color Enhancing Flake Pack', 'Garlic-Infused Pellet Diet', 'Slow-Sinking Crumble Food', 
          'Marine Fish Gourmet Flakes', 'Shrimp & Lobster Sinkers', 'Monster Fish Carnivore Diet', 'Holiday Weekend Feeder', 
          'Bottom Feeder Spawning Wafers', 'Micropellets for Nano Fish', 'Krill-Rich Growth Formula', 'Daphnia Nutrient Pack'
        ]
      },
      {
        category: 'Aquarium Tanks',
        image: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800',
        items: [
          'Ultra-Clear Rimless Tank 60L', 'Nano Glass Cube Tank 15L', 'Rimless Low-Iron Tank 30L', 'Landscape Aquascape Tank 90L', 
          'Curved Glass Panoramic Tank 40L', 'Premium Betta Compartment Tank', 'Double Stack Breeding Rack Tank', 'Shallow Frag Marine Tank 50L', 
          'Hexagonal Classic Tank 35L', 'Acrylic Safe Aquaponic Tank', 'Rimless Peninsula Tank 120L', 'Extra Deep Planted Tank 150L', 
          'Nursery Separation Net Tank', 'Desktop Office Nano Tank 10L', 'Bowfront Stylish Aquarium 80L', 'Wall-Mounted Portrait Tank', 
          'Low-Iron Rimless Cube 45L', 'High-Definition Showcase Tank 200L', 'Mini Desktop Terrarium-Aquarium', 'Heavy Duty Acrylic Sump Tank'
        ]
      },
      {
        category: 'Aquarium Filters',
        image: 'https://images.unsplash.com/photo-1620694563886-c3a80ee55f41?w=800',
        items: [
          'Hang-On-Back Slim Filter 50', 'Multi-Stage Canister Filter 150', 'Biochemical Sponge Filter Small', 'Biochemical Sponge Filter Large', 
          'Surface Oil Film Skimmer', 'Internal Corner Whisper Filter', 'Undergravel Filtration Plate 60', 'Fluidized Bed Moving Media Filter', 
          'UV Sterilizer Submersible Pump', 'Biomax Ceramic Media Ring Pack', 'Activated Carbon Filter Media', 'Pre-Filter Protective Sponge', 
          'Power Filter Replacement Cartridge', 'Heavy Duty Canister Filter 400', 'Top Filter Overhead Box System', 'Silent Air Pump Single Outlet', 
          'Silent Air Pump Dual Outlet', 'Non-Return Check Valve Kit', 'Biochemical Filter Floss Roll', 'Hang-on Canister Flow Filter'
        ]
      },
      {
        category: 'Aquarium Lights',
        image: 'https://images.unsplash.com/photo-1508962914676-134849a727f0?w=800',
        items: [
          'Smart LED Plant Grow Light 60', 'Clip-on Nano Aquarium Light', 'Full Spectrum Slim LED Bar 90', 'RGB Submersible Tube Light', 
          'WiFi Programmable Sunrise LED', 'Marine Reef High-Lumen Light', 'Dual-Channel LED Controller Timer', 'Pendant Aquascape Light 50W', 
          'Submersible Accent Blue LED', 'Clamp-on Spotlight for Betta', 'Plant Growing Pink LED Bar', 'Mini USB Desktop Light', 
          'High Intensity T5 Replacement LED', 'Reef Coral Growth Light Bar', 'Auto Dimming Sunrise Sunset LED', 'Waterproof Night Moon LED', 
          'Deep Marine Blue Reef Panel', 'Slim Profile Aluminum LED 120', 'Multi-color Remote Controlled Light', 'Heavy Duty Hanging Light Kit'
        ]
      },
      {
        category: 'Aquarium Decorations',
        image: 'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?w=800',
        items: [
          'Natural Driftwood Tree Branch', 'Dragon Stone Aquascaping Rock', 'Seiryu Hardscape Stone Pack', 'Ceramic Breeding Cave Tube', 
          'Sunken Pirate Ship Wreck', 'Medieval Castle Ruins Medium', 'Zen Buddha Statue Ornament', 'Ancient Roman Pillar Ruins', 
          'Resin Tree Trunk Hiding Spot', 'Floating Avatar Rock Island', 'Clay Spawning Cone for Discus', 'Sunken Submarine Model', 
          'Natural Lava Rock Pack 1kg', 'Mopani Hardwood Driftwood', 'Spider Wood Branch Large', 'Artificial Coral Reef Decor', 
          'Ceramic Shrimp Dome Shelter', 'Decorative Colored Pebbles 2kg', 'Ancient Greek Colosseum Decor', 'Glow-in-the-dark Resin Jellyfish'
        ]
      },
      {
        category: 'Aquarium Plants',
        image: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=800',
        items: [
          'Anubias Nana Tissue Culture Cup', 'Java Fern Hardy Bunch', 'Java Moss Spawning Mat', 'Amazon Sword Centerpiece Plant', 
          'Vallisneria Spiralis Tall Bunch', 'Cryptocoryne Wendtii Brown', 'Rotala Rotundifolia Stem Pack', 'Ludwigia Repens Red Plant', 
          'Monte Carlo Carpet Plant Cup', 'Dwarf Hairgrass Easy Carpet', 'Christmas Moss Spawning Cover', 'Frogbit Floating Plants Pack', 
          'Tiger Lotus Bulb Red Leaf', 'Dwarf Sagittaria Groundcover', 'Bacopa Monnieri Stem Group', 'Windelov Crested Java Fern', 
          'Hornwort Bunch oxygenator', 'Elodea Densa Coldwater Plant', 'Water Lettuce Floating Cover', 'Buccaphelandra Rare Tissue Cup'
        ]
      },
      {
        category: 'Aquarium Accessories',
        image: 'https://images.unsplash.com/photo-1618477388954-7852f32655ec?w=800',
        items: [
          'Magnetic Glass Cleaner Squeegee', 'Gravel Vacuum Siphon Medium', 'Long Stainless Steel Tweezers 27', 'Long Aquascaping Scissors 25', 
          'Digital Waterproof Thermometer', 'Floating Glass Thermometer', 'Fine Mesh Fish Net 3 inch', 'Fine Mesh Fish Net 6 inch', 
          'Glass CO2 Diffuser Reactor', 'CO2 Bubble Counter U-Pipe', 'Silicone Air Tubing Line 5m', 'Plastic Water Pipette 30ml', 
          'Floating Food Feeding Ring', 'Automatic Daily Fish Feeder', 'Aquarium Multi-Water Test Kit', 'High-Grade Filter Media Bag', 
          'Algae Scraper Extension Tool', 'Airline Regulator Air Valve', 'CO2 Check Indicator Drop Checker', 'Water Conditioner Dechlorinator'
        ]
      }
    ];

    const seededProducts = [];

    // Generate products programmatically
    categoriesData.forEach((catObj) => {
      catObj.items.forEach((itemName, index) => {
        // Construct realistic details
        const basePrice = 100 + (index * 25);
        const price = catObj.category.includes('Tanks') ? basePrice * 8 : basePrice;
        
        seededProducts.push({
          productName: itemName,
          description: `High-quality ${itemName} for professional aquarists. Carefully selected, highly durable, and designed to improve your aquarium experience.`,
          category: catObj.category,
          price: price,
          stock: 10 + (index * 2),
          images: [catObj.image],
          dealerId: dealerUser._id,
          averageRating: 0,
          totalReviews: 0,
          isReturnable: index % 3 !== 0
        });
      });
    });

    console.log(`Clearing all existing products from database...`);
    await Product.deleteMany({});

    console.log(`Seeding ${seededProducts.length} products to database (20 products per category)...`);
    const inserted = await Product.insertMany(seededProducts);
    console.log(`Successfully seeded ${inserted.length} products! All reviews and ratings are reset to 0.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error connecting or seeding database:', err);
    process.exit(1);
  });
