const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
  subscribePush,
  unsubscribePush,
  getPublicKey,
  broadcastOffer,
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public route to get VAPID public key
router.get('/vapid-public-key', getPublicKey);

// Protected routes for authenticated users
router.get('/', protect, getNotifications);
router.put('/read-all', protect, markAllAsRead);
router.delete('/clear-all', protect, clearAllNotifications);
router.put('/:id/read', protect, markAsRead);
router.delete('/:id', protect, deleteNotification);
router.post('/subscribe', protect, subscribePush);
router.post('/unsubscribe', protect, unsubscribePush);

// Admin-only broadcast route
router.post('/broadcast-offer', protect, authorize('admin'), broadcastOffer);

module.exports = router;
