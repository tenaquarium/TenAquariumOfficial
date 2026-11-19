const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const keysFilePath = path.join(__dirname, 'vapidKeys.json');

let publicKey = process.env.VAPID_PUBLIC_KEY;
let privateKey = process.env.VAPID_PRIVATE_KEY;

if (!publicKey || !privateKey) {
  if (fs.existsSync(keysFilePath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(keysFilePath, 'utf8'));
      publicKey = saved.publicKey;
      privateKey = saved.privateKey;
    } catch (e) {
      console.warn('Could not read vapidKeys.json:', e.message);
    }
  }

  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    try {
      fs.writeFileSync(keysFilePath, JSON.stringify({ publicKey, privateKey }, null, 2), 'utf8');
      console.log('✅ Generated new persistent VAPID keys saved to vapidKeys.json');
    } catch (err) {
      console.warn('Could not save vapidKeys.json:', err.message);
    }
  }
}

const mailto = process.env.VAPID_MAILTO || 'mailto:support@tenaquarium.com';

webpush.setVapidDetails(mailto, publicKey, privateKey);

module.exports = {
  webpush,
  getVapidPublicKey: () => publicKey
};
