
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

async function updatePassword() {
  const currentEmail = 'hanielcoquillajr16+admin@gmail.com';
  const password = 'AdminPassword123!';

  console.log(`Searching for user with email ${currentEmail}...`);
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  const user = users?.find(u => u.email === currentEmail);

  if (!user) {
    console.error(`User with email ${currentEmail} not found.`);
    return;
  }

  console.log(`Updating password for user ${user.id}...`);
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: password,
    email_confirm: true
  });

  if (updateError) {
    console.error('Error updating auth user password:', updateError);
  } else {
    console.log('Auth user password updated successfully.');
  }
  
  console.log('\n--- Status ---');
  console.log('Email:', currentEmail);
  console.log('Password:', password);
}

updatePassword();
