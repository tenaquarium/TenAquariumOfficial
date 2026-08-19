const Cart = require('../models/Cart');
const Product = require('../models/Product');

// @desc    Get customer cart
// @route   GET /api/cart
// @access  Private/Customer
const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ customerId: req.user._id });
    if (!cart) {
      cart = await Cart.create({ customerId: req.user._id, products: [] });
    }

    // Filter out products that no longer exist or are out of stock
    let hasChanges = false;
    const activeProducts = [];

    for (const item of cart.products) {
      const product = await Product.findById(item.productId);
      if (product) {
        if (product.hasVariants && item.color && item.color !== 'Standard') {
          const variant = product.variants.find(v => v.color === item.color);
          if (variant && variant.stock > 0) {
            activeProducts.push(item);
          } else {
            hasChanges = true;
          }
        } else {
          if (product.stock > 0) {
            activeProducts.push(item);
          } else {
            hasChanges = true;
          }
        }
      } else {
        hasChanges = true;
      }
    }

    if (hasChanges) {
      cart.products = activeProducts;
      await cart.save();
    }

    // Now populate and return
    const populatedCart = await Cart.findOne({ customerId: req.user._id }).populate({
      path: 'products.productId',
      select: 'productName price stock images category dealerId hasVariants variants',
    });

    res.json(populatedCart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add product to cart
// @route   POST /api/cart
// @access  Private/Customer
const addToCart = async (req, res) => {
  const { productId, color, image, quantity } = req.body;
  const qty = Number(quantity) || 1;
  const itemColor = color || '';
  const itemImage = image || '';

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.hasVariants && itemColor && itemColor !== 'Standard') {
      const variant = product.variants.find(v => v.color === itemColor);
      if (!variant) {
        return res.status(400).json({ message: `Color variant "${itemColor}" not found for this product.` });
      }
      if (variant.stock < qty) {
        return res.status(400).json({ message: `Insufficient stock for variant ${itemColor}. Only ${variant.stock} left.` });
      }
    } else {
      if (product.stock < qty) {
        return res.status(400).json({ message: `Insufficient stock. Only ${product.stock} items left.` });
      }
    }

    let cart = await Cart.findOne({ customerId: req.user._id });
    if (!cart) {
      cart = await Cart.create({ customerId: req.user._id, products: [] });
    }

    // Single-vendor cart validation
    if (cart.products.length > 0) {
      const firstProductId = cart.products[0].productId;
      const existingProduct = await Product.findById(firstProductId);
      if (existingProduct && existingProduct.dealerId.toString() !== product.dealerId.toString()) {
        return res.status(400).json({
          message: 'Your cart already contains products from a different vendor. You can only purchase from one vendor at a time. Please checkout or empty your cart first.'
        });
      }
    }

    // Check if product already in cart with the same color
    const itemIndex = cart.products.findIndex(
      (item) => item.productId.toString() === productId && item.color === itemColor
    );

    if (itemIndex > -1) {
      // Product exists, update quantity
      const newQty = cart.products[itemIndex].quantity + qty;
      if (product.hasVariants && itemColor && itemColor !== 'Standard') {
        const variant = product.variants.find(v => v.color === itemColor);
        if (variant && variant.stock < newQty) {
          return res.status(400).json({ message: `Cannot add more. Max stock available for variant ${itemColor}: ${variant.stock}` });
        }
      } else {
        if (product.stock < newQty) {
          return res.status(400).json({ message: `Cannot add more. Max stock available: ${product.stock}` });
        }
      }
      cart.products[itemIndex].quantity = newQty;
    } else {
      // Product does not exist with this color, add to cart
      cart.products.push({ productId, color: itemColor, image: itemImage, quantity: qty });
    }

    await cart.save();
    
    // Populate and return
    const updatedCart = await Cart.findOne({ customerId: req.user._id }).populate({
      path: 'products.productId',
      select: 'productName price stock images category dealerId hasVariants variants',
    });

    res.json(updatedCart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update cart item quantity
// @route   PUT /api/cart
// @access  Private/Customer
const updateCartQuantity = async (req, res) => {
  const { productId, color, quantity } = req.body;
  const qty = Number(quantity);
  const itemColor = color || '';

  if (qty < 1) {
    return res.status(400).json({ message: 'Quantity must be at least 1' });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.hasVariants && itemColor && itemColor !== 'Standard') {
      const variant = product.variants.find(v => v.color === itemColor);
      if (variant && variant.stock < qty) {
        return res.status(400).json({ message: `Insufficient stock for variant ${itemColor}. Max stock available: ${variant.stock}` });
      }
    } else {
      if (product.stock < qty) {
        return res.status(400).json({ message: `Insufficient stock. Max stock available: ${product.stock}` });
      }
    }

    let cart = await Cart.findOne({ customerId: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const itemIndex = cart.products.findIndex(
      (item) => item.productId.toString() === productId && item.color === itemColor
    );

    if (itemIndex > -1) {
      cart.products[itemIndex].quantity = qty;
      await cart.save();

      const updatedCart = await Cart.findOne({ customerId: req.user._id }).populate({
        path: 'products.productId',
        select: 'productName price stock images category dealerId hasVariants variants',
      });
      res.json(updatedCart);
    } else {
      res.status(404).json({ message: 'Product not found in cart' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Remove product from cart
// @route   DELETE /api/cart/:productId
// @access  Private/Customer
const removeFromCart = async (req, res) => {
  const { productId } = req.params;
  const { color } = req.query;
  const itemColor = color || '';

  try {
    let cart = await Cart.findOne({ customerId: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    cart.products = cart.products.filter(
      (item) => !(item.productId.toString() === productId && item.color === itemColor)
    );

    await cart.save();

    const updatedCart = await Cart.findOne({ customerId: req.user._id }).populate({
      path: 'products.productId',
      select: 'productName price stock images category dealerId hasVariants variants',
    });
    res.json(updatedCart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private/Customer
const clearCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ customerId: req.user._id });

    if (cart) {
      cart.products = [];
      await cart.save();
    }

    res.json({ message: 'Cart cleared successfully', products: [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
};
