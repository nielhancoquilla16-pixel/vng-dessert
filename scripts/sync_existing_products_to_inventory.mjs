import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const getTodayDateKey = () => new Date().toISOString().slice(0, 10);

const buildProductInventoryBatchId = (productId) => {
  const compactId = String(productId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return compactId ? `TRAY-${compactId}` : `TRAY-${Date.now()}`;
};

const syncProductToInventory = async (product) => {
  const batchId = buildProductInventoryBatchId(product.id);
  const dateCreated = product.date_created || getTodayDateKey();
  
  // Use expiration_date if available, otherwise set it to 30 days from now
  const expirationDate = product.expiration_date || (() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  })();

  const inventoryRow = {
    ingredient_name: product.product_name,
    product_name: product.product_name,
    batch_id: batchId,
    stock_quantity: product.stock_quantity || 0,
    unit: 'pcs',
    date_created: dateCreated,
    expiration_date: expirationDate,
    status: 'fresh',
  };

  try {
    // Check if batch already exists
    const { data: existingBatch } = await supabase
      .from('inventory')
      .select('id')
      .eq('batch_id', batchId)
      .maybeSingle();

    if (existingBatch?.id) {
      console.log(`  Updating existing batch ${batchId}...`);
      const { error } = await supabase
        .from('inventory')
        .update(inventoryRow)
        .eq('id', existingBatch.id);

      if (error) {
        console.error(`    Error updating: ${error.message}`);
        return false;
      }
    } else {
      console.log(`  Creating new batch ${batchId}...`);
      const { error } = await supabase
        .from('inventory')
        .insert(inventoryRow);

      if (error) {
        console.error(`    Error creating: ${error.message}`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error(`  Unexpected error: ${error.message}`);
    return false;
  }
};

const main = async () => {
  console.log('Starting product-to-inventory sync...\n');

  try {
    // Fetch all products
    console.log('Fetching all products...');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*');

    if (productsError) {
      console.error('Error fetching products:', productsError.message);
      process.exit(1);
    }

    if (!products || products.length === 0) {
      console.log('No products found.');
      process.exit(0);
    }

    console.log(`Found ${products.length} products. Syncing to inventory...\n`);

    let successCount = 0;
    let failureCount = 0;

    for (const product of products) {
      console.log(`Processing: ${product.product_name}`);
      const success = await syncProductToInventory(product);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    console.log(`\n✅ Sync complete!`);
    console.log(`   Successfully synced: ${successCount}/${products.length}`);
    if (failureCount > 0) {
      console.log(`   Failed: ${failureCount}/${products.length}`);
    }
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
};

main();
