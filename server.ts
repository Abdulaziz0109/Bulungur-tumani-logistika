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

      if (!ai && !process.env.GROQ_API_KEY) {
        console.warn("No AI API Keys found (neither GEMINI_API_KEY nor GROQ_API_KEY). Allowing text bypass.");
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

      let responseText = "{}";

      if (process.env.GROQ_API_KEY) {
        try {
          console.log("Using Groq API for content moderation...");
          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [
                { role: "user", content: prompt }
              ],
              response_format: { type: "json_object" },
              temperature: 0.1
            })
          });

          if (!groqRes.ok) {
            throw new Error(`Groq API error (status ${groqRes.status}): ${await groqRes.text()}`);
          }

          const groqData = await groqRes.json();
          responseText = groqData.choices[0].message.content || "{}";
        } catch (groqErr) {
          console.error("Groq moderation failed, trying fallback to Gemini if available:", groqErr);
          if (ai) {
            const response = await ai.models.generateContent({
              model: "gemini-3.1-flash-lite",
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    isAcceptable: { type: Type.BOOLEAN },
                    reason: { type: Type.STRING }
                  },
                  required: ["isAcceptable", "reason"]
                }
              }
            });
            responseText = response.text?.trim() || "{}";
          } else {
            throw groqErr;
          }
        }
      } else if (ai) {
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
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
        responseText = response.text?.trim() || "{}";
      }

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

  // SECURE API ROUTE: Securely proxies telegram photo to frontend without exposing TELEGRAM_BOT_TOKEN
  app.get("/api/telegram-photo/:fileId", async (req, res) => {
    try {
      const { fileId } = req.params;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken || botToken === "yoto_telegram_bot_token" || botToken.trim() === "") {
        return res.status(400).send("Telegram Bot Token is not configured or is using default value.");
      }

      const fileInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
      if (!fileInfoRes.ok) {
        return res.status(400).send("Could not retrieve file metadata from Telegram servers.");
      }

      const fileInfo = await fileInfoRes.json() as any;
      if (!fileInfo.ok || !fileInfo.result?.file_path) {
        return res.status(404).send("File path metadata is empty or denied.");
      }

      const filePath = fileInfo.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

      const imgRes = await fetch(fileUrl);
      if (!imgRes.ok) {
        return res.status(400).send("Failed to stream raw file from Telegram file nodes.");
      }

      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const ext = path.extname(filePath).toLowerCase();
      let contentType = "image/jpeg";
      if (ext === ".png") contentType = "image/png";
      else if (ext === ".gif") contentType = "image/gif";
      else if (ext === ".webp") contentType = "image/webp";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=172800"); // Cache for 48 hours to be extremely efficient
      return res.send(buffer);
    } catch (err) {
      console.error("Error in Secure Telegram Photo Proxy:", err);
      return res.status(500).send("Internal Server Secure Image Proxy Error");
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
