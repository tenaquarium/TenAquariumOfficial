const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    customOrderId: {
      type: String,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
    },
    upiUtr: {
      type: String,
      sparse: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    gateway: {
      type: String,
      default: 'UPI',
    },
    merchantUpiId: {
      type: String,
      default: 'tenaquarium457@oksbi',
    },
    paidAt: {
      type: Date,
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
    },
    verifiedVia: {
      type: String,
      enum: ['WEBHOOK', 'PROVIDER_STATUS_API', 'INTENT_CALLBACK', 'RECONCILIATION', 'SANDBOX', 'ADMIN_VERIFIED'],
      default: 'WEBHOOK',
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate payment records
paymentSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
