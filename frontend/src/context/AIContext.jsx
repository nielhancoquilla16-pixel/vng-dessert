/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback } from 'react';
import { useProducts } from './ProductContext';

const AIContext = createContext();
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? 'http://localhost:3001' : '');
const AI_REQUEST_TIMEOUT_MS = 12000;
const CAPITALS = {
  australia: 'Canberra',
  canada: 'Ottawa',
  china: 'Beijing',
  france: 'Paris',
  germany: 'Berlin',
  india: 'New Delhi',
  indonesia: 'Jakarta',
  italy: 'Rome',
  japan: 'Tokyo',
  malaysia: 'Kuala Lumpur',
  philippines: 'Manila',
  singapore: 'Singapore',
  'south korea': 'Seoul',
  spain: 'Madrid',
  thailand: 'Bangkok',
  'united kingdom': 'London',
  uk: 'London',
  'united states': 'Washington, D.C.',
  usa: 'Washington, D.C.',
};
const TOPIC_EXPLANATIONS = [
  {
    pattern: /\b(ai|artificial intelligence)\b/,
    reply: 'Artificial intelligence is technology that helps computers do tasks that usually need human thinking, like understanding language, recognizing patterns, and making predictions.',
  },
  {
    pattern: /\bmachine learning\b/,
    reply: 'Machine learning is a branch of AI where systems learn patterns from data so they can make predictions or decisions without being manually programmed for every case.',
  },
  {
    pattern: /\bapi\b/,
    reply: 'An API is a set of rules that lets one app talk to another app so they can share data or trigger actions.',
  },
  {
    pattern: /\bhtml\b/,
    reply: 'HTML is the structure of a web page. It defines things like headings, paragraphs, buttons, images, and forms.',
  },
  {
    pattern: /\bcss\b/,
    reply: 'CSS controls how a web page looks, including colors, spacing, layout, fonts, and animations.',
  },
  {
    pattern: /\bjavascript\b|\bjs\b/,
    reply: 'JavaScript is the programming language that makes web pages interactive, like handling clicks, updating content, and calling APIs.',
  },
  {
    pattern: /\breact\b/,
    reply: 'React is a JavaScript library for building user interfaces from reusable components.',
  },
  {
    pattern: /\bnode\b|\bnode\.js\b/,
    reply: 'Node.js lets you run JavaScript outside the browser, which is why it is often used for backend servers and tools.',
  },
];

const getPhilippineNow = () => new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });

