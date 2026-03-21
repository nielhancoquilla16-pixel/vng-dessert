
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

async function testCreate() {
  const email = `test_${Date.now()}@example.com`;
  const password = 'TestPassword123!';

  console.log(`Testing user creation for ${email}...`);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error) {
    console.error('Test user creation failed:', error);
  } else {
    console.log('Test user creation succeeded:', data.user.id);
    // Cleanup
    await supabase.auth.admin.deleteUser(data.user.id);
    console.log('Test user deleted.');
  }
}

testCreate();
