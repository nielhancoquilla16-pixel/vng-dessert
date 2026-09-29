import { buildShopSettingsStatus } from './shopSettings.js';

// One database poll per server instance, regardless of the number of open tabs.
// PATCH publishes immediately; polling catches updates made on another instance.
export const createShopSettingsEvents = ({
  loadSettings,
  pollIntervalMs = 10000,
  heartbeatIntervalMs = 15000,
  now = () => new Date(),
  schedule = setInterval,
  unschedule = clearInterval,
}) => {
  const clients = new Set();
  let latestSettings = null;
  let latestSignature = '';
  let revision = 0;
  let polling = false;
  let pollTimer;
  let heartbeatTimer;

  const stopTimers = () => {
    if (pollTimer) unschedule(pollTimer);
    if (heartbeatTimer) unschedule(heartbeatTimer);
    pollTimer = undefined;
    heartbeatTimer = undefined;
  };

  const remove = (client) => {
    clients.delete(client);
    if (!clients.size) stopTimers();
  };

  const write = (client, message) => {
    if (client.destroyed || client.writableEnded) {
      remove(client);
      return;
    }
    try {
      // A stalled browser reconnects instead of retaining an unbounded buffer.
      if (client.write(message) === false) {
        remove(client);
        client.destroy();
      }
    } catch {
      remove(client);
      client.destroy();
    }
  };

  const event = (name, payload) => `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;

  const publish = (settings) => {
    const currentVersion = Date.parse(latestSettings?.updatedAt || '');
    const incomingVersion = Date.parse(settings?.updatedAt || '');
    if (Number.isFinite(currentVersion) && (!Number.isFinite(incomingVersion) || incomingVersion < currentVersion)) {
      return;
    }
    const status = buildShopSettingsStatus(settings, now());
    const signature = JSON.stringify({ ...settings, isOpen: status.isOpen });
    latestSettings = settings;
    revision += 1;
    if (signature === latestSignature) return;
    latestSignature = signature;
    const message = event('shop-settings', status);
    for (const client of clients) write(client, message);
  };

  const refresh = async () => {
    if (polling || clients.size === 0) return;
    polling = true;
    const startedRevision = revision;
    try {
      const settings = await loadSettings();
      // A PATCH may have completed while this older SELECT was still in flight.
      if (startedRevision === revision && clients.size > 0) publish(settings);
    } catch {
      if (startedRevision === revision) {
        // A successful read must notify clients again even if hours did not change.
        latestSignature = '';
        const message = event('shop-settings-unavailable', {
          message: 'Shop hours are temporarily unavailable. Reconnecting to the latest schedule.',
          serverTime: now().toISOString(),
        });
        for (const client of clients) write(client, message);
      }
    } finally {
      polling = false;
    }
  };

  const subscribe = (client, settings) => {
    publish(settings);
    clients.add(client);
    write(client, `retry: 3000\n${event('shop-settings', buildShopSettingsStatus(latestSettings, now()))}`);
    if (clients.size > 0 && !pollTimer) {
      pollTimer = schedule(() => void refresh(), pollIntervalMs);
      heartbeatTimer = schedule(() => {
        for (const connection of clients) write(connection, ': keepalive\n\n');
      }, heartbeatIntervalMs);
      pollTimer?.unref?.();
      heartbeatTimer?.unref?.();
    }
    return () => remove(client);
  };

  return { publish, subscribe };
};
