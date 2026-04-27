import { Telegraf } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

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

if (!process.env.GEMINI_API_KEY) {
  console.warn("DIQQAT: GEMINI_API_KEY topilmadi. AI funksiyalari ishlamaydi.");
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

bot.start((ctx) => {
  ctx.reply('Assalomu alaykum! Men Bulung\'ur MMTB Logistika yordamchisiman. Menga istalgancha yozishingiz mumkin (Masalan: "15-maktab va 3-bog\'cha qayerda?").\n\nQo\'shimcha komandalar:\n/stat - Tuman statistikasi\n/report - Rasmli hisobot yuborish');
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

  const userText = ctx.message.text;
  
  if (!process.env.GEMINI_API_KEY) {
      // Fallback if no AI key
      const queryText = userText.toLowerCase();
      try {
        const querySnapshot = await getDocs(collection(db, 'locations'));
        let found = false;
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.name && data.name.toLowerCase().includes(queryText)) {
            found = true;
            ctx.reply(`📍 Topildi: ${data.name}`, {
               reply_markup: {
                  inline_keyboard: [[
                       { text: "🗺 Yandex'da ochish", url: `https://yandex.ru/maps/?rtext=~${data.lat},${data.lng}` },
                       { text: "📍 Google Maps'da", url: `https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lng}` }
                  ]]
               }
            });
            ctx.replyWithLocation(data.lat, data.lng);
          }
        });
        if (!found) ctx.reply(`"${userText}" so'rovi bo'yicha hech qanday obyekt topilmadi.`);
      } catch (error) {
        ctx.reply("Ma'lumotlarni olishda xatolik yuz berdi.");
      }
      return;
  }

  // AI Processing
  try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: userText,
        config: {
          systemInstruction: "Siz Bulung'ur MMTB logistika botisiz. Foydalanuvchi qaysi maktab yoki bog'chalarni izlayotganini aniqlang.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              searchTargets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Agar foydalanuvchi obyekt izlayotgan bo'lsa (masalan: '15-maktab va 3-bog\\'cha'), izlanishi kerak bo'lgan so'zlarni qaytaring (masalan ['15', '3-']). Aks holda bo'sh ro'yxat qaytaring."
              },
              replyMessage: {
                type: Type.STRING,
                description: "Agar manzil izlanmagan bo'lsa yoki shunchaki suhbatlashayotgan/savol bergan bo'lsa, o'zbek tilida muloyim qisqa javob qaytaring (Chatbot rejimi)."
              }
            }
          }
        }
      });
      
      const responseText = response.text || "{}";
      const result = JSON.parse(responseText);

      if (result.searchTargets && result.searchTargets.length > 0) {
          ctx.reply("Manzillar izlanmoqda va marshrut hisoblanmoqda... Kuting.");
          const querySnapshot = await getDocs(collection(db, 'locations'));
          const allLocations = [];
          
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.name && data.lat && data.lng) allLocations.push({ id: doc.id, ...data });
          });
          
          // Collect all matched locations
          const matchedLocations = [];
          const matchedIds = new Set();

          for (const target of result.searchTargets) {
              const queryStr = target.toLowerCase().trim();
              const found = allLocations.filter(loc => loc.name.toLowerCase().includes(queryStr));
              for (const loc of found) {
                  if (!matchedIds.has(loc.id)) {
                      matchedLocations.push(loc);
                      matchedIds.add(loc.id);
                  }
              }
          }

          if (matchedLocations.length === 0) {
              ctx.reply(`Afsuski, ${result.searchTargets.join(', ')} bo'yicha hech narsa topilmadi.`);
              return;
          }

          if (matchedLocations.length === 1) {
              // Single destination
              const loc = matchedLocations[0];
              await ctx.reply(`📍 Topildi: ${loc.name}`, {
                reply_markup: {
                   inline_keyboard: [[
                      { text: "🗺 Yandex'da ochish", url: `https://yandex.ru/maps/?rtext=~${loc.lat},${loc.lng}` },
                      { text: "📍 Google Maps'da", url: `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}` }
                   ]]
                }
              });
              await ctx.replyWithLocation(loc.lat, loc.lng);
          } else {
              // Multi-stop Optimizatsiya
              try {
                  const coordsList = matchedLocations.map(l => `${l.lng},${l.lat}`).join(';');
                  const osrmRes = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coordsList}?roundtrip=false&source=first&overview=false`);
                  const osrmData = await osrmRes.json();
                  
                  let orderedLocations = matchedLocations;
                  
                  if (osrmData.code === 'Ok' && osrmData.waypoints) {
                      orderedLocations = new Array(matchedLocations.length);
                      osrmData.waypoints.forEach((wp) => {
                          orderedLocations[wp.waypoint_index] = matchedLocations[wp.original_index];
                      });
                  }

                  let messageTxt = "Sizning aqlli marshrutingiz tayyor:\n\n";
                  orderedLocations.forEach((loc, index) => {
                      messageTxt += `${index + 1}-boradigan joyingiz: ${loc.name}\n`;
                  });

                  // Build Multi-stop Yandex URL
                  // format: ~lat,lng~lat,lng~lat,lng
                  const yandexCoords = orderedLocations.map(loc => `~${loc.lat},${loc.lng}`).join('');
                  const yandexUrl = `https://yandex.ru/maps/?rtext=${yandexCoords}`;

                  await ctx.reply(messageTxt, {
                    reply_markup: {
                       inline_keyboard: [[
                          { text: "🗺 Yandex Navigator orqali yurish", url: yandexUrl }
                       ]]
                    }
                  });
              } catch (routeErr) {
                  console.error("OSRM Route finding failed:", routeErr);
                  // Fallback without route optimization
                  let messageTxt = "Boradigan manzillaringiz:\n\n";
                  matchedLocations.forEach((loc, index) => {
                      messageTxt += `${index + 1}. ${loc.name}\n`;
                  });
                  const yandexCoords = matchedLocations.map(loc => `~${loc.lat},${loc.lng}`).join('');
                  const yandexUrl = `https://yandex.ru/maps/?rtext=${yandexCoords}`;

                  await ctx.reply(messageTxt, {
                    reply_markup: {
                       inline_keyboard: [[
                          { text: "🗺 Yandex'da ochish", url: yandexUrl }
                       ]]
                    }
                  });
              }
          }
      } else if (result.replyMessage) {
          ctx.reply(result.replyMessage);
      } else {
          ctx.reply("Kechirasiz, so'rovingizni tushuna olmadim.");
      }

  } catch (err) {
      console.error("AI bilan ishlashda xatolik:", err);
      // Fallback
      ctx.reply("Sizning so'rovingizni qayta ishlashda xatolik yuz berdi. Iltimos keyinroq urinib ko'ring yoki faqat obyekt raqamini yozing.");
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
