import express from "express";
import fetch from "node-fetch";

const router = express.Router();
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const isGroqConfigured = () => Boolean(String(process.env.GROQ_API_KEY || "").trim());

const buildAiStatusPayload = () => ({
  groqConfigured: isGroqConfigured(),
  provider: isGroqConfigured() ? "groq" : "local-fallback",
  model: GROQ_MODEL,
});

const buildSystemPrompt = (menuContext = "Our signature Leche Flan") => `You are a helpful AI assistant for V&G Leche Flan, a Filipino dessert shop in Las Pinas, Philippines.
Current date and time in the Philippines: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })}.

Available menu today:
${menuContext}

Rules:
- Only recommend desserts that appear in the available menu.
- Be friendly, concise, and helpful.
- You can answer general questions, store info, delivery, pickup, and payment questions.
- If a user asks for a recommendation, keep the answer short and practical.`;

const extractMenuItems = (menuContext = "") => (
  String(menuContext || "")
    .split(/\n|,/)
    .map((item) => item.replace(/\s*\(PHP[^)]*\)/gi, "").trim())
    .filter(Boolean)
    .slice(0, 6)
);

const buildLocalFallbackReply = (userMessage = "", menuContext = "") => {
  const normalizedMessage = String(userMessage || "").toLowerCase().trim();
  const menuItems = extractMenuItems(menuContext);
  const highlightedItems = menuItems.length > 0
    ? menuItems.slice(0, 3).join(", ")
    : "our desserts";

  if (!normalizedMessage) {
    return "Ask me about our desserts, prices, location, hours, delivery, or payment options.";
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(normalizedMessage)) {
    return `Hi! I'm your V&G assistant. I can help with ${highlightedItems}.`;
  }

  if (/(location|address|where are you|where is the shop)/.test(normalizedMessage)) {
    return "We are located in Monark Subdivision, Las Pinas, Philippines.";
  }

  if (/(hour|open|close|schedule)/.test(normalizedMessage)) {
    return "Our hours are Monday to Saturday, 8:00 AM to 8:00 PM, and Sunday, 9:00 AM to 6:00 PM.";
  }

  if (/(payment|gcash|cash|pay)/.test(normalizedMessage)) {
    return "We accept GCash and cash.";
  }

  if (/(delivery|pickup|pick up)/.test(normalizedMessage)) {
    return "We support delivery and pickup. Delivery adds PHP 50.";
  }

  if (/(recommend|suggest|best|popular|favorite)/.test(normalizedMessage) && menuItems.length > 0) {
    return `I suggest trying ${menuItems.slice(0, 3).join(", ")}.`;
  }

  if (menuItems.length > 0) {
    return `I can help with ${highlightedItems}, plus delivery, payment, hours, and other shop questions.`;
  }

  return "I can help with dessert questions, store information, and simple general questions.";
};

const fetchGroqReply = async (userMessage, menuContext) => {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(menuContext),
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || data?.error || "AI error";
    throw new Error(message);
  }

  const reply = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!reply) {
    throw new Error("AI service returned no reply.");
  }

  return reply;
};

export const buildSafeAiReply = async (userMessage, menuContext = "Our signature Leche Flan") => {
  const groqConfigured = isGroqConfigured();

  if (!groqConfigured) {
    return {
      ok: true,
      mode: "fallback",
      source: "local-fallback",
      groqConfigured: false,
      reply: buildLocalFallbackReply(userMessage, menuContext),
    };
  }

  try {
    const reply = await fetchGroqReply(userMessage, menuContext);
    return {
      ok: true,
      mode: "groq",
      source: "groq",
      groqConfigured: true,
      reply,
    };
  } catch (error) {
    console.error("Groq AI fallback engaged:", error);
    return {
      ok: true,
      mode: "fallback",
      source: "local-fallback",
      groqConfigured: true,
      reply: buildLocalFallbackReply(userMessage, menuContext),
    };
  }
};

export const getAiStatusPayload = buildAiStatusPayload;

router.post("/", async (req, res, next) => {
  try {
    const userMessage = String(req.body?.message || req.body?.content || "").trim();
    const menuContext = String(req.body?.menuContext || "Our signature Leche Flan");

    if (!userMessage) {
      return res.status(400).json({ error: "Message is required." });
    }

    const payload = await buildSafeAiReply(userMessage, menuContext);

    return res.json({
      reply: payload.reply,
      ...payload,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