const solveBasicMath = (question = '') => {
  const candidate = String(question)
    .toLowerCase()
    .replace(/what is|what's|calculate|compute|solve|equals|\?/g, '')
    .trim();

  if (!candidate || !/^[\d\s()+\-*/%.]+$/.test(candidate)) {
    return '';
  }

  try {
    const result = Function(`"use strict"; return (${candidate});`)();
    return Number.isFinite(result) ? String(result) : '';
  } catch {
    return '';
  }
};

const getCapitalReply = (question = '') => {
  const match = String(question).toLowerCase().match(/capital of ([a-z\s.]+)/);
  if (!match) {
    return '';
  }

  const country = match[1].replace(/[?.!,]/g, '').trim();
  const capital = CAPITALS[country];
  return capital ? `The capital of ${country} is ${capital}.` : '';
};

const getDefinitionReply = (question = '') => {
  const text = String(question).toLowerCase();
  if (!/(what is|what's|define|explain)/.test(text)) {
    return '';
  }

  const entry = TOPIC_EXPLANATIONS.find((item) => item.pattern.test(text));
  return entry ? entry.reply : '';
};

const getLiveDataReply = (question = '') => {
  const text = String(question).toLowerCase();
  if (/(weather|forecast|news|headline|stock price|exchange rate|traffic|sports score|live score|current president|latest election|today's rate|bitcoin price)/.test(text)) {
    return 'I cannot verify live updates from the fallback mode, but I can still help with general explanations or store-related questions.';
  }

  return '';
};

const getSensitiveAdviceReply = (question = '') => {
  const text = String(question).toLowerCase();
  if (/(medicine|medical|symptom|diagnose|diagnosis|legal advice|lawyer|lawsuit|investment advice|financial advice|crypto advice)/.test(text)) {
    return 'I can give general information, but for medical, legal, or financial decisions it is best to check with a qualified professional.';
  }

  return '';
};

export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};

export const AIProvider = ({ children }) => {
  const { products } = useProducts();
  const [recommendations] = useState([]);

  const buildMenuContext = useCallback(() => {
    const activeProducts = products.filter((p) => (!p.type || p.type === 'product') && p.stock > 0);
    return activeProducts.map((p) => `${p.name} (PHP ${p.price})`).join(', ');
  }, [products]);

  const createFallbackReply = useCallback((question, product = null) => {
    const text = (question || '').toLowerCase();
    const mathResult = solveBasicMath(text);
    const capitalReply = getCapitalReply(text);
    const definitionReply = getDefinitionReply(text);
    const liveDataReply = getLiveDataReply(text);
    const sensitiveAdviceReply = getSensitiveAdviceReply(text);
    const storeProducts = products.filter((p) => !p.type || p.type === 'product');
    const activeProducts = storeProducts.filter((p) => p.stock > 0);
    const featuredProduct = product || activeProducts[0] || storeProducts[0];
    const matchingProduct = storeProducts.find((p) => text.includes(p.name.toLowerCase()));
    const targetProduct = matchingProduct || featuredProduct;

    if (!text.trim()) {
      return 'Ask me about our desserts, prices, location, hours, delivery, or payment options.';
    }

    if (/(^|\b)(hi|hello|hey|yo|good morning|good afternoon|good evening)\b/.test(text)) {
      return `Hi! I'm your V&G assistant. I can help with ${targetProduct?.name || 'our menu'}, store info, and simple general questions too.`;
    }

    if (/(who are you|what are you|your name)/.test(text)) {
      return "I'm V&G Llama AI. I can help with dessert questions, store details, and simple general questions.";
    }

    if (/(how are you|how are u|how're you|hows it going|how is it going|what's up|whats up)/.test(text)) {
      if (targetProduct) {
        return `I'm doing great and ready to help with ${targetProduct.name}. You can ask about the price, ingredients, stock, delivery, or anything else about the shop.`;
      }

      return "I'm doing great, thanks for asking. I'm here to help with our desserts, prices, delivery, store hours, and recommendations.";
    }

    if (/(what can you do|can you help|help me|what do you do|what can u do)/.test(text)) {
      return 'I can answer many customer questions, explain simple topics, help write short captions or messages, and assist with V&G desserts, prices, recommendations, location, store hours, delivery, and payment options.';
    }

    if (/(how old are you|your age|when were you made|when were you created)/.test(text)) {
      return "I'm a virtual assistant, so I don't have a human age, but I'm here and ready to help anytime.";
    }

    if (/(who created you|who built you|who made you)/.test(text)) {
      return "I was set up as V&G's AI assistant to help customers with dessert questions, store info, and simple conversation.";
    }

    if (/(greg|vergie|founder|owner|who started|who made)/.test(text)) {
      return 'Greg and Vergie are the founders of V&G Leche Flan.';
    }

    if (/(time|date|today|day now)/.test(text)) {
      return `The current date and time in the Philippines is ${getPhilippineNow()}.`;
    }

    if (mathResult) {
      return `The answer is ${mathResult}.`;
    }

    if (capitalReply) {
      return capitalReply;
    }

    if (definitionReply) {
      return definitionReply;
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

    if (/(joke|funny|make me laugh)/.test(text)) {
      return "Here's one: Why did the leche flan never panic? Because it always stayed smooth under pressure.";
    }

    if (/(fun fact|interesting fact)/.test(text)) {
      return 'Fun fact: caramel forms its deep flavor when sugar is heated and breaks down into hundreds of new aroma compounds.';
    }

    if (/(favorite color|favourite color)/.test(text)) {
      return "Probably caramel gold. It feels very on-brand for V&G.";
    }

    if (liveDataReply) {
      return liveDataReply;
    }

    if (sensitiveAdviceReply) {
      return sensitiveAdviceReply;
    }

    if (/(hungry|i'm hungry|im hungry|craving|want something sweet)/.test(text)) {
      if (targetProduct) {
        return `If you're craving something sweet, ${targetProduct.name} sounds like a great choice right now.`;
      }

      return 'You picked the right place for something sweet. Ask me what dessert to try.';
    }

    if (/(sad|tired|stressed|bored)/.test(text)) {
      return 'I hope your day gets a little better. If you want, I can keep chatting or recommend something sweet from the menu.';
    }

    if (/(i love you|love you)/.test(text)) {
      return "That's sweet of you. I'm always here to help and chat.";
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

    if (/(caption|tagline|slogan|bio|introduction|apology message|birthday message|invitation message|short message)/.test(text)) {
      return 'Yes, I can help write that. Tell me the topic, tone, and length you want, and I can draft it for you.';
    }

    if (/(study tip|study tips|how to study|exam tip|exam tips|review tip|review tips)/.test(text)) {
      return 'A simple study plan is: break the topic into small parts, review in short focused sessions, quiz yourself without notes, and repeat the hard parts the next day.';
    }

    if (/(motivate me|motivation|encourage me|i want to give up|i feel tired)/.test(text)) {
      return 'You do not need to finish everything at once. Start with one small step, build momentum, and keep going one task at a time.';
    }

    if (/(how do i code|how to code|learn programming|learn coding|programming tips|coding tips)/.test(text)) {
      return 'A strong way to learn programming is to build small projects, practice every day, read working code, and debug patiently instead of rushing for perfect answers.';
    }

    if (/(bye|goodbye|see you|see ya|later)/.test(text)) {
      return "See you next time. If you need dessert recommendations or store info later, I'm here.";
    }

    if (targetProduct) {
      return `I can help with ${targetProduct.name}, including price, stock, ingredients, delivery, hours, and payment options.`;
    }

    if (activeProducts.length > 0) {
      return `Our available desserts today include ${activeProducts.slice(0, 4).map((p) => p.name).join(', ')}. Ask me about any item, or about delivery, hours, and payment options.`;
    }

    return 'I can help with a wide range of customer questions, simple explanations, casual conversation, and V&G shop concerns. Ask in a more specific way and I will do my best to give a clear answer.';
  }, [products]);

  const requestAIReply = useCallback(async (message, menuContext) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

    let response;

    try {
      response = await fetch(`${API_BASE_URL}/api/chat-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: message,
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

    return data?.data?.content || data.reply || data.answer;
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

  return (
    <AIContext.Provider
      value={{
        recommendations,
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
