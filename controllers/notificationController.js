const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const { getVapidPublicKey } = require('../config/vapid');
const { dispatchNotification } = require('../socket');

// @desc    Get user notifications with unread count
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    const query = {
      $or: [
        { recipient: userId },
        { recipient: null, role: { $in: [userRole, 'all'] } },
      ],
    };

    const limit = parseInt(req.query.limit, 10) || 30;
    const page = parseInt(req.query.page, 10) || 1;
    const skip = (page - 1) * limit;

    const [notifications, totalUnread, totalCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ ...query, isRead: false }),
      Notification.countDocuments(query),
    ]);

    res.json({
      success: true,
      unreadCount: totalUnread,
      totalCount,
      notifications,
      page,
      pages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Server error fetching notifications' });
  }
};

// @desc    Mark a notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.json({ success: true, notification });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Mark all notifications as read for current user
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    await Notification.updateMany(
      {
        $or: [
          { recipient: userId },
          { recipient: null, role: { $in: [userRole, 'all'] } },
        ],
        isRead: false,
      },
      {
        $set: { isRead: true, readAt: new Date() },
      }
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete single notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Clear all notifications for user
// @route   DELETE /api/notifications/clear-all
// @access  Private
const clearAllNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    await Notification.deleteMany({
      $or: [
        { recipient: userId },
        { recipient: null, role: { $in: [userRole, 'all'] } },
      ],
    });

    res.json({ success: true, message: 'All notifications cleared' });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Register or update Web Push subscription
// @route   POST /api/notifications/subscribe
// @access  Private
const subscribePush = async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ message: 'Invalid subscription object' });
    }

    const saved = await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        user: req.user._id,
        role: req.user.role,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        userAgent: req.headers['user-agent'] || '',
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, subscription: saved });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ message: 'Server error saving push subscription' });
  }
};

// @desc    Unsubscribe / disable Web Push notifications
// @route   POST /api/notifications/unsubscribe
// @access  Private
const unsubscribePush = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await PushSubscription.deleteOne({ endpoint, user: req.user._id });
    } else {
      await PushSubscription.deleteMany({ user: req.user._id });
    }
    res.json({ success: true, message: 'Push notifications disabled successfully' });
  } catch (error) {
    console.error('Error disabling push subscription:', error);
    res.status(500).json({ message: 'Server error disabling push notification' });
  }
};

// @desc    Get VAPID public key for frontend push subscription
// @route   GET /api/notifications/vapid-public-key
// @access  Public
const getPublicKey = (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
};

// @desc    Admin announces/broadcasts an offer to all customers
// @route   POST /api/notifications/broadcast-offer
// @access  Private (Admin only)
const broadcastOffer = async (req, res) => {
  try {
    const { title, message, offerId, discount, url } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    const notification = await dispatchNotification({
      role: 'customer',
      title: title || '🎉 Special Offer from TEN Aquarium!',
      message,
      type: 'OFFER',
      data: {
        offerId: offerId || null,
        discount: discount || '',
        url: url || '/products',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Offer notification broadcasted to all customers successfully',
      notification,
    });
  } catch (error) {
    console.error('Error broadcasting offer:', error);
    res.status(500).json({ message: 'Server error broadcasting offer' });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
  subscribePush,
  unsubscribePush,
  getPublicKey,
  broadcastOffer,
};
