const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema(
  {
    dealerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    offerScope: {
      type: String,
      enum: ['product', 'category', 'customer', 'store'],
      required: true,
    },
    productSelectionType: {
      type: String,
      enum: ['single', 'multiple', null],
      default: null,
    },
    targetProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    targetCategories: [
      {
        type: String,
      },
    ],
    targetCustomers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    customerType: {
      type: String,
      enum: ['all', 'new', 'existing', 'selected'],
      default: 'all',
    },
    benefitType: {
      type: String,
      enum: ['percentage', 'fixed', 'special_price', 'free_delivery', 'buy_x_get_y', 'buy_more_save_more'],
      required: true,
    },
    benefitValue: {
      type: Number,
      default: 0,
    },
    specialPrices: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
        },
        price: {
          type: Number,
        },
      },
    ],
    buyX: {
      type: Number,
      default: 0,
    },
    getY: {
      type: Number,
      default: 0,
    },
    buyMoreSaveMoreTiers: [
      {
        minQty: { type: Number, required: true },
        discountPercentage: { type: Number, required: true },
      },
    ],
    freeDeliveryType: {
      type: String,
      enum: ['all', 'min_order_value', null],
      default: null,
    },
    minimumOrderValue: {
      type: Number,
      default: 0,
    },
    maximumDiscount: {
      type: Number,
      default: 0,
    },
    usageLimit: {
      type: Number,
      default: null, // null for unlimited
    },
    customerUsageLimit: {
      type: Number,
      default: null, // null for unlimited
    },
    startDate: {
      type: String,
      required: true,
    },
    endDate: {
      type: String,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    startDateTime: {
      type: Date,
      required: true,
    },
    endDateTime: {
      type: Date,
      required: true,
    },
    offerName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    bannerImage: {
      type: String, // Base64 or URL
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'UNDER REVIEW', 'APPROVED', 'REJECTED', 'ACTIVE', 'EXPIRED'],
      default: 'DRAFT',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    approvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
offerSchema.index({ dealerId: 1 });
offerSchema.index({ status: 1 });
offerSchema.index({ startDateTime: 1, endDateTime: 1 });

module.exports = mongoose.model('Offer', offerSchema);
