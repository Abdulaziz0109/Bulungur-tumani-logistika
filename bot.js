import express from 'express';
import { Telegraf } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const appServer = express();
// Default to port 3001 or process env PORT to not conflict with the main web server on 3000 if run together
const port = process.env.PORT || 3001;

appServer.get('/', (req, res) => {
  res.send('MMTB Telegram Bot is running and healthy!');
});

appServer.listen(port, '0.0.0.0', () => {
  console.log(`✅ Telegram Bot Web server ${port}-portda muvaffaqiyatli ishga tushdi!`);
});

const configPath = new URL('./firebase-applet-config.json', import.meta.url);
let firebaseConfig = null;
try {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
} catch (error) {
  console.error("❌ Xato: firebase-applet-config.json faylini o'qib bo'lmadi:", error);
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const hasValidToken = botToken && botToken !== "yoto_telegram_bot_token" && botToken.trim() !== "";

if (hasValidToken && firebaseConfig) {
  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  const bot = new Telegraf(botToken);
  let ai = null;
  if (process.env.GEMINI_API_KEY) {
      ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } else {
      console.warn("DIQQAT: GEMINI_API_KEY topilmadi. AI funksiyalari (matnni ishlash) ishlamaydi.");
  }

  // Live App URL for Telegram Web App integration
  const appUrl = process.env.PUBLIC_APP_URL || "https://ais-pre-yrj7r5rkwlnfgheh3zezzn-710564119497.asia-southeast1.run.app";

  // Helper: Reply Keyboard Menu
  const getMainMenu = () => {
    return {
      keyboard: [
        [{ text: "🗺 To'liq xaritani ochish", web_app: { url: appUrl } }],
        [{ text: "📊 Tuman statistikasi" }, { text: "📸 Hisobor yuborish (Report)" }],
        [{ text: "ℹ️ Qo'llanma / Yordam" }]
      ],
      resize_keyboard: true,
      persistent: true
    };
  };

  // Helper: Show Statistics
  const showStat = async (ctx) => {
    try {
      const waitMsg = await ctx.reply("📊 Statistika yuklanmoqda...");
      const querySnapshot = await getDocs(collection(db, 'locations'));
      const docs = [];
      querySnapshot.forEach((doc) => docs.push(doc.data()));
      
      const allDocs = [...docs];
      const total = allDocs.length;
      const maktablar = allDocs.filter(doc => doc.type === 'maktab').length;
      const bogchalar = allDocs.filter(doc => doc.type === 'dmtt' || doc.type === 'bogcha').length;
      const boshqa = allDocs.filter(doc => doc.type !== 'maktab' && doc.type !== 'dmtt' && doc.type !== 'bogcha').length;
      
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      
      await ctx.reply(
        `📊 *Bulung'ur MMTB Bazasi holati:*\n\n` +
        ` Jami ob'ektlar soni: *${total} ta*\n` +
        `🏫 Shundan maktablar: *${maktablar} ta*\n` +
        `🧒 Bog'chalar (DMTT): *${bogchalar} ta*\n` +
        `🏢 Boshqa muassasalar: *${boshqa} ta*\n\n` +
        `🧭 Ma'lumotlar real vaqt rejimida yangilanib boriladi.`, 
        { 
          parse_mode: 'Markdown',
          reply_markup: getMainMenu()
        }
      );
    } catch (error) {
      console.error("Statistika xatoligi:", error);
      ctx.reply("❌ Statistikani olishda xatolik yuz berdi. Iltimos keyinroq urinib ko'ring.");
    }
  };

  // Helper: Show Help
  const showHelp = (ctx) => {
    ctx.reply(
      "📖 *Bulung'ur MMTB xarita botidan foydalanish ko'rsatmasi:*\n\n" +
      "1️⃣ *Oddiy Qidiruv*: Muassasa raqami yoki nomini kiriting (Masalan: `15`, `sohibkor` yoki `12-maktab`). Bot sizga shu joyning tavsifi va xaritadagi punktini yuboradi.\n\n" +
      "2️⃣ *Ko'p manzilli optimallashtirish (AI)*: Bir nechta manzilga borishingiz kerak bo'lsa, xabarda barchasini yozing (Masalan: `15-maktab, 3-bog'cha va 9-maktab qayerda?`). Gemini AI ularni aniqlaydi va sizga eng tejamkor masofali *borish tartibini (optimallashgan ketma-ketlikni)* hamda Yandex/Google navigator havolasini taqdim etadi!\n\n" +
      "3️⃣ *Telegram Web App*: `🗺 To'liq xaritani ochish` tugmasini bosib, siz ajoyib va tezkor live xarita interfeysini to'g'ridan-to'g'ri Telegramning ichida ochishingiz mumkin. Bu orqali alohida saytga o'tish zaruriyati qolmaydi!\n\n" +
      "4️⃣ *Foto-Hisobotlar*: Tuman muassasalarida bajargan ishlaringiz yoki holat bo'yicha rasm yuborishingiz mumkin. Rasmlar darhol saqlanib, menejerlarga yetkaziladi.",
      { 
        parse_mode: 'Markdown',
        reply_markup: getMainMenu()
      }
    );
  };

  bot.start((ctx) => {
    ctx.reply(
      `👋 *Bulung'ur MMTB Logistika yordamchisi va Xarita botiga xush kelibsiz!*\n\n` +
      `Men sizga Bulung'ur tumanidagi maktab va bog'chalar geo-ma'lumotlarini topish, marshrutlarni chizish hamda optimal yo'l hisoblashda yordam beraman.\n\n` +
      `📌 *Menga quyidagicha xabarlar yuborishingiz mumkin:*\n` +
      `• _\"15-maktab qayerda?\"_\n` +
      `• _\"9-maktab va 3-bog'chaga borish marshruti\"_ (Guruhli qidiruv)\n\n` +
      `📱 Quyidagi qulay tugmalar orqali bot imkoniyatlaridan foydalanishingiz mumkin:`,
      { 
        parse_mode: 'Markdown',
        reply_markup: getMainMenu()
      }
    );
  });

  bot.command('stat', showStat);
  bot.command('help', showHelp);

  bot.command('report', (ctx) => {
    ctx.reply("📸 Iltimos, muassasaga yetib borganingizdan so'ng, u yerdagi holatni va bajargan ishlarni rasmga tushirib botga yuboring. Hisobot darhol tizimga saqlanadi.");
  });

  bot.on('photo', async (ctx) => {
    try {
      const photos = ctx.message.photo;
      const largestPhoto = photos[photos.length - 1];
      const sender = ctx.message.from;
      
      const docData = {
        userId: sender.id,
        userFullname: `${sender.first_name || ""} ${sender.last_name || ""}`.trim() || sender.username || "Noma'lum",
        username: sender.username || "",
        photoFileId: largestPhoto.file_id,
        photoWidth: largestPhoto.width,
        photoHeight: largestPhoto.height,
        createdAt: new Date().toISOString(),
        caption: ctx.message.caption || ""
      };

      await addDoc(collection(db, 'reports'), docData);
      console.log(`✅ Foto-hisobot "${docData.userFullname}" tomonidan yuborildi va Firestoredagi reports kolleksiyasiga saqlandi.`);
      ctx.reply("✅ Rahmat! Hisobotingiz muvaffaqiyatli qabul qilindi, bazaga saqlandi hamda MMTB rahbariyatiga ko'rsatish uchun ro'yxatga kiritildi.");
    } catch (error) {
      console.error("❌ Foto-hisobot saqlashda xato:", error);
      ctx.reply("⚠️ Hisobot qabul qilindi, lekin bazaga yozishda xatolik yuz berdi. Iltimos birozdan so'ng rasm qo'shishni qayta ko'ring.");
    }
  });

  // Handle manual callback buttons for individual location show
  bot.action(/^show_loc_(.+)$/, async (ctx) => {
    try {
      const parts = ctx.match[1].split('_');
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      await ctx.answerCbQuery("Koordinata yuklanmoqda...");
      await ctx.replyWithLocation(lat, lng);
    } catch (e) {
      console.error(e);
      await ctx.answerCbQuery("Koordinatni yuborib bo'lmadi");
    }
  });

  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const userText = ctx.message.text.trim();
    
    // Quick handlers for Reply Keyboard
    if (userText === "📊 Tuman statistikasi") {
      return showStat(ctx);
    }
    if (userText === "📸 Hisobor yuborish (Report)") {
      return ctx.reply("📸 Iltimos, muassasaga yetib borganingizdan so'ng, u yerdagi holatni va bajargan ishlarni rasmga tushirib botga yuboring. Hisobot darhol tizimga saqlanadi.");
    }
    if (userText === "ℹ️ Qo'llanma / Yordam") {
      return showHelp(ctx);
    }

    // Typing action
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing').catch(()=>{});

    // Handle Search
    if (!process.env.GEMINI_API_KEY) {
        // Fallback qidiruv - Agar Gemini ulanmagan bo'lsa
        const queryText = userText.toLowerCase();
        try {
          const querySnapshot = await getDocs(collection(db, 'locations'));
          const foundMatches = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.name && data.name.toLowerCase().includes(queryText)) {
              foundMatches.push(data);
            }
          });

          if (foundMatches.length === 0) {
            ctx.reply(`❌ "${userText}" so'rovi bo'yicha hech qanday muassasa topilmadi. Qayta urinib ko'ring yoki faqat raqamini kiriting (masalan: 15).`);
          } else if (foundMatches.length === 1) {
            const data = foundMatches[0];
            await ctx.reply(`🏫 *${data.name}*\n📍 *Mo'ljal:* ${data.landmark || "kiritilmagan"}\n👥 *Sig'imi:* ${data.capacity ? data.capacity + " o'rin" : "kiritilmagan"}`, {
               parse_mode: 'Markdown',
               reply_markup: {
                  inline_keyboard: [[
                       { text: "🗺 Yandex'da ochish", url: `https://yandex.ru/maps/?rtext=~${data.lat},${data.lng}` },
                       { text: "📍 Google Maps'da", url: `https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lng}` }
                  ]]
               }
            });
            await ctx.replyWithLocation(data.lat, data.lng);
          } else {
            // Anti-Spam multiple items selector (Prevented major inconvenience!)
            let listMessage = `🔍 So'rovingiz bo'yicha *${foundMatches.length} ta* muassasa topildi:\n\n`;
            const buttons = [];
            
            // Limit to 10 to avoid button size limits
            const displaySubset = foundMatches.slice(0, 10);
            displaySubset.forEach((data, idx) => {
               listMessage += `${idx + 1}. *${data.name}*\n📍 Mo'ljal: ${data.landmark || "kiritilmagan"}\n\n`;
               buttons.push([{
                  text: `📍 ${data.name} (Joylashuvi)`, 
                  callback_data: `show_loc_${data.lat}_${data.lng}`
               }]);
            });
            
            if (foundMatches.length > 10) {
               listMessage += `⚠️ Natijalar ko'pligi sababli faqat dastlabki 10 tasi ko'rsatilmoqda. Aniqroq qidirishingiz mumkin.`;
            }

            ctx.reply(listMessage, { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: buttons
              }
            });
          }
        } catch (error) {
          ctx.reply("❌ Ma'lumotlarni qidirishda xatolik yuz berdi.");
        }
        return;
    }

    // AI smart parsing with Gemini - EVERY user question gets answered with context!
    try {
        const querySnapshot = await getDocs(collection(db, 'locations'));
        const allLocations = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.name && data.lat && data.lng) {
            allLocations.push({
              id: doc.id,
              name: data.name,
              type: data.type || "muassasa",
              lat: data.lat,
              lng: data.lng,
              mahalla: data.mahalla || "",
              landmark: data.landmark || "",
              capacity: data.capacity || ""
            });
          }
        });

        // Format the database context for Gemini
        const dbContextText = allLocations.map((loc, idx) => {
          let line = `${idx + 1}. ID: "${loc.id}", Nomi: "${loc.name}", Turi: "${loc.type}", Lat: ${loc.lat}, Lng: ${loc.lng}`;
          if (loc.mahalla) line += `, Mahalla: "${loc.mahalla}"`;
          if (loc.landmark) line += `, Mo'ljal: "${loc.landmark}"`;
          if (loc.capacity) line += `, Sig'imi: ${loc.capacity} nafar`;
          return line;
        }).join('\n');

        const systemPrompt = `Siz Samarqand viloyati Bulung'ur tumanining Maktabgacha va maktab ta'limi bo'limi (MMTB) logistika va axborot bo'limining maxsus AI yordamchisiz. Foydalanuvchilar sizga o'zbek tilida turli savollar berishadi.
Sizga tuman muassasalari va obektlarining ma'lumotlar bazasi (Hozirgi vaqtda kiritilgan barcha maktablar, bog'chalar va boshqa idoralar) taqdim etiladi.

MUASSASALAR RO'YXATI (DATABASE):
${dbContextText || "Hozircha bazada hech qanday muassasa mavjud emas."}

Vazifanglaringiz:
1. Foydalanuvchining o'zbek tilidagi har qanday savoliga chiroyli, madaniyatli, to'liq va tushunarli javob yozing (replyMessage). Hech qachon markdown yulduzchalari kabi maxsus qalinlashtiruvchi belgilarni ishlatmang (javob toza matn bo'lsin).
2. Agar foydalanuvchi muayyan muassasani qidirsa, unga oid bor ma'lumotni (nomi, turi, mahallasi, mo'ljali, sig'imi, koordinatalari) tushunarli tilda unga bayon qiling.
3. Agar foydalanuvchi ikki yoki undan ko'p muassasalar orasidagi masofani yoki ular o'rtasidagi yo'lni so'rasa (Masalan: "Bulungur mmtbdan 4-maktabgacha necha km?", "12-bog'chadan mmtbgacha masofani ayt"):
   - Base'dan foydalanib o'sha ikki (yoki ko'proq) muassasani toping.
   - Matnda ularning aniq koordinatalari borligini tasdiqlab, ular orasidagi to'g'ri chiziqli (Haversine) masofa taxminan necha km bo'lishini siz ham hisoblab bering (Er radiusi R = 6371 km). Foydalanuvchi buni hisoblashda baza koordinatalari ishlatilganini bilsin.
   - "matchedLocationIds" massiviga ushbu topilgan muassasalarning ID-larini tartib bilan kiriting (Masalan, birinchi muassasa ID-si va ikkinchi muassasa ID-si).
4. Agar bitta muassasani o'zini so'ragan yoki aniqlagan bo'lsa, "matchedLocationIds" ga o'sha muassasa ID-sini kiriting. Shunda tizim foydalanuvchiga xaritani va navigatsiyani avtomatik yuboradi.
5. Suhbat niyatiga qarab "intent" qiymatini belgilang:
   - 'distance' (ikki muassasa orasidagi masofani so'raganda)
   - 'info' (bitta muassasani qidirganda yoki u haqda ma'lumot so'raganda)
   - 'list' (tuman maktablari yoki bog'chalari ro'yxatni so'raganda)
   - 'general' (salomlashish, bot imkoniyati, u-bu mavzudagi umumiy gaplar uchun)`;

        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: userText,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                replyMessage: { type: Type.STRING, description: "Uzbek tilidagi odamga o'xshash muloyim, madaniyatli va mazmunli bevosita javob xabari." },
                matchedLocationIds: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Savolga mos keladigan muassasalarning ID-lari massivi (database dagi ID maydoni qiymatlari). Boshlang'ich nuqtadan yakuniy nuqtagacha tartiblangan bo'lishi kerak. Topilmasa, bo'sh massiv [] qoldiring."
                },
                intent: { type: Type.STRING, description: "Niyat turi: 'distance', 'info', 'list', yoki 'general'" }
              },
              required: ["replyMessage", "matchedLocationIds", "intent"]
            }
          }
        });
        
        const responseText = response.text || "{}";
        const result = JSON.parse(responseText);

        let finalReplyText = result.replyMessage || "Kechirasiz, so'rovingiz bo'yicha to'g'ri javob tuza olmadim.";
        const matchedIds = result.matchedLocationIds || [];

        // Filter valid matched locations from our allLocations using matchedIds
        const matchedLocations = [];
        for (const id of matchedIds) {
          const loc = allLocations.find(l => l.id === id);
          if (loc) matchedLocations.push(loc);
        }

        if (matchedLocations.length === 1) {
          const loc = matchedLocations[0];
          await ctx.reply(finalReplyText, {
            reply_markup: {
               inline_keyboard: [[
                  { text: "🗺 Yandex Xarita", url: `https://yandex.ru/maps/?rtext=~${loc.lat},${loc.lng}` },
                  { text: "📍 Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}` }
               ]]
            }
          });
          await ctx.replyWithLocation(loc.lat, loc.lng);

        } else if (matchedLocations.length >= 2) {
          const computeHaversine = (lat1, lon1, lat2, lon2) => {
            const R = 6371; // Earth's radius in km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = 
              Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c; // Distance in km
          };

          const getDrivingRouteDetails = async (locations) => {
            try {
              const coordsList = locations.map(loc => `${loc.lng},${loc.lat}`).join(';');
              const url = `https://router.project-osrm.org/route/v1/driving/${coordsList}?overview=false`;
              const res = await fetch(url);
              const data = await res.json();
              if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const segments = route.legs ? route.legs.map(leg => leg.distance / 1000) : [];
                return {
                  totalDist: route.distance / 1000,
                  totalDuration: route.duration / 60,
                  segments
                };
              }
            } catch (err) {
              console.error("OSRM call failed, falling back:", err);
            }
            return null;
          };

          // Route cache validation and generation
          const cacheDocId = matchedIds.join('_');
          const cacheRef = doc(db, 'route_cache', cacheDocId);
          let roadDetails = null;
          try {
            const cacheSnap = await getDoc(cacheRef);
            if (cacheSnap.exists()) {
              const cacheData = cacheSnap.data();
              roadDetails = {
                totalDist: cacheData.totalDist,
                totalDuration: cacheData.totalDuration,
                segments: cacheData.segments || []
              };
              console.log("⚡ Cached route loaded for:", cacheDocId);
            }
          } catch (cacheErr) {
            console.error("Cache read error:", cacheErr);
          }

          if (!roadDetails) {
            roadDetails = await getDrivingRouteDetails(matchedLocations);
            if (roadDetails) {
              try {
                await setDoc(cacheRef, {
                  ids: matchedIds,
                  totalDist: roadDetails.totalDist,
                  totalDuration: roadDetails.totalDuration,
                  segments: roadDetails.segments || [],
                  createdAt: new Date().toISOString()
                });
                console.log("💾 Saved new route to cache:", cacheDocId);
              } catch (cacheWriteErr) {
                console.error("Cache write error:", cacheWriteErr);
              }
            }
          }

          if (matchedLocations.length === 2) {
            const loc1 = matchedLocations[0];
            const loc2 = matchedLocations[1];
            const straightKm = computeHaversine(loc1.lat, loc1.lng, loc2.lat, loc2.lng);
            
            if (roadDetails) {
              finalReplyText = `📐 **${loc1.name}** va **${loc2.name}** masofasi:\n\n` +
                                `🚗 Haqiqiy avtomobil yo'li orqali: **${roadDetails.totalDist.toFixed(2)} km**\n` +
                                `⏱ Taxminiy yo'l vaqti: **${Math.round(roadDetails.totalDuration)} minut**\n` +
                                `📐 Havo liniyasi (to'g'ri chiziq) bo'ylab: **${straightKm.toFixed(2)} km**`;
            } else {
              finalReplyText = `📐 **${loc1.name}** va **${loc2.name}** masofasi:\n\n` +
                                `📐 Havo liniyasi (to'g'ri chiziq) bo'ylab: **${straightKm.toFixed(2)} km**\n` +
                                `⚠️ (Avtomobil transporti yo'li hisoblagichi vaqtinchalik ishlamayapti)`;
            }
          } else {
            if (roadDetails) {
              let chainText = `📐 **Muassasalar orasidagi zanjirli masofalar (Avtomobil yo'li bo'yicha):**\n\n`;
              for (let i = 0; i < matchedLocations.length - 1; i++) {
                const l1 = matchedLocations[i];
                const l2 = matchedLocations[i+1];
                const segRoadKm = (roadDetails.segments && roadDetails.segments[i] !== undefined) ? roadDetails.segments[i] : computeHaversine(l1.lat, l1.lng, l2.lat, l2.lng);
                chainText += `• **${l1.name} ➡️ ${l2.name}**: ${segRoadKm.toFixed(2)} km\n`;
              }
              chainText += `\n🚗 **Jami haqiqiy avtomobil yo'li: ${roadDetails.totalDist.toFixed(2)} km**\n`;
              chainText += `⏱ **Jami taxminiy harakatlanish vaqti: ${Math.round(roadDetails.totalDuration)} minut**`;
              finalReplyText = chainText;
            } else {
              let totalD = 0;
              let chainText = `📐 **Muassasalar orasidagi zanjirli masofalar (To'g'ri chiziq bo'ylab):**\n\n`;
              for (let i = 0; i < matchedLocations.length - 1; i++) {
                const l1 = matchedLocations[i];
                const l2 = matchedLocations[i+1];
                const dist = computeHaversine(l1.lat, l1.lng, l2.lat, l2.lng);
                totalD += dist;
                chainText += `• **${l1.name} ➡️ ${l2.name}**: ${dist.toFixed(2)} km\n`;
              }
              chainText += `\n📐 Jami to'g'ri chiziqli masofa: **${totalD.toFixed(2)} km**`;
              finalReplyText = chainText;
            }
          }

          const yandexCoords = matchedLocations.map(loc => `~${loc.lat},${loc.lng}`).join('');
          const yandexUrl = `https://yandex.ru/maps/?rtext=${yandexCoords}`;

          const googleOrigin = `${matchedLocations[0].lat},${matchedLocations[0].lng}`;
          const googleDest = `${matchedLocations[matchedLocations.length - 1].lat},${matchedLocations[matchedLocations.length - 1].lng}`;
          let googleUrl = `https://www.google.com/maps/dir/?api=1&origin=${googleOrigin}&destination=${googleDest}`;
          if (matchedLocations.length > 2) {
            const googleWaypoints = matchedLocations.slice(1, -1).map(w => `${w.lat},${w.lng}`).join('%7C');
            googleUrl += `&waypoints=${googleWaypoints}`;
          }
          googleUrl += `&travelmode=driving`;

          await ctx.reply(finalReplyText, {
            reply_markup: {
               inline_keyboard: [[
                  { text: "🗺 Yandex Xarita (Yo'nalish)", url: yandexUrl },
                  { text: "📍 Google Maps (Yo'nalish)", url: googleUrl }
               ]]
            }
          });

        } else {
          await ctx.reply(finalReplyText, {
             reply_markup: getMainMenu()
          });
        }
    } catch (err) {
        console.error("Gemini AI error in text handler:", err);
        await ctx.reply("Kechirasiz, so'rovingizni tahlil qilishda nosozlik yuz berdi. Iltimos, muassasa raqamini aniqroq kiritib ko'ring (masalan: 12-maktab).");
    }
  });

  bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('✅ Telegram Bot muvaffaqiyatli ishga tushirildi!'))
    .catch((err) => console.error('❌ Bot launch xatosi:', err));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

} else {
  console.log('🛑 Telegram bot tokeni topilmadi yoki standart namuna qoldirilgan. Bot ishga tushirilmadi.');
}
