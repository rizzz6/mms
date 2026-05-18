const webpush = require('web-push');
require('dotenv').config({ path: '.env.local' });

try {
  console.log('Public Key length:', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.length : 0);
  console.log('Private Key length:', process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PRIVATE_KEY.length : 0);
  
  webpush.setVapidDetails(
    'mailto:admin@mms.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('VAPID check passed! The keys are recognized as valid Base64 URL-safe keys by web-push.');
} catch (err) {
  console.error('VAPID check failed!', err.message);
}
