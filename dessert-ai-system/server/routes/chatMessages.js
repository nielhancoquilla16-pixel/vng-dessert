import express from "express";
import { buildSafeAiReply } from "./ai.js";

const router = express.Router();

const buildAssistantMessageResource = (payload) => ({
  id: `assistant-${Date.now()}`,
  type: "chat-message",
  role: "assistant",
  content: payload.reply,
  createdAt: new Date().toISOString(),
  ai: {
    ok: payload.ok,
    mode: payload.mode,
    source: payload.source,
    groqConfigured: payload.groqConfigured,
  },
});

router.post("/", async (req, res) => {
  const userContent = req.body?.content || req.body?.message;
  const menuContext = req.body?.menuContext || "Our signature Leche Flan";

  if (!userContent) {
    return res.status(400).json({
      error: "content is required.",
    });
  }

  const payload = await buildSafeAiReply(userContent, menuContext);

  return res.status(201).json({
    data: buildAssistantMessageResource(payload),
    meta: {
      ok: payload.ok,
      mode: payload.mode,
      source: payload.source,
      groqConfigured: payload.groqConfigured,
    },
  });
});

export default router;
