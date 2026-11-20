const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Notification = require('./models/Notification');
const { sendPushToUser, sendPushToRole } = require('./utils/webPush');

let io = null;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Socket Authentication Middleware
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        // Allow unauthenticated guest connections if needed, but no personal rooms
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      return next();
    } catch (err) {
      // Invalid token - still allow connection for public broadcasts or reject
      return next();
    }
  });

  io.on('connection', (socket) => {
    if (socket.user && socket.user.id) {
      const userRoom = `user_${socket.user.id}`;
      const roleRoom = `role_${socket.user.role}`;

      socket.join(userRoom);
      socket.join(roleRoom);

      console.log(`🔌 Socket connected: ${socket.id} | User: ${socket.user.id} (${socket.user.role})`);
    } else {
      console.log(`🔌 Socket connected (guest): ${socket.id}`);
    }

    // Client can also manually join personal room after auth
    socket.on('authenticate', (token) => {
      try {
        if (!token) return;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        socket.join(`user_${decoded.id}`);
        socket.join(`role_${decoded.role}`);
        console.log(`🔌 Socket re-authenticated: ${socket.id} -> User: ${decoded.id} (${decoded.role})`);
        socket.emit('authenticated', { success: true, user: decoded });
      } catch (err) {
        socket.emit('authenticated', { success: false, message: 'Invalid token' });
      }
    });

    socket.on('disconnect', () => {
      // Clean up
    });
  });

  return io;
};

const getIO = () => {
  return io;
};

/**
 * Unified Notification Dispatcher:
 * 1. Persists Notification in MongoDB
 * 2. Emits real-time event to Socket.IO room(s)
 * 3. Triggers Web Push notification to registered devices (background & desktop)
 */
const dispatchNotification = async ({
  recipientId = null,
  role = 'all',
  title,
  message,
  type = 'SYSTEM',
  data = {},
}) => {
  try {
    // 1. Persist to MongoDB
    const notification = await Notification.create({
      recipient: recipientId,
      role,
      title,
      message,
      type,
      data,
      isRead: false,
    });

    // 2. Real-time Socket.IO Push
    if (io) {
      if (recipientId) {
        io.to(`user_${recipientId}`).emit('notification', notification);
      } else if (role && role !== 'all') {
        io.to(`role_${role}`).emit('notification', notification);
      } else {
        io.emit('notification', notification);
      }
    }

    // 3. Web Push Notification Payload (For Background & Native Desktop/Phone)
    const pushPayload = {
      title,
      body: message,
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: {
        url: data.url || (type === 'OFFER' ? '/products' : '/admin/dashboard?tab=orders'),
        type,
        notificationId: notification._id,
        ...data,
      },
    };

    setImmediate(async () => {
      try {
        if (recipientId) {
          await sendPushToUser(recipientId, pushPayload);
        } else if (role && role !== 'all') {
          await sendPushToRole(role, pushPayload);
        } else {
          await sendPushToRole('all', pushPayload);
        }
      } catch (pushErr) {
        console.warn('Background web push dispatch warning:', pushErr.message);
      }
    });

    return notification;
  } catch (err) {
    console.error('Error in dispatchNotification:', err);
    throw err;
  }
};

module.exports = {
  initSocket,
  getIO,
  dispatchNotification,
};
