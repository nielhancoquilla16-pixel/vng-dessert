import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vng_product_favorites';
const CHANGE_EVENT = 'vng:favorites-changed';
const readFavorites = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch {
    return new Set();
  }
};

export default function useProductFavorite(productId) {
  const id = String(productId);
  const [isFavorite, setIsFavorite] = useState(() => readFavorites().has(id));
  useEffect(() => {
    const sync = () => setIsFavorite(readFavorites().has(id));
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [id]);
  const toggleFavorite = () => {
    const favorites = readFavorites();
    const next = !isFavorite;
    if (next) favorites.add(id); else favorites.delete(id);
    setIsFavorite(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // Keep the heart usable for this visit when storage is unavailable.
    }
  };
  return { isFavorite, toggleFavorite };
}
