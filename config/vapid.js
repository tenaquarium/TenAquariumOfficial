let webpush = null;
try {
  webpush = require('web-push');
} catch (e) {
  console.warn('web-push module not available:', e.message);
}

const DEFAULT_PUBLIC_KEY = 'BOMAzM00hXIHNY3URGYguv16QkhHQsocldPvvqp6b1CpfpeB-f0GwJGTXcij66lXzroa9AWhBexTyggELfKQ0yQ';
const DEFAULT_PRIVATE_KEY = 'YqFlRHI6RrL_tfo0MvtC_Ek2R96bGxVBuMZFl8_cfgM';

const publicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;
const mailto = process.env.VAPID_MAILTO || 'mailto:support@tenaquarium.com';

if (webpush) {
  try {
    webpush.setVapidDetails(mailto, publicKey, privateKey);
  } catch (e) {
    console.warn('VAPID setup warning:', e.message);
  }
}

module.exports = {
  webpush,
  getVapidPublicKey: () => publicKey,
};
