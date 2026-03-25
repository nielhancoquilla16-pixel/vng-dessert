import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const SHOP_INFO = {
  location: "Monark Subdivision, Las Pinas, Philippines",
  hours: "Monday to Saturday, 8:00 AM to 8:00 PM, and Sunday, 9:00 AM to 6:00 PM",
  phone: "0977 385 4909",
  email: "vnglecheflan0824@gmail.com",
  founders: "Greg and Vergie",
};

const CAPITALS = {
  australia: "Canberra",
  canada: "Ottawa",
  china: "Beijing",
  france: "Paris",
  germany: "Berlin",
  india: "New Delhi",
  indonesia: "Jakarta",
  italy: "Rome",
  japan: "Tokyo",
  malaysia: "Kuala Lumpur",
  philippines: "Manila",
  singapore: "Singapore",
  "south korea": "Seoul",
  spain: "Madrid",
  thailand: "Bangkok",
  "united kingdom": "London",
  uk: "London",
  "united states": "Washington, D.C.",
  usa: "Washington, D.C.",
};

const TOPIC_EXPLANATIONS = [
  {
    pattern: /\b(ai|artificial intelligence)\b/,
    reply: "Artificial intelligence is technology that helps computers do tasks that usually need human thinking, like understanding language, recognizing patterns, and making predictions.",
  },
  {
    pattern: /\bmachine learning\b/,
    reply: "Machine learning is a branch of AI where systems learn patterns from data so they can make predictions or decisions without being manually programmed for every case.",
  },
  {
    pattern: /\bapi\b/,
    reply: "An API is a set of rules that lets one app talk to another app so they can share data or trigger actions.",
  },
  {
    pattern: /\bhtml\b/,
    reply: "HTML is the structure of a web page. It defines things like headings, paragraphs, buttons, images, and forms.",
  },
  {
    pattern: /\bcss\b/,
    reply: "CSS controls how a web page looks, including colors, spacing, layout, fonts, and animations.",
  },
  {
    pattern: /\bjavascript\b|\bjs\b/,
    reply: "JavaScript is the programming language that makes web pages interactive, like handling clicks, updating content, and calling APIs.",
  },
  {
    pattern: /\breact\b/,
    reply: "React is a JavaScript library for building user interfaces from reusable components.",
  },
  {
    pattern: /\bnode\b|\bnode\.js\b/,
    reply: "Node.js lets you run JavaScript outside the browser, which is why it is often used for backend servers and tools.",
  },
  {
    pattern: /\bdatabase\b/,
    reply: "A database is a structured place to store and retrieve information, like users, products, and orders.",
  },
];

export const getPhilippineNow = () => new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });

const parseMenuItems = (menuContext = "") => (
  String(menuContext)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);

export const hasGroqApiKey = () => Boolean(String(process.env.GROQ_API_KEY || "").trim());

const getAiMode = () => (hasGroqApiKey() ? "groq" : "local-fallback");

