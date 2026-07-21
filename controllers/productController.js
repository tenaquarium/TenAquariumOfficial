const Product = require('../models/Product');
const Dealer = require('../models/Dealer');
const User = require('../models/User');

// @desc    Get all products with advanced filters
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const { keyword, category, priceMin, priceMax, rating, sort } = req.query;
    let query = {};

    // Filter by keyword (product name)
    if (keyword) {
      query.productName = { $regex: keyword, $options: 'i' };
    }

    // Filter by category
    if (category && category !== 'All') {
      query.category = category;
    }

    // Filter by price
    if (priceMin || priceMax) {
      query.price = {};
      if (priceMin) query.price.$gte = Number(priceMin);
      if (priceMax) query.price.$lte = Number(priceMax);
    }

    // Filter by rating range
    if (rating) {
      const rNum = Number(rating);
      if (rNum === 0) {
        query.averageRating = 0;
      } else if (rNum === 1) {
        query.averageRating = { $gte: 1, $lt: 2 };
      } else if (rNum === 2) {
        query.averageRating = { $gte: 2, $lt: 3 };
      } else if (rNum === 3) {
        query.averageRating = { $gte: 3, $lt: 4 };
      } else if (rNum === 4) {
        query.averageRating = { $gte: 4, $lt: 5 };
      } else if (rNum === 5) {
        query.averageRating = { $gte: 5 };
      } else {
        query.averageRating = { $gte: rNum };
      }
    }

    let apiQuery = Product.find(query).populate('dealerId', 'name email phone');

    // Sorting
    if (sort) {
      if (sort === 'priceAsc') {
        apiQuery = apiQuery.sort({ price: 1 });
      } else if (sort === 'priceDesc') {
        apiQuery = apiQuery.sort({ price: -1 });
      } else if (sort === 'newest') {
        apiQuery = apiQuery.sort({ createdAt: -1 });
      } else if (sort === 'bestRating') {
        apiQuery = apiQuery.sort({ averageRating: -1 });
      } else {
        apiQuery = apiQuery.sort({ createdAt: -1 });
      }
    } else {
      apiQuery = apiQuery.sort({ createdAt: -1 }); // Default to newest
    }

    const products = await apiQuery;
    
    // Filter duplicates by name per dealer
    const seenDealerProducts = new Set();
    const uniqueProducts = [];
    
    for (const prod of products) {
      const dealerIdStr = prod.dealerId?._id?.toString() || (prod.dealerId || '').toString();
      const nameKey = `${dealerIdStr}_${prod.productName.trim().toLowerCase()}`;
      if (!seenDealerProducts.has(nameKey)) {
        seenDealerProducts.add(nameKey);
        uniqueProducts.push(prod);
      }
    }
    
    res.json(uniqueProducts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('dealerId', 'name email phone');

    if (product) {
      // Fetch dealer business info from Dealer collection
      const dealerProfile = await Dealer.findOne({ userId: product.dealerId._id });
      
      res.json({
        ...product.toObject(),
        dealerInfo: dealerProfile ? {
          _id: dealerProfile._id,
          businessName: dealerProfile.businessName,
          ownerName: dealerProfile.ownerName,
          phone: dealerProfile.phone,
          email: dealerProfile.email,
          address: dealerProfile.address,
          description: dealerProfile.description,
          approvalStatus: dealerProfile.approvalStatus
        } : null
      });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get own products (Dealer only)
// @route   GET /api/products/myproducts
// @access  Private/Dealer
const getDealerProducts = async (req, res) => {
  try {
    const products = await Product.find({ dealerId: req.user._id }).sort({ createdAt: -1 });
    
    // Filter out duplicates by name (case-insensitive)
    const seenNames = new Set();
    const uniqueProducts = [];
    
    for (const prod of products) {
      const nameKey = prod.productName.trim().toLowerCase();
      if (!seenNames.has(nameKey)) {
        seenNames.add(nameKey);
        uniqueProducts.push(prod);
      }
    }
    
    res.json(uniqueProducts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new product
// @route   POST /api/products
// @access  Private/Dealer
const createProduct = async (req, res) => {
  const { productName, description, category, price, stock, images, isReturnable } = req.body;

  try {
    // Verify dealer is approved before allowing them to post products
    const dealerProfile = await Dealer.findOne({ userId: req.user._id });
    if (!dealerProfile || dealerProfile.approvalStatus !== 'approved') {
      return res.status(403).json({
        message: 'Your dealer profile must be approved by Admin before uploading products.'
      });
    }

    // Check if a product with the same name already exists for this dealer
    const existingProduct = await Product.findOne({
      dealerId: req.user._id,
      productName: { $regex: new RegExp(`^${productName.trim()}$`, 'i') }
    });
    if (existingProduct) {
      return res.status(400).json({
        message: `You have already uploaded a product named "${productName}". Please use a different name or edit the existing product.`
      });
    }

    const product = await Product.create({
      productName,
      description,
      category,
      price,
      stock,
      images: images || ['https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?w=500'],
      dealerId: req.user._id,
      isReturnable: isReturnable !== undefined ? isReturnable : true,
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Dealer
const updateProduct = async (req, res) => {
  const { productName, description, category, price, stock, images, isReturnable } = req.body;

  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Verify ownership
    if (product.dealerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to edit this product' });
    }

    // Check if the name is being changed, and if another product with the new name already exists for this dealer
    if (productName && productName.trim().toLowerCase() !== product.productName.toLowerCase()) {
      const existingProduct = await Product.findOne({
        dealerId: product.dealerId,
        _id: { $ne: product._id },
        productName: { $regex: new RegExp(`^${productName.trim()}$`, 'i') }
      });
      if (existingProduct) {
        return res.status(400).json({
          message: `You have already uploaded a product named "${productName}". Please use a different name.`
        });
      }
    }

    product.productName = productName || product.productName;
    product.description = description || product.description;
    product.category = category || product.category;
    product.price = price !== undefined ? price : product.price;
    product.stock = stock !== undefined ? stock : product.stock;
    product.images = images || product.images;
    if (isReturnable !== undefined) product.isReturnable = isReturnable;

    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Dealer/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Verify ownership or admin role
    if (product.dealerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this product' });
    }

    await Product.deleteOne({ _id: req.params.id });
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProducts,
  getProductById,
  getDealerProducts,
  createProduct,
  updateProduct,
  deleteProduct,
};
