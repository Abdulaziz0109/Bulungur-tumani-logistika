import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("✅ GEMINI_API_KEY is defined and loaded.");
  } else {
    console.warn("⚠️ WARNING: GEMINI_API_KEY is not defined. AI moderation will use a safe pass-through fallback.");
  }

  // API Route: Moderate content for profanity, indecency, and inappropriate content.
  app.post("/api/moderate", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }

      if (!ai) {
        console.warn("GEMINI_API_KEY is simulated or empty. Allowing text bypass.");
        return res.json({ isValid: true });
      }

      const prompt = `Yangi mo'ljal kiritildi / tahrirlandi: "${text}".
Foydalanuvchilar ochiq xaritadagi joy bo'yicha "Mo'ljal" (masalan: "Falon do'kon oldida", "Pilonchi bino orqasida") kiritishmoqda.
Tekshiring: Ushbu matnda behayo, odobsiz, haqoratli, pornografik, siyosiy buzg'unchilik yoki milliy adovat qo'zg'atuvchi so'zlar bormi?
Faqat quydagi JSON formatida javob bering, boshqa ortiqcha izoh yozmang:
{
  "isAcceptable": boolean, // Matn begunoh, odobli bo'lsa true, aks holda (behayo yoki nomaqbul bo'lsa) false.
  "reason": "sababi"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isAcceptable: { 
                type: Type.BOOLEAN, 
                description: "True if the text is decent and safe for a public map app, false if it contains vulgar or inappropriate language." 
              },
              reason: { 
                type: Type.STRING, 
                description: "Explanation of the decision in Uzbek." 
              }
            },
            required: ["isAcceptable", "reason"]
          }
        }
      });

      const responseText = response.text?.trim() || "{}";
      const result = JSON.parse(responseText);

      return res.json({
        isValid: result.isAcceptable === true,
        reason: result.reason || ""
      });

    } catch (error) {
      console.error("AI Moderation error:", error);
      // Fallback: in case of transient API error/timeout, we allow to be robust, or we can deny.
      // Let's log it and allow to maintain operational continuity, but warn the console.
      return res.json({ isValid: true, errored: true });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
