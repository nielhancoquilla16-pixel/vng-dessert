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
  auth: { persistSession: false, autoRefreshToken: false },
});

const requiredSchema = {
  profiles: [
    'id',
    'username',
    'email',
    'full_name',
    'role',
    'address',
    'phone_number',
    'created_at',
  ],
  inventory: [
    'id',
    'ingredient_name',
    'stock_quantity',
    'unit',
    'status',
    'created_at',
    'updated_at',
  ],
  products: [
    'id',
    'product_name',
    'description',
    'price',
    'category',
    'stock_quantity',
    'availability',
    'image_url',
    'created_at',
    'updated_at',
  ],
  orders: [
    'id',
    'user_id',
    'order_code',
    'customer_name',
    'phone_number',
    'address',
    'delivery_method',
    'payment_method',
    'total_price',
    'order_status',
    'review_status',
    'review_reason',
    'review_status_updated_at',
    'cancellation_reason',
    'delivery_distance_km',
    'contains_leche_flan',
    'inventory_deducted_at',
    'qr_claimed_at',
    'ready_notified_at',
    'ready_notification_message',
    'receipt_image_url',
    'receipt_received_at',
    'notifications',
    'status_timestamps',
    'updated_at',
    'created_at',
  ],
  payment_checkouts: [
    'id',
    'user_id',
    'provider',
    'status',
    'payment_method',
    'reference_number',
    'checkout_session_id',
    'checkout_url',
    'amount',
    'currency',
    'customer_name',
    'customer_email',
    'phone_number',
    'address',
    'delivery_method',
    'delivery_distance_km',
    'line_items',
    'payment_intent_id',
    'payment_id',
    'failure_reason',
    'order_id',
    'paid_at',
    'created_at',
    'updated_at',
  ],
  order_issue_reports: [
    'id',
    'order_id',
    'user_id',
    'customer_name',
    'issue_type',
    'description',
    'evidence_image_url',
    'detection_date',
    'review_status',
    'review_reason',
    'reviewed_by',
    'reviewed_at',
    'created_at',
    'updated_at',
  ],
  order_items: [
    'id',
    'order_id',
    'product_id',
    'quantity',
    'price',
  ],
  carts: [
    'id',
    'user_id',
    'created_at',
  ],
  cart_items: [
    'id',
    'cart_id',
    'product_id',
    'quantity',
  ],
};

const requiredTables = Object.keys(requiredSchema);

const describeSchemaError = (error) => {
  if (!error) {
    return 'Unknown schema error';
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  if (error.message && typeof error.message === 'object') {
    return JSON.stringify(error.message);
  }

  return JSON.stringify(error);
};

const isMissingColumnError = (error) => {
  const message = describeSchemaError(error);
  const code = String(error?.code || error?.details?.code || error?.details?.error_code || '');

  return /does not exist|could not find the/i.test(message) || ['42703', 'PGRST204', 'PGRST205'].includes(code);
};

async function checkSchema() {
  console.log(`Checking schema for project: ${url}`);
  let hasIssues = false;

  for (const table of requiredTables) {
    const columns = requiredSchema[table] || [];
    const tableCheck = await supabase
      .from(table)
      .select('id', { head: true, count: 'exact' });

    if (tableCheck.error) {
      const message = describeSchemaError(tableCheck.error);
      if (/does not exist/i.test(message)) {
        hasIssues = true;
        console.log(`\nMissing table: ${table}`);
        continue;
      }
      hasIssues = true;
      console.log(`\nError checking table ${table}: ${message}`);
      continue;
    }

    const missingColumns = [];

    for (const column of columns) {
      const columnCheck = await supabase
        .from(table)
        .select(column, { head: true, count: 'exact' });

      if (columnCheck.error) {
        const message = describeSchemaError(columnCheck.error);
        if (isMissingColumnError(columnCheck.error) || !message || message === '{"message":""}') {
          missingColumns.push(column);
        } else {
          hasIssues = true;
          console.log(`\nError checking ${table}.${column}: ${message}`);
        }
      }
    }

    if (missingColumns.length) {
      hasIssues = true;
      console.log(`\nTable ${table} missing columns:`);
      missingColumns.forEach((col) => console.log(`- ${col}`));
    }
  }

  if (!hasIssues) {
    console.log('All required tables and columns are present.');
  }
}

checkSchema();
