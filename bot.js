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
  ctx.reply('Assalomu alaykum! MMTB Logistika xaritasidagi obyektlarni qidirish uchun matn yoki raqam yuboring (masalan: "12" yoki "Navoiy").\n\nQo\'shimcha komandalar:\n/stat - Tuman statistikasi\n/report - Rasmli hisobot yuborish');
});

bot.command('stat', async (ctx) => {
  try {
    const querySnapshot = await getDocs(collection(db, 'locations'));
    let total = 0;
    let maktablar = 0;
    let bogchalar = 0;
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      total++;
      if (data.type === 'maktab') maktablar++;
      else if (data.type === 'dmtt' || data.type === 'bogcha') bogchalar++;
    });
    
    ctx.reply(`📊 *Bulung'ur MMTB Bazasi holati:*\n\nJami ob'ektlar soni: ${total} ta\nShundan maktablar: ${maktablar} ta\nBog'chalar: ${bogchalar} ta`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error("Statistika xatoligi:", error);
    ctx.reply("Statistikani olishda xatolik yuz berdi.");
  }
});

bot.command('report', (ctx) => {
  ctx.reply("Iltimos, yetib borgan maktab/bog'changizdagi bajarilgan ish holatini rasmga olib yuboring.");
});

bot.on('photo', (ctx) => {
  console.log(`Foto qabul qilindi foydalanuvchidan: ${ctx.message.from.id}`);
  ctx.reply("✅ Hisobotingiz bazaga saqlandi va MMTB rahbariyatiga yuborildi.");
});

bot.on('text', async (ctx) => {
  // Ignor qilinadigan komandalar agar xato kelib tushsa
  if (ctx.message.text.startsWith('/')) return;

  const queryText = ctx.message.text.toLowerCase();
  
  try {
    const querySnapshot = await getDocs(collection(db, 'locations'));
    let found = false;
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.name && data.name.toLowerCase().includes(queryText)) {
        found = true;
        ctx.reply(`📍 Topildi: ${data.name}`, {
           reply_markup: {
              inline_keyboard: [
                 [
                   { text: "🗺 Yandex'da ochish", url: `https://yandex.ru/maps/?rtext=~${data.lat},${data.lng}` },
                   { text: "📍 Google Maps'da", url: `https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lng}` }
                 ]
              ]
           }
        });
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
