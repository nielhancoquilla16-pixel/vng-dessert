/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useProducts } from './ProductContext';
import { useShopSettings } from './ShopSettingsContext';
import { apiRequest } from '../lib/api';
import { createChatFallbackReply, normalizeChatHistory } from '../utils/customerSupportChat';

const AIContext = createContext();
const AI_REQUEST_TIMEOUT_MS = 12000;
export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};

export const AIProvider = ({ children }) => {
  const { products } = useProducts();
  const { shopSettings, operatingHoursLabel, isShopOpen, isShopSettingsLoading, shopSettingsError } = useShopSettings();
  const currentShopHours = useRef({ shopSettings, operatingHoursLabel, isShopOpen, isShopSettingsLoading, shopSettingsError });
  const [recommendations] = useState([]);

  // A request may fail after the administrator changes the schedule. Read the
  // current provider values when creating its fallback, not its starting values.
  useEffect(() => {
    currentShopHours.current = { shopSettings, operatingHoursLabel, isShopOpen, isShopSettingsLoading, shopSettingsError };
  }, [shopSettings, operatingHoursLabel, isShopOpen, isShopSettingsLoading, shopSettingsError]);

  const createFallbackReply = useCallback((question) => (
    createChatFallbackReply(question, currentShopHours.current)
  ), []);

  const requestAIReply = useCallback(async (message, { history = [], productId } = {}) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

    let data;

    try {
      data = await apiRequest('/api/chat-messages', {
        method: 'POST',
        body: JSON.stringify({
          content: message,
          history: normalizeChatHistory(history),
          ...(productId != null ? { productId } : {}),
        }),
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

    return data?.data?.content || data?.reply || data?.answer;
  }, []);

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

  const generateIngredientCalculatorInsight = useCallback(({
    summary,
    productResults = [],
    selectedResult = null,
    ingredientRows = [],
  }) => {
    if (!summary || productResults.length === 0) {
      return {
        status: 'neutral',
        title: 'AI-Powered Insight',
        message: 'Enter ingredient quantities to see which product lines have the strongest production potential.',
        suggestions: [],
      };
    }

    const limitingCounts = productResults.reduce((counts, result) => {
      const ingredientName = String(result.limitingIngredientName || '').trim();
      if (!ingredientName) {
        return counts;
      }

      counts.set(ingredientName, (counts.get(ingredientName) || 0) + 1);
      return counts;
    }, new Map());

    const topConstraints = Array.from(limitingCounts.entries())
      .map(([ingredientName, count]) => ({ ingredientName, count }))
      .sort((left, right) => right.count - left.count || left.ingredientName.localeCompare(right.ingredientName));
    const producibleResults = productResults.filter((result) => result.quantity > 0);
    const topProduct = producibleResults[0] || productResults[0] || null;
    const leanIngredients = ingredientRows
      .filter((ingredient) => (Number(ingredient.quantity) || 0) > 0)
      .sort((left, right) => (Number(left.quantity) || 0) - (Number(right.quantity) || 0))
      .slice(0, 3)
      .map((ingredient) => ingredient.ingredientName);

    if (producibleResults.length === 0) {
      return {
        status: 'warning',
        title: 'AI-Powered Insight',
        message: topConstraints.length > 0
          ? `${topConstraints[0].ingredientName} is the main blocker right now, so your tracked recipes cannot complete a full production cycle yet.`
          : 'Your current stock is too low to complete any tracked recipe yet.',
        suggestions: [
          topConstraints[0] ? `Increase ${topConstraints[0].ingredientName} first to unlock the most products.` : '',
          topConstraints[1] ? `${topConstraints[1].ingredientName} is the next bottleneck to watch after your first restock.` : '',
          leanIngredients[0] ? `Review your thinnest live stock next: ${leanIngredients.join(', ')}.` : '',
        ].filter(Boolean),
      };
    }

    const selectedMessage = selectedResult
      ? (
          selectedResult.quantity > 0
            ? `${selectedResult.productName} can currently produce ${selectedResult.quantity} ${selectedResult.outputLabel}.`
            : `${selectedResult.productName} is blocked by ${selectedResult.limitingIngredientName || 'missing ingredients'}.`
        )
      : '';

    return {
      status: summary.totalProducts >= 4 ? 'good' : 'warning',
      title: 'AI-Powered Insight',
      message: `${topProduct.productName} has the strongest output right now with up to ${topProduct.quantity} ${topProduct.outputLabel}. ${selectedMessage}`.trim(),
      suggestions: [
        topConstraints[0] ? `Increase ${topConstraints[0].ingredientName}; it currently limits ${topConstraints[0].count} product lines.` : '',
        topConstraints[1] ? `Boost ${topConstraints[1].ingredientName} next to widen your production mix.` : '',
        leanIngredients[0] ? `Protect your smallest live stocks: ${leanIngredients.join(', ')}.` : '',
      ].filter(Boolean),
    };
  }, []);

  const queryProductAI = useCallback(async (product, question, history = []) => {
    try {
      const reply = await requestAIReply(question, { history, productId: product?.id });
      return reply || createFallbackReply(question);
    } catch (error) {
      console.error('AI Error:', error);
      return createFallbackReply(question);
    }
  }, [createFallbackReply, requestAIReply]);

  const queryGeneralAI = useCallback(async (question, history = []) => {
    try {
      const reply = await requestAIReply(question, { history });
      return reply || createFallbackReply(question);
    } catch (error) {
      console.error('AI Error:', error);
      return createFallbackReply(question);
    }
  }, [createFallbackReply, requestAIReply]);

  return (
    <AIContext.Provider
      value={{
        recommendations,
        getSmartRecommendations,
        generateAIInventoryReport,
        generateIngredientCalculatorInsight,
        queryProductAI,
        queryGeneralAI,
      }}
    >
      {children}
    </AIContext.Provider>
  );
};
