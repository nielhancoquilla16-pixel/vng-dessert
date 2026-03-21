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

export const ContentProvider = ({ children }) => {
  const [siteVideos, setSiteVideos] = useState(() => {
    const saved = localStorage.getItem('vng_site_videos');
    return saved ? JSON.parse(saved) : defaultVideos;
  });

  useEffect(() => {
    localStorage.setItem('vng_site_videos', JSON.stringify(siteVideos));
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
