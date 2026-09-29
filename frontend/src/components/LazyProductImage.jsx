import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import './LazyProductImage.css';

const TRANSFORM_WIDTHS = [320, 480, 720];

const buildSupabaseImageSources = (source) => {
  try {
    const originalUrl = new URL(source);
    const objectPath = '/storage/v1/object/public/';

    if (!originalUrl.pathname.includes(objectPath)) {
      return null;
    }

    const transformPath = originalUrl.pathname.replace(objectPath, '/storage/v1/render/image/public/');
    const variants = TRANSFORM_WIDTHS.map((width) => {
      const variant = new URL(originalUrl);
      variant.pathname = transformPath;
      variant.searchParams.set('width', String(width));
      variant.searchParams.set('height', String(width));
      variant.searchParams.set('resize', 'cover');
      variant.searchParams.set('quality', '75');
      return `${variant.toString()} ${width}w`;
    });

    const defaultSource = new URL(originalUrl);
    defaultSource.pathname = transformPath;
    defaultSource.searchParams.set('width', '480');
    defaultSource.searchParams.set('height', '480');
    defaultSource.searchParams.set('resize', 'cover');
    defaultSource.searchParams.set('quality', '75');

    return {
      srcSet: variants.join(', '),
      defaultSrc: defaultSource.toString(),
    };
  } catch {
    return null;
  }
};

const LazyProductImage = ({ src, alt }) => {
  const mediaRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(() => typeof IntersectionObserver === 'undefined');
  const [isLoaded, setIsLoaded] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const responsiveSources = useMemo(() => buildSupabaseImageSources(src), [src]);

  useEffect(() => {
    if (!src || shouldLoad) {
      return undefined;
    }

    const media = mediaRef.current;
    if (!media) {
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '280px 0px', threshold: 0 });

    observer.observe(media);
    return () => observer.disconnect();
  }, [src, shouldLoad]);

  const handleError = () => {
    if (responsiveSources && !useOriginal) {
      setUseOriginal(true);
      setIsLoaded(false);
      return;
    }
    setHasFailed(true);
  };

  const displayFallback = !src || hasFailed;

  return (
    <span className="lazy-product-media" ref={mediaRef}>
      {!isLoaded && !displayFallback && (
        <span className="lazy-product-placeholder" aria-hidden="true" />
      )}
      {displayFallback && (
        <span className="lazy-product-fallback" role="img" aria-label={`${alt} image unavailable`}>
          <ImageOff size={30} strokeWidth={1.6} aria-hidden="true" />
          <span>Image unavailable</span>
        </span>
      )}
      {src && !hasFailed && (
        <img
          className={`shop-product-image${isLoaded ? ' is-loaded' : ''}`}
          src={shouldLoad ? (useOriginal ? src : (responsiveSources?.defaultSrc || src)) : undefined}
          srcSet={shouldLoad && !useOriginal ? responsiveSources?.srcSet : undefined}
          sizes="(max-width: 349px) 100vw, (max-width: 699px) 50vw, (max-width: 1099px) 33vw, 25vw"
          alt={alt}
          width="720"
          height="720"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onLoad={() => setIsLoaded(true)}
          onError={handleError}
        />
      )}
    </span>
  );
};

export default LazyProductImage;
