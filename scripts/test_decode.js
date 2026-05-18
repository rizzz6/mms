require('dotenv').config({ path: '.env.local' });

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

try {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  console.log('Original public key:', pub);
  const decoded = urlBase64ToUint8Array(pub);
  console.log('Decoded Uint8Array length:', decoded.length);
  console.log('Decoded values:', Array.from(decoded).slice(0, 10), '...');
} catch (err) {
  console.error('Decoding failed:', err);
}
