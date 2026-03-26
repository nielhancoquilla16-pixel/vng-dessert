import { isSupabaseConfigured, supabase } from './supabase';

const DEFAULT_DEBOUNCE_MS = 200;

export const subscribeToDatabaseChanges = ({
  channelName,
  tables = [],
  onChange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}) => {
  if (
    typeof window === 'undefined'
    || !isSupabaseConfigured
    || !supabase
    || !channelName
    || !Array.isArray(tables)
    || tables.length === 0
    || typeof onChange !== 'function'
  ) {
    return () => {};
  }

  let isDisposed = false;
  let timeoutId = null;

  const runRefresh = async () => {
    if (isDisposed) {
      return;
    }

    try {
      await onChange();
    } catch (error) {
      console.error(`Realtime sync failed for ${channelName}:`, error);
    }
  };

  const scheduleRefresh = () => {
    if (isDisposed || timeoutId) {
      return;
    }

    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      void runRefresh();
    }, debounceMs);
  };

  const channel = supabase.channel(channelName);

  tables.forEach((table) => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      scheduleRefresh,
    );
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      scheduleRefresh();
    }
  });

  return () => {
    isDisposed = true;

    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }

    void supabase.removeChannel(channel);
  };
};
