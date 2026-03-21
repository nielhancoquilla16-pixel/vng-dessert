
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase config');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkUsers() {
  console.log('Checking profiles...');
  const { data: profiles, error: pError } = await supabase.from('profiles').select('*');
  if (pError) {
    console.error('Error fetching profiles:', pError);
  } else {
    console.log('Profiles found:', profiles.length);
    profiles.forEach(p => console.log(`- ${p.username} (${p.email}) [${p.role}]`));
  }

  console.log('\nChecking auth users...');
  const { data: { users }, error: uError } = await supabase.auth.admin.listUsers();
  if (uError) {
    console.error('Error fetching auth users:', uError);
  } else {
    console.log('Auth users found:', users.length);
    users.forEach(u => console.log(`- ${u.email} (ID: ${u.id})`));
  }
}

checkUsers();
