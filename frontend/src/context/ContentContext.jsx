/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import adverVideo from '../assets/adver.mp4';
import promoVideo from '../assets/promo.mp4';
import { supabase } from '../lib/supabase';
import { resolveAssetUrl } from '../lib/publicUrl';

const ContentContext = createContext();
const STORAGE_KEY = 'vng_site_videos';
const STORAGE_VERSION = 2;
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 12;
const REFRESH_INTERVAL_MS = 1000 * 45;
const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const DATA_OR_BLOB_URL_PATTERN = /^(?:data:|blob:)/i;
const PLACEHOLDER_SRC_VALUES = new Set(['#', 'about:blank', 'null', 'undefined']);
const PLACEHOLDER_TEXT_VALUES = new Set(['#', 'n/a', 'na', 'none', 'null', 'undefined']);
const DEFAULT_VIDEO_SOURCE_MAP = {
  adverVideo,
  promoVideo,
};

const DEFAULT_VIDEO_SEEDS = [
  {
    id: 1,
    src: 'adverVideo',
    title: 'Advertise Video',
    text: 'Watch how V&G prepares creamy leche flan and why customers keep coming back.',
  },
  {
    id: 2,
    src: 'promoVideo',
    title: 'Promotional Video',
    text: 'Catch the latest V&G promos and seasonal dessert highlights in this feature video.',
  },
];

export const useContent = () => {
  const context = useContext(ContentContext);
  if (!context) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return context;
};

const resolveVideoSrc = (src, id) => {
  const normalizedSrc = String(src || '').trim();
  const lowerSrc = normalizedSrc.toLowerCase();
  const defaultSeed = DEFAULT_VIDEO_SEEDS.find((video) => video.id === id) || DEFAULT_VIDEO_SEEDS[0];

  if (!normalizedSrc || PLACEHOLDER_SRC_VALUES.has(lowerSrc)) {
    return defaultSeed ? resolveVideoSrc(defaultSeed.src, defaultSeed.id) : '';
  }

  if (DEFAULT_VIDEO_SOURCE_MAP[normalizedSrc]) {
    return DEFAULT_VIDEO_SOURCE_MAP[normalizedSrc];
  }

  // Recover older build-specific asset URLs so resets keep working after redeploys.
  if ((lowerSrc.includes('/assets/') || lowerSrc.startsWith('assets/')) && lowerSrc.includes('.mp4')) {
    if (id === 1 && lowerSrc.includes('adver')) {
      return adverVideo;
    }

    if (id === 2 && lowerSrc.includes('promo')) {
      return promoVideo;
    }
  }

  if (!ABSOLUTE_URL_PATTERN.test(normalizedSrc) && !DATA_OR_BLOB_URL_PATTERN.test(normalizedSrc)) {
    return resolveAssetUrl(normalizedSrc);
  }

  return normalizedSrc;
};

const serializeVideoSrc = (src) => {
  const normalizedSrc = String(src || '').trim();

  if (!normalizedSrc) {
    return '';
  }

  const matchingEntry = Object.entries(DEFAULT_VIDEO_SOURCE_MAP).find(
    ([, assetSrc]) => assetSrc === normalizedSrc
  );

  return matchingEntry ? matchingEntry[0] : normalizedSrc;
};

const normalizeVideo = (video, fallbackId) => {
  if (!video || typeof video !== 'object') {
    return null;
  }

  const id = Number.isFinite(Number(video.id)) ? Number(video.id) : fallbackId;
  const defaultSeed = DEFAULT_VIDEO_SEEDS.find((entry) => entry.id === id) || DEFAULT_VIDEO_SEEDS[0];
  const normalizedTitle = String(video.title || defaultSeed?.title || `Section ${id}`).trim();
  const normalizedTextRaw = String(video.text || '').trim();
  const normalizedText = !normalizedTextRaw || PLACEHOLDER_TEXT_VALUES.has(normalizedTextRaw.toLowerCase())
    ? String(defaultSeed?.text || '').trim()
    : normalizedTextRaw;

  return {
    id,
    src: resolveVideoSrc(video.src, id),
    title: normalizedTitle || String(defaultSeed?.title || `Section ${id}`).trim(),
    text: normalizedText,
    updatedAt: video.updatedAt || video.updated_at || null,
  };
};

const serializeVideo = (video, fallbackId) => {
  const normalizedVideo = normalizeVideo(video, fallbackId);

  if (!normalizedVideo) {
    return null;
  }

  return {
    id: normalizedVideo.id,
    src: serializeVideoSrc(normalizedVideo.src),
    title: normalizedVideo.title,
    text: normalizedVideo.text,
  };
};

// Initial default videos with actual URLs
const defaultVideos = DEFAULT_VIDEO_SEEDS
  .map((video, index) => normalizeVideo(video, index + 1))
  .filter(Boolean);

const sanitizeVideoList = (videos = defaultVideos) => {
  const list = Array.isArray(videos) ? videos : [];
  const mergedById = new Map(defaultVideos.map((video) => [video.id, video]));

  list.forEach((video, index) => {
    const normalized = normalizeVideo(video, index + 1);
    if (!normalized) {
      return;
    }

    mergedById.set(normalized.id, {
      ...(mergedById.get(normalized.id) || {}),
      ...normalized,
    });
  });

  return [...mergedById.values()].sort((a, b) => a.id - b.id);
};

