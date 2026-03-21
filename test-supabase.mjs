import fetch from 'node-fetch';

const SUPABASE_URL = "https://uqniavennyrfdyakmxan.supabase.co";
const KEY = "sb_publishable_PyzzgbMVWcRytW0Ux_lIAg_NysCbP5s"; // Note: This looks like a Stripe key

async function testSupabase() {
  console.log(`Testing connection to ${SUPABASE_URL}...`);
  try {
    const response = await fetch(SUPABASE_URL, {
      method: "GET",
      headers: {
        "apikey": KEY,
        "Authorization": `Bearer ${KEY}`,
        "Content-Type": "application/json"
      }
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    const data = await response.json().catch(() => null);
    if (data) {
      console.log('Response data:', data);
    } else {
      console.log('Response was not JSON or empty.');
    }
  } catch (error) {
    console.error('Fetch failed:', error.message);
  }
}

testSupabase();
