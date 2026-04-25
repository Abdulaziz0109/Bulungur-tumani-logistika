import { Telegraf } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import * as dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const appServer = express();
const port = process.env.PORT || 3000;

appServer.get('/', (req, res) => {
  res.send('Bulungur MMTB Telegram Bot ishlab turibdi!');
});

appServer.listen(port, () => {
  console.log(`Web server ${port}-portda ishlab turibdi...`);
});

// Read Firebase config
const configPath = new URL('./firebase-applet-config.json', import.meta.url);
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Initialize Firebase
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("Xatolik: TELEGRAM_BOT_TOKEN .env faylida ko'rsatilmagan.");
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply('Assalomu alaykum! MMTB Logistika xaritasidagi obyektlarni qidirish uchun matn yoki raqam yuboring (masalan: "12" yoki "Navoiy").');
});

bot.on('text', async (ctx) => {
  const queryText = ctx.message.text.toLowerCase();
  
  try {
    const querySnapshot = await getDocs(collection(db, 'locations'));
    let found = false;
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.name && data.name.toLowerCase().includes(queryText)) {
        found = true;
        ctx.reply(`📍 Topildi: ${data.name}`);
        ctx.replyWithLocation(data.lat, data.lng);
      }
    });
    
    if (!found) {
      ctx.reply(`"${ctx.message.text}" so'rovi bo'yicha hech qanday obyekt topilmadi.`);
    }
  } catch (error) {
    console.error("Xatolik:", error);
    ctx.reply("Ma'lumotlarni olishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.");
  }
});

bot.launch().then(() => {
  console.log("Telegram bot muvaffaqiyatli ishga tushdi!");
}).catch(err => {
  console.error("Botni ishga tushirishda xatolik:", err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
