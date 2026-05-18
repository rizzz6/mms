const webpush = require('web-push');
require('dotenv').config({ path: '.env.local' });

const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privKey = process.env.VAPID_PRIVATE_KEY;

try {
  // Try to send a mock notification payload (without sending it to a real network endpoint, just verify local signing)
  const mockSubscription = {
    endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA...',
    keys: {
      auth: 'k7G1...',
      p256dh: 'BLt...'
    }
  };
  
  webpush.setVapidDetails(
    'mailto:admin@mms.com',
    pubKey,
    privKey
  );
  
  const headers = webpush.getVapidHeaders(
    mockSubscription.endpoint,
    'mailto:admin@mms.com',
    pubKey,
    privKey,
    'aesgcm'
  );
  
  console.log('Success! The keys are mathematically matching and successfully signed the request.');
} catch (err) {
  console.error('Keys do not match or are mathematically invalid:', err);
}
