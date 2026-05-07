import { Telegraf } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedLocations } from '../src/data/seedLocations';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const configPath = path.join(__dirname, '../firebase-applet-config.json');
let firebaseConfig;

try {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error("❌ DIQQAT: firebase-applet-config.json fayli topilmadi!");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

// Helper to search locations
async function findLocationFallback(query: string) {
  let found = null;
  try {
    const querySnapshot = await getDocs(collection(db, 'locations'));
    querySnapshot.forEach(doc => {
      const data = doc.data();
      if (data.name && data.name.toLowerCase().includes(query.toLowerCase())) {
        if (!found) found = data;
      }
    });
  } catch (e) {
     console.error(e);
  }
  
  if (!found) {
    for (const loc of seedLocations) {
      if (loc.name && loc.name.toLowerCase().includes(query.toLowerCase())) {
        found = loc;
        break; 
      }
    }
  }
  return found;
}

if (!botToken || botToken === "yoto_telegram_bot_token") {
  console.error("❌ TELEGRAM_BOT_TOKEN .env faylida noto'g'ri yoki topilmadi!");
} else {
  const bot = new Telegraf(botToken);
  
  let ai: GoogleGenAI | null = null;
  if (geminiApiKey) {
     ai = new GoogleGenAI({ apiKey: geminiApiKey });
  }

  bot.start((ctx) => {
    ctx.reply("Salom! MMTB logistika tizimiga xush kelibsiz.\n\n🔍 Qidirayotgan maktab yoki bog'cha raqamini yoki nomini yozing.\n📝 Masalan: '12', '15 maktab'");
  });

  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.length < 1) return;
    
    // Yozayotganini bildirish (Typing)
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing').catch(()=>{});
    
    // '1 soniya ichida javob' qismi
    const pendingMsg = await ctx.reply("Xabaringizni tahlil qilyapman... ⏳");
    
    // Matn qisqa yoki uzunligini tekshirish
    const isComplex = text.length > 20 || text.split(' ').length > 3;

    try {
        if (!isComplex || !ai) {
          // Oddiy qidiruv (raqam yoki qisqa so'z)
          const found = await findLocationFallback(text);
          await ctx.telegram.deleteMessage(ctx.chat.id, pendingMsg.message_id).catch(()=>{});
          if (found && found.lat && found.lng) {
            if (found.name) {
              await ctx.replyWithVenue(found.lat, found.lng, found.name, found.type === 'dmtt' ? "Maktabgacha ta'lim muassasasi" : found.type || "");
            } else {
              await ctx.replyWithLocation(found.lat, found.lng);
            }
          } else {
            await ctx.reply("❌ Bunday muassasa topilmadi.");
          }
        } else {
          // AI Qidiruv - Uzun matn uchun
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: `The user wrote a loosely phrased text in Uzbek to a Telegram bot. The bot helps find locations of schools, kindergartens, and other organizations in the database.
User text: "${text}"
Task 1: Respond with a short, polite and human-like conversational reply or question in Uzbek. If they are just greeting or chatting, greet back and ask what they are looking for. If they ask about your capabilities, explain that you can find the coordinates of schools, kindergartens, and other registered organizations. If they are looking for a place, clarify what they want.
Task 2: Extract the main search keyword (e.g. "15 maktab" or simply "15", "kasalxona", "xalq ta'limi", etc.).
Provide response strictly in this exact format:
QUESTION: <your question or reply>
KEYWORD: <the keyword>

If you cannot extract a meaningful keyword, put 'none' for KEYWORD.`
          });
          
          await ctx.telegram.deleteMessage(ctx.chat.id, pendingMsg.message_id).catch(()=>{});
          
          const rawText = response.text || "";
          const questionMatch = rawText.match(/QUESTION:\s*(.+)/i);
          const keywordMatch = rawText.match(/KEYWORD:\s*(.+)/i);
          
          const aiQuestion = (questionMatch && questionMatch[1]) ? questionMatch[1].trim() : "Siz aynan qaysi muassasani qidiryapsiz?";
          const keyword = (keywordMatch && keywordMatch[1]) ? keywordMatch[1].trim() : "none";
          
          if (keyword.toLowerCase() !== 'none' && keyword.length < 40) {
              await ctx.reply(aiQuestion, {
                  reply_markup: {
                      inline_keyboard: [
                          [{ text: "✅ Ha, qidirish", callback_data: `search_${keyword}` }],
                          [{ text: "❌ Yo'q, qaytadan yozaman", callback_data: `cancel` }]
                      ]
                  }
              });
          } else {
              await ctx.reply(aiQuestion);
          }
        }
    } catch (e) {
       console.error("Bot error:", e);
       await ctx.telegram.deleteMessage(ctx.chat.id, pendingMsg.message_id).catch(()=>{});
       await ctx.reply("Kechirasiz, muammo yuzaga keldi. Iltimos, oddiygina raqam kiriting (masalan, 15).");
    }
  });

  bot.action(/^search_(.+)$/, async (ctx) => {
    const keyword = ctx.match[1];
    await ctx.answerCbQuery("Izlanmoqda...");
    await ctx.editMessageText(`🔍 "${keyword}" bo'yicha ma'lumot qidiryapman...`);
    
    const found = await findLocationFallback(keyword);
    if (found && found.lat && found.lng) {
        await ctx.deleteMessage().catch(()=>{});
        if (found.name) {
          await ctx.replyWithVenue(found.lat, found.lng, found.name, found.type === 'dmtt' ? "Maktabgacha ta'lim muassasasi" : found.type || "");
        } else {
          await ctx.replyWithLocation(found.lat, found.lng);
        }
    } else {
        await ctx.editMessageText(`Kechirasiz, "${keyword}" bo'yicha xarita koordinatalari topilmadi. 😔`);
    }
  });

  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery("Bekor qilindi");
    await ctx.editMessageText("Tushunarli. Qidirayotgan muassasa raqamini aniqroq yozib ko'ring.");
  });

  bot.launch().then(() => console.log('✅ Telegram Bot ishlamoqda...'));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
