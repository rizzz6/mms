require('dotenv').config({ path: '.env.local' });

async function run() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=id,full_name,role,status&limit=10`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`
      }
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`HTTP Error ${res.status}:`, text);
    } else {
      const data = await res.json();
      console.log('Approved profiles:', data);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
