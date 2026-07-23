const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: [1, 'Quantity must be at least 1'],
        },
        price: {
          type: Number,
          required: true,
        },
        dealerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    shippingAddress: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zip: { type: String, required: true },
      phone: { type: String, required: true },
    },
    paymentMethod: {
      type: String,
      enum: ['COD', 'UPI-QR'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },
    orderStatus: {
      type: String,
      enum: ['Processing', 'Shipped', 'In Transit', 'Delivered', 'Cancelled', 'Returned'],
      default: 'Processing',
    },
    dealerPayoutStatus: {
      type: String,
      enum: ['Pending', 'Processing', 'Paid'],
      default: 'Pending',
    },
    customOrderId: {
      type: String,
      unique: true,
      sparse: true,
    },
    customerUpiId: {
      type: String,
    },
    paymentProofImage: {
      type: String,
    },
    qrPaymentExpiresAt: {
      type: Date,
    },
    qrPaymentApprovedByAdmin: {
      type: Boolean,
      default: false,
    },
    courierService: {
      type: String,
      default: '',
    },
    deliveryCharge: {
      type: Number,
      default: 0,
    },
    trackingNumber: {
      type: String,
      default: '',
    },
    courierBillImage: {
      type: String,
      default: '',
    },
    finalBoxImage: {
      type: String,
      default: '',
    },
    trackingTimeline: [
      {
        status: { type: String },
        location: { type: String },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    courierBillDetails: {
      courier: { type: String, default: '' },
      consignmentNo: { type: String, default: '' },
      bookingDate: { type: String, default: '' },
      from: { type: String, default: '' },
      to: { type: String, default: '' }
    },
    cancellationDetails: {
      agreedToPolicy: { type: Boolean, default: false },
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      requestedAt: { type: Date },
      refundPercentage: { type: Number, default: 0 },
      refundAmount: { type: Number, default: 0 },
      cancellationReason: { type: String, default: '' },
      refundStatus: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' }
    }
  },
  {
    timestamps: true,
  }
);

// Indexes for high performance querying
orderSchema.index({ customerId: 1 });
orderSchema.index({ 'products.dealerId': 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
