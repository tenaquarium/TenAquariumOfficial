const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: [true, 'Please add a product name'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Please select a category'],
      enum: [
        'Aquarium Fish',
        'Fish Food',
        'Aquarium Tanks',
        'Aquarium Filters',
        'Aquarium Lights',
        'Aquarium Decorations',
        'Aquarium Plants',
        'Aquarium Accessories',
      ],
    },
    price: {
      type: Number,
      required: [true, 'Please add a price'],
      min: [0, 'Price cannot be negative'],
    },
    stock: {
      type: Number,
      required: [true, 'Please add stock quantity'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    minQuantity: {
      type: Number,
      default: 2,
      min: [1, 'Minimum quantity cannot be less than 1'],
    },
    images: {
      type: [String],
      required: [true, 'Please add at least one product image URL'],
    },
    imageHashes: {
      type: [String],
      index: true,
    },
    dealerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    soldCount: {
      type: Number,
      default: 0,
    },
    isReturnable: {
      type: Boolean,
      default: true,
    },
    hasVariants: {
      type: Boolean,
      default: false,
    },
    variants: [
      {
        color: { type: String, required: true },
        image: { type: String, required: true },
        stock: { type: Number, default: 0, min: 0 }
      }
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for high performance querying
productSchema.index({ dealerId: 1 });
productSchema.index({ category: 1 });
productSchema.index({ productName: 1 });
productSchema.index({ category: 1, price: 1 });

module.exports = mongoose.model('Product', productSchema);
