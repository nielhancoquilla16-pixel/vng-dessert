/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import adverVideo from '../assets/adver.mp4';
import promoVideo from '../assets/promo.mp4';

const ContentContext = createContext();

export const useContent = () => {
  const context = useContext(ContentContext);
  if (!context) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return context;
};

// Initial default videos
const defaultVideos = [
  { 
    id: 1, 
    src: adverVideo, 
    title: "Advertise Video", 
    text: "You want to know more about our leche flan? Watch this video to see how we make our delicious desserts and why customers love us!" 
  },
  { 
    id: 2, 
    src: promoVideo, 
    title: "Promotional Video", 
    text: "Check out our latest promo! Watch this video to see how our desserts can make your celebrations even sweeter." 
  }
];

const readStoredVideos = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultVideos;
  }

  try {
    const saved = localStorage.getItem('vng_site_videos');
    if (!saved) {
      return defaultVideos;
    }

    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : defaultVideos;
  } catch {
    try {
      localStorage.removeItem('vng_site_videos');
    } catch {
      // ignore storage errors
    }
    return defaultVideos;
  }
};

export const ContentProvider = ({ children }) => {
  const [siteVideos, setSiteVideos] = useState(() => readStoredVideos());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      localStorage.setItem('vng_site_videos', JSON.stringify(siteVideos));
    } catch {
      // ignore storage errors
    }
  }, [siteVideos]);

  const updateVideo = (id, newVideoData) => {
    setSiteVideos(prev => 
      prev.map(video => video.id === id ? { ...video, ...newVideoData } : video)
    );
  };

  return (
    <ContentContext.Provider value={{ siteVideos, updateVideo, defaultVideos }}>
      {children}
    </ContentContext.Provider>
  );
};
