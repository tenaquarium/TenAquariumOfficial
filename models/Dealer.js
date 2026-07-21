const mongoose = require('mongoose');

const dealerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    businessName: {
      type: String,
      required: [true, 'Please add business name'],
      trim: true,
    },
    ownerName: {
      type: String,
      required: [true, 'Please add owner name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please add business email'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Please add business phone number'],
    },
    address: {
      type: String,
      required: [true, 'Please add business address'],
    },
    logo: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    msmeCertificate: {
      type: String,
      default: '',
    },
    googlePlaceId: {
      type: String,
      default: '',
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    courierServices: {
      type: [String],
      default: ['DTDC', 'Professional Courier', 'ST Courier'],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Dealer', dealerSchema);
