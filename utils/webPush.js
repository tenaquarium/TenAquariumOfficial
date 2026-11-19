const { webpush } = require('../config/vapid');
const PushSubscription = require('../models/PushSubscription');

/**
 * Send a web push notification to a specific subscription
 */
const sendPushToSubscription = async (subscription, payload) => {
  try {
    const pushConfig = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    const stringPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    await webpush.sendNotification(pushConfig, stringPayload);
    return true;
  } catch (err) {
    // 404 Not Found or 410 Gone means user unsubscribed or expired
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.log(`Push subscription expired/unsubscribed (${err.statusCode}), deleting:`, subscription.endpoint);
      await PushSubscription.deleteOne({ _id: subscription._id }).catch(() => {});
    } else {
      console.warn('Web push delivery warning:', err.message);
    }
    return false;
  }
};

/**
 * Send web push to all registered devices of a single user
 */
const sendPushToUser = async (userId, payload) => {
  try {
    const subs = await PushSubscription.find({ user: userId });
    if (!subs || subs.length === 0) return 0;

    const results = await Promise.allSettled(
      subs.map((sub) => sendPushToSubscription(sub, payload))
    );
    return results.filter((r) => r.status === 'fulfilled' && r.value).length;
  } catch (err) {
    console.error('Error in sendPushToUser:', err.message);
    return 0;
  }
};

/**
 * Send web push to all registered devices of a specific role (e.g. 'customer' or 'admin')
 */
const sendPushToRole = async (role, payload) => {
  try {
    const filter = role === 'all' ? {} : { role };
    const subs = await PushSubscription.find(filter);
    if (!subs || subs.length === 0) return 0;

    const results = await Promise.allSettled(
      subs.map((sub) => sendPushToSubscription(sub, payload))
    );
    return results.filter((r) => r.status === 'fulfilled' && r.value).length;
  } catch (err) {
    console.error('Error in sendPushToRole:', err.message);
    return 0;
  }
};

module.exports = {
  sendPushToSubscription,
  sendPushToUser,
  sendPushToRole,
};
