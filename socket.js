let Server = null;
try {
  Server = require('socket.io').Server;
} catch {
  // socket.io optional in serverless
}

const jwt = require('jsonwebtoken');
const Notification = require('./models/Notification');
const { sendPushToUser, sendPushToRole } = require('./utils/webPush');

let io = null;

const initSocket = (server) => {
  if (process.env.VERCEL || !Server || !server) {
    return null;
  }

  try {
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

        if (!token) return next();

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        return next();
      } catch (err) {
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
      }

      socket.on('authenticate', (token) => {
        try {
          if (!token) return;
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          socket.user = decoded;
          socket.join(`user_${decoded.id}`);
          socket.join(`role_${decoded.role}`);
          socket.emit('authenticated', { success: true, user: decoded });
        } catch {
          socket.emit('authenticated', { success: false, message: 'Invalid token' });
        }
      });
    });

    return io;
  } catch (err) {
    console.warn('Socket.IO init warning:', err.message);
    return null;
  }
};

const getIO = () => io;

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

    // 2. Real-time Socket.IO Push (if active)
    if (io) {
      try {
        if (recipientId) {
          io.to(`user_${recipientId}`).emit('notification', notification);
        } else if (role && role !== 'all') {
          io.to(`role_${role}`).emit('notification', notification);
        } else {
          io.emit('notification', notification);
        }
      } catch (emitErr) {
        console.warn('Socket emit warning:', emitErr.message);
      }
    }

    // 3. Web Push Notification Payload (Background & Native Desktop/Phone)
    const formattedTitle = title?.startsWith('TENAQUARIUM') ? title : `TENAQUARIUM • ${title || 'Notification'}`;
    const pushPayload = {
      title: formattedTitle,
      body: message,
      icon: '/logo.png',
      badge: '/favicon.png',
      timestamp: Date.now(),
      data: {
        url: data.url || (type === 'OFFER' ? '/products' : '/admin/dashboard?tab=orders'),
        type,
        notificationId: notification._id,
        timestamp: Date.now(),
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
    console.error('Error in dispatchNotification:', err.message);
    return null;
  }
};

module.exports = {
  initSocket,
  getIO,
  dispatchNotification,
};