const readStoredVideos = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultVideos;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return defaultVideos;
    }

    const parsed = JSON.parse(saved);

    // Backward compatibility for older cache shape (array only)
    if (Array.isArray(parsed)) {
      return sanitizeVideoList(parsed);
    }

    const version = Number(parsed?.version || 0);
    const savedAt = Number(parsed?.savedAt || 0);
    const videos = Array.isArray(parsed?.videos) ? parsed.videos : [];

    if (
      version !== STORAGE_VERSION
      || !savedAt
      || (Date.now() - savedAt) > CACHE_MAX_AGE_MS
    ) {
      return defaultVideos;
    }

    return sanitizeVideoList(videos);
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    return defaultVideos;
  }
};

export const ContentProvider = ({ children }) => {
  const isMountedRef = useRef(false);
  const [siteVideos, setSiteVideos] = useState(() => readStoredVideos());
  const [isLoadingFromDB, setIsLoadingFromDB] = useState(Boolean(supabase));
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncError, setSyncError] = useState('');

  const refreshSiteVideos = useCallback(async ({ silent = false } = {}) => {
    if (!supabase) {
      if (!silent && isMountedRef.current) {
        setIsLoadingFromDB(false);
      }

      return {
        ok: false,
        persisted: false,
        message: 'Supabase is not configured in this environment.',
      };
    }

    if (!silent && isMountedRef.current) {
      setIsLoadingFromDB(true);
    }

    try {
      const { data, error } = await supabase
        .from('site_content')
        .select('id, src, title, text, updated_at')
        .order('id', { ascending: true });

      if (error) {
        throw error;
      }

      const normalized = sanitizeVideoList(data || []);

      if (isMountedRef.current) {
        setSiteVideos(normalized);
        setSyncError('');
        setLastSyncedAt(new Date().toISOString());
      }

      return {
        ok: true,
        persisted: true,
        videos: normalized,
      };
    } catch (error) {
      if (isMountedRef.current) {
        setSyncError(error?.message || 'Unable to sync site content from Supabase.');
      }

      return {
        ok: false,
        persisted: false,
        message: error?.message || 'Unable to sync site content from Supabase.',
      };
    } finally {
      if (!silent && isMountedRef.current) {
        setIsLoadingFromDB(false);
      }
    }
  }, []);

  // Save to localStorage whenever videos change
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      const serializableVideos = siteVideos
        .map((video, index) => serializeVideo(video, index + 1))
        .filter(Boolean);

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: STORAGE_VERSION,
          savedAt: Date.now(),
          videos: serializableVideos,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [siteVideos]);

  // Load from Supabase on mount and setup real-time listener + periodic refresh fallback
  useEffect(() => {
    isMountedRef.current = true;

    if (!supabase) {
      setIsLoadingFromDB(false);
      return () => {
        isMountedRef.current = false;
      };
    }

    const refreshSilently = () => {
      void refreshSiteVideos({ silent: true });
    };

    void refreshSiteVideos();

    const channel = supabase
      .channel('site_content:sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_content',
        },
        refreshSilently,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          refreshSilently();
        }
      });

    const intervalId = window.setInterval(refreshSilently, REFRESH_INTERVAL_MS);
    const onFocus = () => refreshSilently();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSilently();
      }
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [refreshSiteVideos]);

  const updateVideo = useCallback(async (id, newVideoData) => {
    const previousVideos = sanitizeVideoList(siteVideos);
    const normalizedData = normalizeVideo(
      { ...previousVideos.find((video) => video.id === id), ...newVideoData },
      id
    );

    if (!normalizedData) {
      return {
        ok: false,
        message: 'The video details could not be prepared for saving.',
      };
    }

    if (!String(normalizedData.src || '').trim()) {
      return {
        ok: false,
        message: 'Please provide a valid video URL or choose the default video.',
      };
    }

    // Update local state immediately
    setSiteVideos((prev) =>
      sanitizeVideoList(prev).map((video) =>
        video.id === id ? normalizedData || video : video
      )
    );

    // Try to sync with Supabase
    if (supabase && normalizedData) {
      try {
        const payload = serializeVideo(normalizedData, id);
        const { data, error } = await supabase
          .from('site_content')
          .upsert(payload, { onConflict: 'id' })
          .select('id, src, title, text, updated_at')
          .single();

        if (error) {
          throw error;
        } else {
          const persistedVideo = normalizeVideo(data || payload, id) || normalizedData;
          setSiteVideos((prev) => (
            sanitizeVideoList(prev).map((video) => (video.id === id ? persistedVideo : video))
          ));
          setSyncError('');
          setLastSyncedAt(new Date().toISOString());
          return {
            ok: true,
            persisted: true,
          };
        }
      } catch (err) {
        setSiteVideos(previousVideos);
        setSyncError(err?.message || 'Failed to save the video to Supabase.');
        return {
          ok: false,
          message: err?.message || 'Failed to save the video to Supabase.',
        };
      }
    }

    return {
      ok: true,
      persisted: false,
      message: 'Saved locally only because Supabase is not configured.',
    };
  }, [siteVideos]);

  const contextValue = useMemo(() => ({
    siteVideos,
    updateVideo,
    defaultVideos,
    isLoadingFromDB,
    refreshSiteVideos,
    lastSyncedAt,
    syncError,
  }), [
    siteVideos,
    updateVideo,
    isLoadingFromDB,
    refreshSiteVideos,
    lastSyncedAt,
    syncError,
  ]);

  return (
    <ContentContext.Provider value={contextValue}>
      {children}
    </ContentContext.Provider>
  );
};
