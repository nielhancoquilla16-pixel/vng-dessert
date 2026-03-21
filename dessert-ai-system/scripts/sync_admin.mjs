
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

async function syncAdmin() {
  const email = 'hanielcoquillajr16@gmail.com';
  const password = 'AdminPassword123!';
  const username = 'admin';

  console.log(`Checking if auth user exists for ${email}...`);
  const { data: { users }, error: uError } = await supabase.auth.admin.listUsers();
  const existingUser = users?.find(u => u.email === email);

  if (existingUser) {
    console.log(`Auth user already exists: ${existingUser.id}`);
    // If it exists, we just need to make sure the profile matches
    const { error: updateError } = await supabase.from('profiles').upsert({
      id: existingUser.id,
      email,
      username,
      role: 'admin'
    });
    if (updateError) console.error('Error upserting profile:', updateError);
    else console.log('Profile synced.');
    return;
  }

  console.log(`Deleting existing profile for ${email} if any...`);
  await supabase.from('profiles').delete().eq('email', email);

  console.log(`Creating auth user for ${email}...`);
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username }
  });

  if (createError) {
    console.error('Error creating auth user:', createError);
    return;
  }
  
  const userId = newUser.user.id;
  console.log(`Auth user created: ${userId}`);

  console.log(`Creating profile for ${email}...`);
  const { error: insertError } = await supabase.from('profiles').upsert({
    id: userId,
    email,
    username,
    role: 'admin'
  });

  if (insertError) {
    console.error('Error creating profile:', insertError);
  } else {
    console.log('Profile created and synced.');
  }

  console.log('\n--- Final Sync Status ---');
  console.log('Email:', email);
  console.log('Temp Password:', password);
}

syncAdmin();