const solveBasicMath = (message = "") => {
  const candidate = String(message)
    .toLowerCase()
    .replace(/what is|what's|calculate|compute|solve|equals|\?/g, "")
    .trim();

  if (!candidate || !/^[\d\s()+\-*/%.]+$/.test(candidate)) {
    return "";
  }

  try {
    const result = Function(`"use strict"; return (${candidate});`)();
    return Number.isFinite(result) ? String(result) : "";
  } catch {
    return "";
  }
};

const buildAiMeta = (overrides = {}) => ({
  ok: true,
  groqConfigured: hasGroqApiKey(),
  mode: getAiMode(),
  ...overrides,
});

export const getAiStatusPayload = (overrides = {}) => {
  const groqConfigured = hasGroqApiKey();

  return {
    ...buildAiMeta(),
    status: "ok",
    ready: true,
    source: groqConfigured ? "groq" : "local-fallback",
    capabilities: {
      storeQuestions: true,
      generalQuestions: true,
      alwaysResponds: true,
      liveModel: groqConfigured,
    },
    message: groqConfigured
      ? "Groq AI is configured and ready for broad customer questions."
      : "Groq AI is not configured. Safe local fallback mode is active and will still answer common customer questions without errors.",
    ...overrides,
  };
};

const getCapitalReply = (normalized) => {
  const match = normalized.match(/capital of ([a-z\s.]+)/);

  if (!match) {
    return "";
  }

  const country = match[1].replace(/[?.!,]/g, "").trim();
  const capital = CAPITALS[country];

  return capital ? `The capital of ${country} is ${capital}.` : "";
};

const getDefinitionReply = (normalized) => {
  if (!/(what is|what's|define|explain)/.test(normalized)) {
    return "";
  }

  const match = TOPIC_EXPLANATIONS.find((entry) => entry.pattern.test(normalized));
  return match ? match.reply : "";
};

const getWritingHelpReply = (normalized) => {
  if (/(caption|tagline|slogan|bio|introduction|apology message|birthday message|invitation message|short message)/.test(normalized)) {
    return "Yes, I can help write that. Tell me the topic, tone, and length you want, and I can draft it for you.";
  }

  return "";
};

const getStudyHelpReply = (normalized) => {
  if (/(study tip|study tips|how to study|exam tip|exam tips|review tip|review tips)/.test(normalized)) {
    return "A simple study plan is: break the topic into small parts, review in short focused sessions, quiz yourself without notes, and repeat the hard parts the next day.";
  }

  if (/(motivate me|motivation|encourage me|i want to give up|i feel tired)/.test(normalized)) {
    return "You do not need to finish everything at once. Start with one small step, build momentum, and keep going one task at a time.";
  }

  return "";
};

const getProgrammingHelpReply = (normalized) => {
  if (/(how do i code|how to code|learn programming|learn coding|programming tips|coding tips)/.test(normalized)) {
    return "A strong way to learn programming is to build small projects, practice every day, read working code, and debug patiently instead of rushing for perfect answers.";
  }

  return "";
};

const getLiveDataReply = (normalized) => {
  if (/(weather|forecast|news|headline|stock price|exchange rate|traffic|sports score|live score|current president|latest election|today's rate|bitcoin price)/.test(normalized)) {
    return "I cannot verify live updates in local mode, but I can still help with general explanations or store-related questions. For live facts, please double-check with a current source.";
  }

  return "";
};

const getSensitiveAdviceReply = (normalized) => {
  if (/(medicine|medical|symptom|diagnose|diagnosis|legal advice|lawyer|lawsuit|investment advice|financial advice|crypto advice)/.test(normalized)) {
    return "I can give general information, but for medical, legal, or financial decisions it is best to check with a qualified professional.";
  }

  return "";
};

const buildLocalAssistantReply = (userMessage, menuContext) => {
  const text = String(userMessage || "").trim();
  const normalized = text.toLowerCase();
  const menuItems = parseMenuItems(menuContext);
  const featuredItems = menuItems.slice(0, 3);
  const mathResult = solveBasicMath(normalized);
  const capitalReply = getCapitalReply(normalized);
  const definitionReply = getDefinitionReply(normalized);
  const writingHelpReply = getWritingHelpReply(normalized);
  const studyHelpReply = getStudyHelpReply(normalized);
  const programmingHelpReply = getProgrammingHelpReply(normalized);
  const liveDataReply = getLiveDataReply(normalized);
  const sensitiveAdviceReply = getSensitiveAdviceReply(normalized);

  if (!text) {
    return "Ask me anything about V&G, our desserts, store hours, delivery, or general customer questions too.";
  }

  if (/(^|\b)(hi|hello|hey|yo|good morning|good afternoon|good evening)\b/.test(normalized)) {
    return "Hi! I'm V&G Llama AI. I can help with desserts, store details, writing help, simple explanations, and everyday customer questions.";
  }

  if (/(who are you|what are you|your name)/.test(normalized)) {
    return "I'm V&G Llama AI, the customer assistant for V&G Leche Flan. I can help with our menu, shop details, and many general questions too.";
  }

  if (/(how are you|how are u|how're you|hows it going|how is it going|what's up|whats up)/.test(normalized)) {
    if (featuredItems.length > 0) {
      return `I'm doing great and ready to help. If you want something sweet today, I can also recommend ${featuredItems[0]}.`;
    }

    return "I'm doing great and ready to help with general questions, desserts, store info, delivery, and recommendations.";
  }

  if (/(what can you do|can you help|help me|what do you do|what can u do)/.test(normalized)) {
    return "I can answer many customer questions, explain simple topics, help write short messages or captions, and assist with V&G desserts, prices, delivery, payment options, location, and store hours.";
  }

  if (/(how old are you|your age|when were you made|when were you created)/.test(normalized)) {
    return "I'm a virtual assistant, so I do not have a human age, but I'm here and ready to help anytime.";
  }

  if (/(who created you|who built you|who made you)/.test(normalized)) {
    return "I was set up as V&G's AI assistant to help customers with dessert questions, store information, and general conversation.";
  }

  if (/(greg|vergie|founder|owner|who started)/.test(normalized)) {
    return `${SHOP_INFO.founders} are the founders of V&G Leche Flan.`;
  }

  if (/(time|date|today|day now)/.test(normalized)) {
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

  if (writingHelpReply) {
    return writingHelpReply;
  }

  if (studyHelpReply) {
    return studyHelpReply;
  }

  if (programmingHelpReply) {
    return programmingHelpReply;
  }

  if (/(where|location|address|located)/.test(normalized)) {
    return `V&G Leche Flan is located in ${SHOP_INFO.location}.`;
  }

  if (/(hour|open|close|schedule)/.test(normalized)) {
    return `Our hours are ${SHOP_INFO.hours}.`;
  }

  if (/(phone|contact|call|email)/.test(normalized)) {
    return `You can contact V&G at ${SHOP_INFO.phone} or ${SHOP_INFO.email}.`;
  }

  if (/(deliver|delivery|pickup|pick up|ship)/.test(normalized)) {
    return "We support delivery and pickup. Delivery currently adds PHP 50.";
  }

  if (/(payment|pay|gcash|cash|cod)/.test(normalized)) {
    return "We accept GCash and cash. Delivery orders can be paid as Cash on Delivery too.";
  }

  if (/(joke|funny|make me laugh)/.test(normalized)) {
    return "Here's one: Why did the leche flan stay calm during rush hour? Because it knew how to keep things smooth.";
  }

  if (/(fun fact|interesting fact)/.test(normalized)) {
    return "Fun fact: caramel forms its deep flavor when sugar is heated and breaks down into hundreds of new aroma compounds.";
  }

  if (/(favorite dessert|favourite dessert|best dessert to try|what should i try)/.test(normalized) && featuredItems.length > 0) {
    return `A great one to try is ${featuredItems[0]}. If you want, I can recommend more from today's available desserts too.`;
  }

  if (/(favorite color|favourite color)/.test(normalized)) {
    return "If I had to choose, I'd go with caramel gold. It feels very V&G.";
  }

  if (liveDataReply) {
    return liveDataReply;
  }

  if (sensitiveAdviceReply) {
    return sensitiveAdviceReply;
  }

  if (/(hungry|i'm hungry|im hungry|craving|want something sweet)/.test(normalized)) {
    if (featuredItems.length > 0) {
      return `If you're craving something sweet, ${featuredItems[0]} sounds like a great pick right now.`;
    }

    return "You're in the right place for something sweet. Ask me what dessert you should try.";
  }

  if (/(sad|tired|stressed|bored|anxious)/.test(normalized)) {
    return "I hope your day gets a little lighter. If you want, I can keep you company, help you focus, or recommend something sweet from V&G too.";
  }

  if (/(i love you|love you)/.test(normalized)) {
    return "That's sweet of you. I'm always happy to chat and help.";
  }

  if (/(recommend|suggest|best|popular|dessert)/.test(normalized) && featuredItems.length > 0) {
    return `Here are a few desserts you can try:\n\n- ${featuredItems.join("\n- ")}`;
  }

  if (/(thank you|thanks|ty)/.test(normalized)) {
    return "You're welcome! Ask me about desserts, prices, delivery, store hours, recommendations, or general questions anytime.";
  }

  if (/(bye|goodbye|see you|see ya|later)/.test(normalized)) {
    return "See you next time. If you need dessert recommendations, store info, or a quick answer later, I'm here.";
  }

  return "I can help with a wide range of customer questions, simple explanations, casual conversation, and V&G shop concerns. Ask in a more specific way and I'll do my best to give a clear answer without errors.";
};

const buildGroqMessages = (userMessage, menuContext) => ([
  {
    role: "system",
    content: `You are V&G Llama AI, a friendly customer-facing assistant for V&G Leche Flan in Las Pinas, Philippines.
The current date and time in the Philippines is: ${getPhilippineNow()}.

Shop Info:
- Location: ${SHOP_INFO.location}
- Hours: Mon-Sat 8AM-8PM, Sun 9AM-6PM
- Phone: ${SHOP_INFO.phone}
- Email: ${SHOP_INFO.email}
- Founded by: ${SHOP_INFO.founders}

AVAILABLE MENU TODAY:
${menuContext}

You can help customers with:
- General conversation and broad everyday questions
- Product recommendations and dessert details
- Store location, hours, and contact info
- Ordering, delivery, and payment questions
- Simple writing help such as captions, taglines, and short messages

Rules:
- If the user asks for V&G dessert recommendations, ONLY recommend items explicitly listed in AVAILABLE MENU TODAY.
- Do not invent desserts, flavors, prices, delivery fees, or store policies.
- For live facts such as weather, breaking news, traffic, sports scores, or current political updates, clearly say you cannot verify live data right now.
- For medical, legal, or financial decisions, keep the answer general and suggest professional advice when appropriate.
- If the question is unrelated to the shop, still answer helpfully instead of refusing. Keep your tone warm, concise, and customer-friendly.`
  },
  {
    role: "user",
    content: userMessage,
  },
]);

export const buildSafeAiReply = async (userMessage, menuContext) => {
  if (!userMessage) {
    return {
      ...buildAiMeta({
        source: "local-fallback",
        reason: "missing-message",
      }),
      reply: buildLocalAssistantReply("", menuContext),
    };
  }

  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    return {
      ...buildAiMeta({
        source: "local-fallback",
      }),
      reply: buildLocalAssistantReply(userMessage, menuContext),
    };
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: buildGroqMessages(userMessage, menuContext),
      }),
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!response.ok || data?.error || !reply) {
      if (data?.error) {
        console.error("Groq API error:", data.error);
      }

      return {
        ...buildAiMeta({
          source: "groq-fallback",
          mode: "local-fallback",
          reason: "upstream-error",
        }),
        reply: buildLocalAssistantReply(userMessage, menuContext),
      };
    }

    return {
      ...buildAiMeta({
        source: "groq",
        mode: "groq",
      }),
      reply,
    };
  } catch (error) {
    console.error("Server error:", error);
    return {
      ...buildAiMeta({
        source: "request-fallback",
        mode: "local-fallback",
        reason: "request-failed",
      }),
      reply: buildLocalAssistantReply(userMessage, menuContext),
    };
  }
};

router.get("/status", (req, res) => {
  res.json(getAiStatusPayload());
});

router.post("/safe", async (req, res) => {
  const userMessage = req.body?.message;
  const menuContext = req.body?.menuContext || "Our signature Leche Flan";
  const payload = await buildSafeAiReply(userMessage, menuContext);

  res.json(payload);
});

router.post("/", async (req, res) => {
  const userMessage = req.body?.message;
  const menuContext = req.body?.menuContext || "Our signature Leche Flan";

  if (!userMessage) {
    return res.status(400).json({ error: "Message is required." });
  }

  const payload = await buildSafeAiReply(userMessage, menuContext);
  return res.json(payload);
});

export default router;
