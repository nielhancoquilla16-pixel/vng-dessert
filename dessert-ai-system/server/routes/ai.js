import express from "express";
import fetch from "node-fetch";

const router = express.Router();

// POST /api/ai — Real Llama AI via Groq
router.post("/", async (req, res) => {
  const userMessage = req.body.message;
  const menuContext = req.body.menuContext || "Our signature Leche Flan";

  if (!userMessage) {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are a helpful AI assistant for V&G Leche Flan, a Filipino dessert shop in Las Piñas, Philippines.
The current date and time in the Philippines is: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })}.

Shop Info:
- Location: Monark Subdivision, Las Piñas, Philippines
- Hours: Mon–Sat 8AM–8PM, Sun 9AM–6PM
- Phone: 0977 385 4909
- Email: vnglecheflan0824@gmail.com
- Founded by: Vergie and Greg

AVAILABLE MENU TODAY:
${menuContext}

You can help customers with:
- Answer general, conversational, and off-topic questions (like "what time is it", "how are you", math, or facts)
- Product recommendations and dessert details
- Store location, hours, and contact info
- Ordering and delivery questions
- Payment methods (cash, GCash)

CRITICAL RULE: You MUST ONLY recommend desserts that are explicitly listed in the "AVAILABLE MENU TODAY" section above. DO NOT invent, suggest, or mention ANY other desserts or flavors (like Buko Pandan or Ube Cheesecake) unless they are in that list today. If a customer asks for a recommendation, pick from that list.

IMPORTANT: You ARE allowed to answer general, conversational, and off-topic questions (like "what time is it", "how are you", math, or facts). Answer them politely and enthusiastically, and then organically pivot back to suggesting our delicious Filipino desserts when appropriate. Be friendly and concise!`
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error("Groq API error:", data.error);
      return res.status(500).json({ error: data.error.message || "AI error" });
    }

    res.json({ reply: data.choices[0].message.content });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Failed to contact AI service." });
  }
});

export default router;