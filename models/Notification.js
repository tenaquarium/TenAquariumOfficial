const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { // This acts as recipientId
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dealerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Offer',
    },
    type: {
      type: String, // e.g., 'DEALER_OFFER_SUBMITTED', 'OFFER_APPROVED', 'OFFER_REJECTED'
    },
    title: {
      type: String,
    },
    message: {
      type: String,
      required: true,
    },
    link: { // acts as redirectReference
      type: String,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Notification', notificationSchema);
