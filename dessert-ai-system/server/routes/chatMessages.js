import express from "express";
import { buildSafeAiReply, validateAiRequest } from "./ai.js";
import { limitAiRequests } from '../middleware/rateLimit.js';

const buildAssistantMessageResource = (payload) => ({
  id: `assistant-${Date.now()}`,
  type: "chat-message",
  role: "assistant",
  content: payload.reply,
  createdAt: new Date().toISOString(),
  ai: {
    ok: payload.ok,
    mode: 'assistant',
    source: 'assistant',
    recommendedProductIds: payload.recommendedProductIds || [],
    recommendationState: payload.recommendationState,
  },
});

export const createChatMessagesRouter = ({ reply = buildSafeAiReply } = {}) => {
  const router = express.Router();
  router.post("/", limitAiRequests, async (req, res, next) => {
    try {
      const userContent = req.body?.content ?? req.body?.message;
      if (typeof userContent !== 'string' || !userContent.trim()) {
        return res.status(400).json({ error: "content is required." });
      }
      if (userContent.length > 2000) return res.status(400).json({ error: 'Please keep your message under 2,000 characters.' });
      const invalid = validateAiRequest(req.body);
      if (invalid) return res.status(400).json({ error: invalid });
      const payload = await reply(userContent, '', { history: req.body?.history, productId: req.body?.productId, recommendationState: req.body?.recommendationState });
      return res.status(201).json({
        data: buildAssistantMessageResource(payload),
        meta: {
          ok: payload.ok,
          mode: 'assistant',
          source: 'assistant',
        },
      });
    } catch (error) { next(error); }
  });
  return router;
};

export default createChatMessagesRouter();
