const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .get(getNotifications);

router.put('/read-all', markAllAsRead);

router.route('/:id')
  .put(markAsRead)
  .delete(deleteNotification);

module.exports = router;
