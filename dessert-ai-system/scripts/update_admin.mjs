
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

async function updateAdmin() {
  const currentEmail = 'hanielcoquillajr16+admin@gmail.com';
  const targetEmail = 'hanielcoquillajr16@gmail.com';
  const password = 'AdminPassword123!';

  console.log(`Searching for user with email ${currentEmail}...`);
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  const user = users?.find(u => u.email === currentEmail);

  if (!user) {
    console.error(`User with email ${currentEmail} not found.`);
    return;
  }

  console.log(`Updating user ${user.id}...`);
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    email: targetEmail,
    password: password,
    email_confirm: true
  });

  if (updateError) {
    console.error('Error updating auth user:', updateError);
    return;
  }
  console.log('Auth user updated successfully.');

  console.log('Updating profile email...');
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ email: targetEmail })
    .eq('id', user.id);

  if (profileError) {
    console.error('Error updating profile email:', profileError);
  } else {
    console.log('Profile email updated successfully.');
  }

  console.log('\n--- Credentials Updated ---');
  console.log('Email:', targetEmail);
  console.log('Password:', password);
}

updateAdmin();
