import { Telegraf } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedLocations } from '../src/data/seedLocations';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Loyiha asosiy papkasidagi .env faylidan o'zgaruvchilarni yuklash
dotenv.config({ path: path.join(__dirname, '../.env') });

// Client SDK konfiguratsiyasini yuklash
const configPath = path.join(__dirname, '../firebase-applet-config.json');
let firebaseConfig;

try {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error("❌ DIQQAT: firebase-applet-config.json fayli topilmadi!");
  process.exit(1);
}

// Firebase Client ilovasini ishga tushirish
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// .env dan token ni olish
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken || botToken === "yoto_telegram_bot_token") {
  console.error("❌ TELEGRAM_BOT_TOKEN .env faylida noto'g'ri yoki topilmadi!");
  console.error("Iltimos, ./env faylidagi TELEGRAM_BOT_TOKEN qiymatini o'zingizning bot tokeningiz bilan almashtiring.");
  // Biz server qulayotganini xohlamaymiz, faqat ogohlantiramiz.
  console.error("Bot ishlamay turadi...");
} else {
  // Botni obyekti
  const bot = new Telegraf(botToken);

  // /start komandasi
  bot.start((ctx) => {
    ctx.reply("Salom! MMTB logistika tizimiga xush kelibsiz.\n\n🔍 Qidirayotgan maktab yoki bog'cha raqamini yoki nomini yozing.\n📝 Masalan: '12-maktab', '5-bog\\'cha' yoki oddiygina '12'");
  });

  // Oddiy xabar (matn) kelganda
  bot.on('text', async (ctx) => {
    const query = ctx.message.text.trim().toLowerCase();
    
    if (query.length < 1) {
      return ctx.reply("Iltimos, obyekt nomini yozing.");
    }
    
    try {
      // Obyektlar ro'yxati kichik bo'lgani bois barcha ma'lumotlarni tortib filtrlash qilamiz
      const querySnapshot = await getDocs(collection(db, 'locations'));
      
      let found = null;
      querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.name && data.name.toLowerCase().includes(query)) {
          found = data;
        }
      });
      
      // Agar bazada topilmasa, lokal (seedLocations) dan qidiramiz
      if (!found) {
        for (const loc of seedLocations) {
          if (loc.name && loc.name.toLowerCase().includes(query)) {
            found = loc;
            break; // Birinchi topilganini olish
          }
        }
      }
      
      if (found) {
        const typeLabel = found.type === 'dmtt' ? "Maktabgacha ta'lim muassasasi" : found.type.charAt(0).toUpperCase() + found.type.slice(1);
        await ctx.reply(`✅ Topildi: ${found.name}\n📋 Turi: ${typeLabel}`);
        
        // Xarita (Location) orqali yuborish
        if (found.lat && found.lng) {
          await ctx.replyWithLocation(found.lat, found.lng);
        } else {
          await ctx.reply("📍 Ammo ushbu obyektning xarita koordinatalari bazada kiritilmagan.");
        }
      } else {
        ctx.reply("❌ Bunday muassasa bazada topilmadi.\nRaqam yoki nomni to'g'ri yozganingizni tekshiring.");
      }
    } catch (error) {
      console.error("Xatolik yuz berdi:", error);
      ctx.reply("Kechirasiz, bazaga ulanishda xatolik yuz berdi. Keyinroq qayta urinib ko'ring.");
    }
  });

  // Botni ishga tushirish funksiyasi
  bot.launch().then(() => {
    console.log('✅ Telegram Bot muvaffaqiyatli ishga tushdi va xabarlarni kutyapti...');
  });

  // Dastur (terminal) yopilayotganda botni ham xavfsiz o'chirish
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
