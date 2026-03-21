import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useProducts } from './ProductContext';
import { useOrders } from './OrderContext';

const AIContext = createContext();
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? 'http://localhost:3001' : '');
const AI_REQUEST_TIMEOUT_MS = 2500;

export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};

export const AIProvider = ({ children }) => {
  const { products } = useProducts();
  const { orders } = useOrders();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [salesInsights, setSalesInsights] = useState(null);
  const [recommendations, setRecommendations] = useState([]);

  const buildMenuContext = useCallback(() => {
    const activeProducts = products.filter((p) => (!p.type || p.type === 'product') && p.stock > 0);
    return activeProducts.map((p) => `${p.name} (PHP ${p.price})`).join(', ');
  }, [products]);

  const createFallbackReply = useCallback((question, product = null) => {
    const text = (question || '').toLowerCase();
    const storeProducts = products.filter((p) => !p.type || p.type === 'product');
    const activeProducts = storeProducts.filter((p) => p.stock > 0);
    const featuredProduct = product || activeProducts[0] || storeProducts[0];
    const matchingProduct = storeProducts.find((p) => text.includes(p.name.toLowerCase()));
    const targetProduct = matchingProduct || featuredProduct;

    if (!text.trim()) {
      return 'Ask me about our desserts, prices, location, hours, delivery, or payment options.';
    }

    if (/(hi|hello|hey|good morning|good afternoon|good evening)/.test(text)) {
      return `Hi! I'm your V&G dessert assistant. I can help with ${targetProduct?.name || 'our menu'}, prices, delivery, store hours, and recommendations.`;
    }

    if (/(how are you|how're you|hows it going|how is it going|what's up|whats up)/.test(text)) {
      if (targetProduct) {
        return `I'm doing great and ready to help with ${targetProduct.name}. You can ask about the price, ingredients, stock, delivery, or anything else about the shop.`;
      }

      return "I'm doing great, thanks for asking. I'm here to help with our desserts, prices, delivery, store hours, and recommendations.";
    }

    if (/(thank you|thanks|ty)/.test(text)) {
      return targetProduct
        ? `You're welcome! If you want, I can also help with ${targetProduct.name}, similar desserts, delivery, or payment options.`
        : "You're welcome! If you want, I can help with dessert recommendations, prices, delivery, or store information.";
    }

    if (/(where|location|address|located)/.test(text)) {
      return 'We are located in Monark Subdivision, Las Pinas, Philippines.';
    }

    if (/(hour|open|close|time|schedule)/.test(text)) {
      return 'Our hours are Monday to Saturday, 8:00 AM to 8:00 PM, and Sunday, 9:00 AM to 6:00 PM.';
    }

    if (/(phone|contact|call|email)/.test(text)) {
      return 'You can reach V&G at 0977 385 4909 or vnglecheflan0824@gmail.com.';
    }

    if (/(deliver|delivery|ship|pickup|pick up)/.test(text)) {
      return 'We support delivery and pickup. Delivery currently adds PHP 50, and you can also choose pickup at checkout.';
    }

    if (/(gcash|cash|cod|payment|pay)/.test(text)) {
      return 'We accept GCash and cash. For deliveries, cash works as Cash on Delivery, and pickup orders can also be paid in cash.';
    }

    if (targetProduct && /(price|cost|how much)/.test(text)) {
      return `${targetProduct.name} is currently PHP ${targetProduct.price}.`;
    }

    if (targetProduct && /(stock|available|availability|have)/.test(text)) {
      if (targetProduct.stock > 0) {
        return `${targetProduct.name} is available right now with ${targetProduct.stock} in stock.`;
      }
      return `${targetProduct.name} is currently out of stock, but I can help you choose another dessert.`;
    }

    if (targetProduct && /(ingredient|ingredients|what is it made of|contains)/.test(text)) {
      const description = targetProduct.description?.trim();
      if (description) {
        return `${targetProduct.name}: ${description}`;
      }
      return `${targetProduct.name} is one of our available desserts. I can also help with price, stock, and recommendations.`;
    }

    if (/(recommend|suggest|best|popular|favorite)/.test(text)) {
      const recommended = [...activeProducts]
        .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
        .slice(0, 3);

      if (recommended.length > 0) {
        return `I recommend ${recommended.map((p) => `${p.name} (PHP ${p.price})`).join(', ')}.`;
      }

      return 'I can recommend from our available desserts once products are loaded.';
    }

    if (targetProduct) {
      return `I can help with ${targetProduct.name}, including price, stock, ingredients, delivery, hours, and payment options.`;
    }

    if (activeProducts.length > 0) {
      return `Our available desserts today include ${activeProducts.slice(0, 4).map((p) => p.name).join(', ')}. Ask me about any item, or about delivery, hours, and payment options.`;
    }

    return 'I can help with shop hours, location, delivery, payment options, and dessert recommendations.';
  }, [products]);

  const requestAIReply = useCallback(async (message, menuContext) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

    let response;

    try {
      response = await fetch(`${API_BASE_URL}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          menuContext,
        }),
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'AI backend unavailable');
    }

    return data.reply || data.answer;
  }, []);

  const analyzeSalesTrends = useCallback(() => {
    if (!orders || orders.length === 0) return;

    setIsAnalyzing(true);

    setTimeout(() => {
      const topProducts = [...products]
        .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
        .slice(0, 2);

      const insights = {
        summary: 'Your business is showing strong weekend growth.',
        details: [
          `Top-performing category: ${topProducts[0]?.category || 'Desserts'}`,
          'Peak ordering time: 2:00 PM - 5:00 PM (Snack hours)',
          'Customer retention is up by 15% due to new additions.',
          `Recommendation: Promote '${topProducts[1]?.name || 'new items'}' on social media to boost mid-week sales.`,
        ],
        trend: 'upward',
        confidence: 94,
      };

      setSalesInsights(insights);
      setIsAnalyzing(false);
    }, 1500);
  }, [orders, products]);

  const getSmartRecommendations = useCallback((currentProductId) => {
    if (!products) return [];

    const current = products.find((p) => p.id === currentProductId);
    if (!current) return products.slice(0, 3);

    return products
      .filter((p) => p.id !== currentProductId && (p.category === current.category || p.status === 'active'))
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);
  }, [products]);

  const generateAIInventoryReport = useCallback(() => {
    if (!products) return 'No data available';

    const lowStock = products.filter((p) => p.stock < 10 && p.stock > 0);
    const outOfStock = products.filter((p) => p.stock === 0);

    return {
      status: outOfStock.length > 0 ? 'warning' : 'good',
      message: outOfStock.length > 0
        ? `Llama AI Alert: ${outOfStock.length} items are sold out and losing potential revenue.`
        : 'Stock levels are currently optimized for current demand.',
      suggestions: lowStock.map((p) => `Restock ${p.name} before the weekend rush.`),
    };
  }, [products]);

  const queryProductAI = useCallback(async (product, question) => {
    const menuContext = buildMenuContext();

    try {
      const reply = await requestAIReply(
        `Product context for this chat: The customer is currently looking at ${product.name} (Category: ${product.category}, Price: PHP ${product.price}).\nCustomer Question: ${question}`,
        menuContext,
      );

      return reply || createFallbackReply(question, product);
    } catch (error) {
      console.error('AI Error:', error);
      return createFallbackReply(question, product);
    }
  }, [buildMenuContext, createFallbackReply, requestAIReply]);

  const queryGeneralAI = useCallback(async (question) => {
    const menuContext = buildMenuContext();

    try {
      const reply = await requestAIReply(question, menuContext);
      return reply || createFallbackReply(question);
    } catch (error) {
      console.error('AI Error:', error);
      return createFallbackReply(question);
    }
  }, [buildMenuContext, createFallbackReply, requestAIReply]);

  useEffect(() => {
    if (orders && orders.length > 0) {
      analyzeSalesTrends();
    }
  }, [orders, analyzeSalesTrends]);

  return (
    <AIContext.Provider
      value={{
        isAnalyzing,
        salesInsights,
        recommendations,
        analyzeSalesTrends,
        getSmartRecommendations,
        generateAIInventoryReport,
        queryProductAI,
        queryGeneralAI,
      }}
    >
      {children}
    </AIContext.Provider>
  );
};
