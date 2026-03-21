import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../dessert-ai-system/server/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase config');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const ADMIN_EMAIL = 'hanielcoquillajr16@gmail.com';
const TEMP_PASSWORD = 'Admin123!';

async function fixAdmin() {
  console.log(`Starting fix for admin: ${ADMIN_EMAIL}`);

  // 1. Create user in Auth
  console.log('Attempting to create user in Auth...');
  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: TEMP_PASSWORD,
      user_metadata: { role: 'admin' },
      email_confirm: true
    });

    if (authError) {
      console.error('Auth error detail:', JSON.stringify(authError, null, 2));
      
      // If it's a 500 error, let's try WITHOUT email_confirm as a fallback
      if (authError.status === 500) {
        console.log('Retrying without email_confirm...');
        const { data: authData2, error: authError2 } = await supabase.auth.admin.createUser({
          email: ADMIN_EMAIL,
          password: TEMP_PASSWORD,
          user_metadata: { role: 'admin' }
        });
        
        if (authError2) {
          throw authError2;
        }
        
        console.log('Auth user created on retry with ID:', authData2.user.id);
        await updateProfile(authData2.user.id);
        return;
      }
      
      if (authError.message.includes('already exists')) {
        console.log('User already exists in Auth. Fetching ID...');
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;
        const user = users.find(u => u.email === ADMIN_EMAIL);
        if (!user) throw new Error('User not found in list after "already exists" error');
        await updateProfile(user.id);
      } else {
        throw authError;
      }
    } else {
      console.log('Auth user created successfully with ID:', authData.user.id);
      await updateProfile(authData.user.id);
    }
  } catch (err) {
    console.error('Final catch error:', err);
  }
}

async function updateProfile(uid) {
  console.log(`Updating profile for ${ADMIN_EMAIL} with ID ${uid}...`);
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ id: uid })
    .eq('email', ADMIN_EMAIL);

  if (profileError) {
    console.error('Error updating profile:', profileError);
  } else {
    console.log('Profile updated successfully!');
  }
}

fixAdmin().catch(console.error);
