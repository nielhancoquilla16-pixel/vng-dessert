import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../dessert-ai-system/server/.env') });

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in dessert-ai-system/server/.env');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function checkUsers() {
  console.log(`Checking project: ${url}`);
  
  console.log('\n--- Checking Supabase Auth Users ---');
  try {
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      console.error('Error listing users:', authError.message);
    } else {
      console.log(`Found ${users.length} users in Auth.`);
      users.forEach(u => console.log(`- ${u.email} (${u.id})`));
    }
  } catch (err) {
    console.error('Auth check failed:', err.message);
  }

  console.log('\n--- Checking Profiles Table ---');
  try {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*');
      
    if (profileError) {
      console.error('Error listing profiles:', profileError.message);
    } else {
      console.log(`Found ${profiles.length} profiles.`);
      profiles.forEach(p => console.log(`- ${p.username} (${p.role}) - ${p.email}`));
    }
  } catch (err) {
    console.error('Profile check failed:', err.message);
  }
}

checkUsers();
