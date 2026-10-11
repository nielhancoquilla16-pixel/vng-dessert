import test from 'node:test';
import assert from 'node:assert/strict';
import { storeReceiptImage, hydrateReceiptImages, RECEIPT_IMAGES_BUCKET, RECEIPT_STORAGE_PREFIX } from '../../dessert-ai-system/server/lib/receiptImages.js';
import { hydrateOrderWithProfile, mapOrder } from '../../dessert-ai-system/server/lib/orderUtils.js';

const receipt = 'data:image/jpeg;base64,/9j/4A==';
test('receipt uploads store a compact reference and preserve the original bytes', async () => {
  const uploads = [];
  const client = { storage: { from: (bucket) => {
    assert.equal(bucket, RECEIPT_IMAGES_BUCKET);
    return { upload: async (...args) => { uploads.push(args); return { error: null }; } };
  } } };
  const reference = await storeReceiptImage(client, 'order-123', receipt);
  assert.match(reference, /^storage:\/\/order-receipts\/order-123\/[a-f0-9-]+\.jpg$/);
  assert.deepEqual(uploads[0][1], Buffer.from('/9j/4A==', 'base64'));
  assert.equal(uploads[0][2].contentType, 'image/jpeg');
  assert.equal(uploads[0][2].upsert, false);
});

test('private receipt links are signed without changing legacy receipts or stored rows', async () => {
  const path = 'order-123/receipt.jpg';
  const rows = [{ id: 'first', receipt_image_url: `${RECEIPT_STORAGE_PREFIX}${path}` },
    { id: 'second', receipt_image_url: receipt },
    { id: 'third', receipt_image_url: `${RECEIPT_STORAGE_PREFIX}${path}` }];
  let signatures = 0;
  const client = { storage: { from: () => ({ createSignedUrls: async (paths, seconds) => {
    signatures++;
    assert.deepEqual(paths, [path]);
    assert.equal(seconds, 3600);
    return { data: [{ path, signedUrl: 'https://storage.example/signed/receipt' }], error: null };
  } }) } };
  const hydrated = await hydrateReceiptImages(client, rows);
  assert.equal(signatures, 1);
  assert.equal(hydrated[0].receipt_image_url, 'https://storage.example/signed/receipt');
  assert.equal(hydrated[1].receipt_image_url, receipt);
  assert.equal(hydrated[2].receipt_image_url, hydrated[0].receipt_image_url);
  assert.equal(rows[0].receipt_image_url, `${RECEIPT_STORAGE_PREFIX}${path}`);
});

test('real order mapping exposes the signed receipt URL after profile hydration', async () => {
  const path = 'order-123/receipt.jpg';
  const client = {
    from: () => ({ select: () => ({ in: async () => ({ data: [{ id: 'customer', role: 'customer' }], error: null }) }) }),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [{ path, signedUrl: 'https://storage.example/signed/receipt' }], error: null }) }) },
  };
  const order = await hydrateOrderWithProfile(client, { id: 'order-123', user_id: 'customer', receipt_image_url: `${RECEIPT_STORAGE_PREFIX}${path}` });
  assert.equal(mapOrder(order).receiptImageUrl, 'https://storage.example/signed/receipt');
});

test('storage failures do not return unusable receipt references', async () => {
  const client = { storage: { from: () => ({
    upload: async () => ({ error: new Error('offline') }),
    createSignedUrls: async () => ({ data: [{ path: 'missing.jpg', error: 'missing' }], error: null }),
  }) } };
  await assert.rejects(storeReceiptImage(client, 'order-123', receipt), { status: 503 });
  await assert.rejects(hydrateReceiptImages(client, [{ receipt_image_url: `${RECEIPT_STORAGE_PREFIX}missing.jpg` }]), { status: 503 });
});
