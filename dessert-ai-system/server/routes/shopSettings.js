import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { buildShopSettingsStatus, buildShopSettingsUpdate, getShopSettings, mapShopSettings } from '../lib/shopSettings.js';
import { createShopSettingsEvents } from '../lib/shopSettingsEvents.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

export const createShopSettingsRouter = ({
  getSupabase = getSupabaseAdmin,
  authenticate = requireAuth,
  authorizeAdmin = requireRole('admin'),
  now = () => new Date(),
  events = createShopSettingsEvents({ loadSettings: () => getShopSettings(getSupabase()), now }),
} = {}) => {
  const router = express.Router();

  const isMissingCustomerSupportColumn = (error) => (
    ['PGRST204', '42703'].includes(error?.code)
    && /customer_support/i.test([error?.message, error?.details, error?.hint].filter(Boolean).join(' '))
  );

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.set('Surrogate-Control', 'no-store');
    next();
  });

  router.get('/', async (req, res, next) => {
    try {
      res.json(buildShopSettingsStatus(await getShopSettings(getSupabase()), now()));
    } catch (error) {
      next(error);
    }
  });

  router.get('/events', async (req, res, next) => {
    let disconnected = false;
    let unsubscribe = () => {};
    const disconnect = () => {
      disconnected = true;
      unsubscribe();
    };
    req.on('close', disconnect);
    res.on('close', disconnect);
    try {
      const settings = await getShopSettings(getSupabase());
      if (disconnected || res.destroyed) return;
      res.set('Content-Type', 'text/event-stream; charset=utf-8');
      res.set('Connection', 'keep-alive');
      res.set('X-Accel-Buffering', 'no');
      res.flushHeaders();
      unsubscribe = events.subscribe(res, settings);
      if (disconnected) unsubscribe();
    } catch (error) {
      if (!disconnected) next(error);
    }
  });

  router.patch('/', authenticate, authorizeAdmin, async (req, res, next) => {
    try {
      const supabase = getSupabase();
      const current = await getShopSettings(supabase);
      const updates = buildShopSettingsUpdate(req.body || {}, current);
      const { data, error } = await supabase
        .from('shop_settings')
        .upsert(updates, { onConflict: 'id' })
        .select('*')
        .single();

      if (error) {
        if (isMissingCustomerSupportColumn(error)) {
          const migrationError = new Error('Customer support settings require a database update. Apply supabase/migrations/add_shop_customer_support.sql, then try again.');
          migrationError.status = 503;
          migrationError.errorCode = 'SHOP_CUSTOMER_SUPPORT_MIGRATION_REQUIRED';
          throw migrationError;
        }
        throw error;
      }
      if (!data) {
        const saveError = new Error('Shop settings could not be saved. Please try again.');
        saveError.status = 503;
        throw saveError;
      }
      const settings = mapShopSettings(data);
      events.publish(settings);
      res.json(buildShopSettingsStatus(settings, now()));
    } catch (error) {
      next(error);
    }
  });

  return router;
};

export default createShopSettingsRouter();
