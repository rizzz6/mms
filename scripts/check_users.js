const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function run() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, full_name, role, status');
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(profiles, null, 2));
  }
}

run();
