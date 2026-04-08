import React, { useEffect, useState } from 'react';

const SHARED_IFRAME_STYLE = {
  border: 'none',
  overflow: 'hidden',
};

const isFacebookUrl = (url) => (
  url.includes('facebook.com') || url.includes('fb.watch')
);

const isDirectVideoUrl = (url) => (
  /\.(mp4|webm|ogg|mov|m4v)(?:$|[?#])/i.test(url)
);

const getYouTubeVideoId = (url) => {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      return parsedUrl.pathname.split('/').filter(Boolean)[0] || '';
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsedUrl.pathname === '/watch') {
        return parsedUrl.searchParams.get('v') || '';
      }

      const [, firstSegment, secondSegment] = parsedUrl.pathname.split('/');
      if (firstSegment === 'embed' || firstSegment === 'shorts') {
        return secondSegment || '';
      }
    }
  } catch {
    return '';
  }

  return '';
};

const getVimeoVideoId = (url) => {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.replace(/^www\./, '');

    if (host !== 'vimeo.com' && host !== 'player.vimeo.com') {
      return '';
    }

    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
};

const MediaEmbed = ({ url, title = 'Embedded media', controls = true }) => {
  const normalizedUrl = String(url || '').trim();
  const [hasDirectVideoError, setHasDirectVideoError] = useState(false);

  useEffect(() => {
    setHasDirectVideoError(false);
  }, [normalizedUrl]);

  if (!normalizedUrl) {
    return null;
  }

  if (isFacebookUrl(normalizedUrl)) {
    const facebookSrc = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(normalizedUrl)}&show_text=0`;

    return (
      <iframe
        title={title}
        src={facebookSrc}
        width="100%"
        height="100%"
        style={SHARED_IFRAME_STYLE}
        scrolling="no"
        frameBorder="0"
        allowFullScreen
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
      />
    );
  }

  const youtubeVideoId = getYouTubeVideoId(normalizedUrl);
  if (youtubeVideoId) {
    return (
      <iframe
        title={title}
        src={`https://www.youtube.com/embed/${youtubeVideoId}`}
        width="100%"
        height="100%"
        style={SHARED_IFRAME_STYLE}
        frameBorder="0"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      />
    );
  }

  const vimeoVideoId = getVimeoVideoId(normalizedUrl);
  if (vimeoVideoId) {
    return (
      <iframe
        title={title}
        src={`https://player.vimeo.com/video/${vimeoVideoId}`}
        width="100%"
        height="100%"
        style={SHARED_IFRAME_STYLE}
        frameBorder="0"
        allowFullScreen
        allow="autoplay; fullscreen; picture-in-picture"
      />
    );
  }

  if (isDirectVideoUrl(normalizedUrl) && !hasDirectVideoError) {
    return (
      <video
        key={normalizedUrl}
        src={normalizedUrl}
        controls={controls}
        width="100%"
        height="100%"
        playsInline
        preload="metadata"
        onError={() => setHasDirectVideoError(true)}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
        textAlign: 'center',
        color: '#cbd5e1',
      }}
    >
      <div>
        <p style={{ margin: '0 0 0.75rem' }}>Preview unavailable for this link.</p>
        <a
          href={normalizedUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#f8fafc', textDecoration: 'underline' }}
        >
          Open media in a new tab
        </a>
      </div>
    </div>
  );
};

export default MediaEmbed;
