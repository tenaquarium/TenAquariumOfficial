const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null means role-based or global broadcast
    },
    role: {
      type: String,
      enum: ['admin', 'customer', 'dealer', 'all'],
      default: 'all',
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['OFFER', 'PAYMENT', 'ORDER', 'SYSTEM', 'BROADCAST'],
      default: 'SYSTEM',
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
