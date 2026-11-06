/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useProducts } from './ProductContext';
import { useShopSettings } from './ShopSettingsContext';
import { apiRequest } from '../lib/api';
import { createChatFallbackReply, createChatSession, normalizeChatHistory } from '../utils/customerSupportChat';
import { getCustomerProducts } from '../utils/customerProducts';
import { useAuth } from './AuthContext';

const AIContext = createContext();
const AI_REQUEST_TIMEOUT_MS = 15000;
export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};

export const AIProvider = ({ children }) => {
  const { products } = useProducts();
  const { profile, session: authSession } = useAuth();
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

  const requestAIReply = useCallback(async (message, { history = [], productId, recommendationState, signal } = {}) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeoutId = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

    let data;

    try {
      data = await apiRequest('/api/chat-messages', {
        method: 'POST',
        body: JSON.stringify({
          content: message,
          history: normalizeChatHistory(history),
          ...(recommendationState ? { recommendationState } : {}),
          ...(productId != null ? { productId } : {}),
        }),
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abort);
    }

    return { reply: data?.data?.content || data?.reply || data?.answer,
      recommendationState: data?.data?.ai?.recommendationState || data?.recommendationState };
  }, []);

  const conversationRef = useRef(null);
  if (!conversationRef.current) conversationRef.current = createChatSession({ requestReply: requestAIReply, fallback: createFallbackReply });
  const conversation = conversationRef.current;
  const chat = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot, conversation.getSnapshot);
  const identity = profile?.id || authSession?.user?.id || 'guest';
  useLayoutEffect(() => { conversation.reset(); }, [conversation, identity]);
  useEffect(() => () => conversation.reset(), [conversation]);

  const getSmartRecommendations = useCallback((currentProductId) => {
    const customerProducts = getCustomerProducts(products);

    const current = customerProducts.find((p) => p.id === currentProductId);
    if (!current) return customerProducts.slice(0, 3);

    return customerProducts
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

  const queryProductAI = useCallback((product, question) => conversation.send(question, { productId: product?.id }), [conversation]);
  const queryGeneralAI = useCallback((question) => conversation.send(question), [conversation]);

  return (
    <AIContext.Provider
      value={{
        recommendations,
        getSmartRecommendations,
        generateAIInventoryReport,
        generateIngredientCalculatorInsight,
        queryProductAI,
        queryGeneralAI,
        chatMessages: chat.messages,
        isChatSending: chat.isSending,
        chatSessionVersion: chat.sessionVersion,
        resetChat: conversation.reset,
      }}
    >
      {children}
    </AIContext.Provider>
  );
};
