import express from 'express';
import { Telegraf } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc } from 'firebase/firestore';
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

    // AI smart parsing with Gemini
    try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: userText,
          config: {
            systemInstruction: "Siz Bulung'ur MMTB logistika botisiz. Foydalanuvchi xabaridan qidirilayotgan barcha ob'ektlarni (maktab va bog'chalarni) aniqlang va ularni ro'yxat qilib ajrating.\n\nMisollar:\n- 'Yangiobod maktabi' -> [{'query': 'Yangiobod', 'type': 'maktab'}]\n- '9 maktab' -> [{'query': '9', 'type': 'maktab'}]\n- '4 va 12-bogchalar' -> [{'query': '4', 'type': 'dmtt'}, {'query': '12', 'type': 'dmtt'}]\n- 'Sohibkor mahallasidagi bog\'cha' -> [{'query': 'Sohibkor', 'type': 'dmtt'}]\n- '15-maktab va 3-bog\'cha' -> [{'query': '15', 'type': 'maktab'}, {'query': '3', 'type': 'dmtt'}]\n\nObyekt turi 'type' maydoni uchun: 'maktab' (maktablar uchun), 'dmtt' (bog'chalar/DMTT/MTTlar uchun), 'barchasi' yoki 'boshqa' (aniq bo'lmasa).\n\nAgar foydalanuvchi ob'ekt qidirmayotgan bo'lsa (faqat salomlashsa yoki umumiy gap gapirsa), 'replyMessage' maydoniga uzbek tilida muloyim javob yozing. Hech qanday markdown maxsus belgilaridan (* kabi) foydalanmang.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                searchTargets: {
                  type: Type.ARRAY,
                  items: { 
                     type: Type.OBJECT,
                     properties: {
                         query: { type: Type.STRING, description: "Qidirilayotgan obyekt raqami yoki asosiy nomi (masalan: '15')" },
                         type: { type: Type.STRING, description: "Obyekt turi: 'maktab', 'dmtt' yoki 'barchasi'" }
                     }
                  },
                  description: "Qidirilayotgan obyektlar."
                },
                replyMessage: {
                  type: Type.STRING,
                  description: "Agar u qandaydir savol yoki salomlashish bo'lsayu ob'ekt qidirmayotgan bo'lsa, javob xati."
                }
              }
            }
          }
        });
        
        const responseText = response.text || "{}";
        const result = JSON.parse(responseText);

        if (result.searchTargets && result.searchTargets.length > 0) {
            const tempWait = await ctx.reply("⏳ Qidiruv so'rovi tahlil qilinmoqda, ma'lumotlar bazasidan mosliklar qidirilmoqda...");
            
            const querySnapshot = await getDocs(collection(db, 'locations'));
            const allLocations = [];
            querySnapshot.forEach((doc) => {
              const data = doc.data();
              if (data.name && data.lat && data.lng) allLocations.push({ id: doc.id, ...data });
            });
            
            const matchedLocations = [];
            const matchedIds = new Set();

            const isLocMatch = (loc, qStr, tStr) => {
                const nameLower = (loc.name || "").toLowerCase();
                const mahallaLower = (loc.mahalla || "").toLowerCase();
                const landmarkLower = (loc.landmark || "").toLowerCase();
                const qLower = qStr.toLowerCase().trim();

                if (tStr === 'maktab' && loc.type !== 'maktab') return false;
                if ((tStr === 'dmtt' || tStr.includes('bog')) && loc.type !== 'dmtt') return false;

                const qNums = qLower.match(/\d+/g);
                if (qNums && qNums.length > 0) {
                    const locNums = nameLower.match(/\d+/g);
                    if (locNums && locNums.length > 0) {
                        return qNums.some(qNum => locNums.includes(qNum));
                    }
                }

                if (nameLower.includes(qLower) || mahallaLower.includes(qLower) || landmarkLower.includes(qLower)) {
                    return true;
                }

                if (qLower.length > 4) {
                    const stemmed = qLower.replace(/(da|dagi|ning|si|i|dan|ga|ligi|lar|lari)$/, '').trim();
                    if (stemmed.length > 2) {
                        return (nameLower.includes(stemmed) || mahallaLower.includes(stemmed) || landmarkLower.includes(stemmed));
                    }
                }

                return false;
            };

            for (const target of result.searchTargets) {
                const queryStr = (target.query || target).toString().toLowerCase().trim();
                const typeStr = (target.type || "").toLowerCase().trim();
                
                const found = allLocations.filter(loc => isLocMatch(loc, queryStr, typeStr));
                for (const loc of found) {
                    if (!matchedIds.has(loc.id)) {
                        matchedLocations.push(loc);
                        matchedIds.add(loc.id);
                    }
                }
            }

            await ctx.telegram.deleteMessage(ctx.chat.id, tempWait.message_id).catch(()=>{});

            if (matchedLocations.length === 0) {
                await ctx.reply(`😔 Afsuski, qidirilgan so'rov bo'yicha ma'lumotlar bazasidan moslik topilmadi. Iltimos muassasa raqamini tekshirib qayta yozib ko'ring.`);
                return;
            }

            if (matchedLocations.length === 1) {
                const loc = matchedLocations[0];
                let descriptionText = `🏫 *${loc.name}* topildi.`;
                
                try {
                    const prompt = `Foydalanuvchi "Qayerda?" mazmunida savol berdi.\n` +
                                   `So'rov: "${userText}"\n\n` +
                                   `Bazadan topilgan ma'lumot:\n` +
                                   `Nomi: ${loc.name}\n` +
                                   `Mo'ljal: ${loc.landmark || "kiritilmagan"}\n` +
                                   `Turi: ${loc.type === 'dmtt' ? "Maktabgacha ta'lim tashkiloti" : (loc.type === 'maktab' ? "Maktab" : loc.type)}\n` +
                                   `Sig'imi: ${loc.capacity ? loc.capacity + " o'rin" : "kiritilmagan"}\n\n` +
                                   `Vazifa: Foydalanuvchiga ushbu joy qayerda ekanligini odamga o'xshab o'ta muloyim, qisqa (2-3 ta gap) va chiroyli qilib tushuntirib bering. Mo'ljalni alohida urg'ulab o'ting (Masalan: "Ushbu maktab falonchi joy mo'ljalida joylashgan bo'lib..."). Faqat toza matn qaytaring, markdown yulduzchalarisiz.`;
                    const descRes = await ai.models.generateContent({
                        model: "gemini-3.5-flash",
                        contents: prompt
                    });
                    if (descRes.text) {
                        descriptionText = descRes.text;
                    }
                } catch (e) {
                    console.error("AI desc generation error:", e);
                }

                await ctx.reply(descriptionText, {
                  reply_markup: {
                     inline_keyboard: [[
                        { text: "🗺 Yandex'da ochish", url: `https://yandex.ru/maps/?rtext=~${loc.lat},${loc.lng}` },
                        { text: "📍 Google Maps'da", url: `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}` }
                     ]]
                  }
                });
                await ctx.replyWithLocation(loc.lat, loc.lng);
            } else if (matchedLocations.length > 8) {
                // Safeguard against too many waypoints for OSRM API (Max 8 stops inline selection list)
                let listMessage = `🤖 *AI qidiruv:* So'rovingiz bo'yicha *${matchedLocations.length} ta* muassasa topildi:\n\n`;
                const buttons = [];
                
                matchedLocations.slice(0, 10).forEach((loc, idx) => {
                   listMessage += `${idx + 1}. *${loc.name}*\n📍 Mo'ljal: ${loc.landmark || "kiritilmagan"}\n\n`;
                   buttons.push([{
                      text: `📍 ${loc.name} (Joylashuvi)`, 
                      callback_data: `show_loc_${loc.lat}_${loc.lng}`
                   }]);
                });
                
                if (matchedLocations.length > 10) {
                   listMessage += `⚠️ Natijalar ko'pligi sababli dastlabki 10 tasi ko'rsatildi. Kamroq ob'ektlarni jamlang.`;
                }

                await ctx.reply(listMessage, { 
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: buttons
                  }
                });
            } else {
                // Multi-stop Optimization (Under 8 locations - safe for OSRM API)
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

                    let messageTxt = "🗺 *Optimallashgan borish marshruti (Eng qisqa yo'l):*\n\n";
                    orderedLocations.forEach((loc, index) => {
                        messageTxt += `${index === 0 ? '🏁 Boshlang\'ich nuqta' : `${index}-manzil`}: *${loc.name}*\n📍 Mo'ljal: _${loc.landmark || "kiritilmagan"}_\n\n`;
                    });

                    const yandexCoords = orderedLocations.map(loc => `~${loc.lat},${loc.lng}`).join('');
                    const yandexUrl = `https://yandex.ru/maps/?rtext=${yandexCoords}`;

                    const googleOrigin = `${orderedLocations[0].lat},${orderedLocations[0].lng}`;
                    const googleDest = `${orderedLocations[orderedLocations.length - 1].lat},${orderedLocations[orderedLocations.length - 1].lng}`;
                    const googleWaypoints = orderedLocations.slice(1, -1).map(w => `${w.lat},${w.lng}`).join('%7C');
                    const googleUrl = `https://www.google.com/maps/dir/?api=1&origin=${googleOrigin}&destination=${googleDest}${googleWaypoints ? `&waypoints=${googleWaypoints}` : ''}&travelmode=driving`;

                    await ctx.reply(messageTxt, {
                      parse_mode: 'Markdown',
                      reply_markup: {
                         inline_keyboard: [
                            [
                              { text: "🗺 Yandex Navigatsiya", url: yandexUrl },
                              { text: "📍 Google Maps", url: googleUrl }
                            ]
                         ]
                      }
                    });
                } catch (routeErr) {
                    console.error("OSRM optimization error:", routeErr);
                    // Fast fallback
                    let messageTxt = "📍 *Topilgan manzillar ro'yxati (Ketma-ketlik):*\n\n";
                    matchedLocations.forEach((loc, index) => {
                        messageTxt += `${index + 1}. *${loc.name}*\n📍 Mo'ljal: _${loc.landmark || "kiritilmagan"}_\n\n`;
                    });
                    
                    const buttons = matchedLocations.map(loc => [
                       { text: `🗺 ${loc.name}`, url: `https://yandex.ru/maps/?rtext=~${loc.lat},${loc.lng}` }
                    ]);

                    await ctx.reply(messageTxt, {
                      parse_mode: 'Markdown',
                      reply_markup: { inline_keyboard: buttons }
                    });
                }
            }
        } else if (result.replyMessage) {
            await ctx.reply(result.replyMessage);
        } else {
            await ctx.reply("🤔 Kechirasiz, so'rovingiz bo'yicha hech qanday obyektni aniqlay olmadim. Iltimos, aniqroq yozing.");
        }

    } catch (err) {
        console.error("Gemini AI error in text handler:", err);
        await ctx.reply("❌ So'rovingizni tahlil qilishda xatolik yuz berdi. Iltimos, faqat muassasa raqamining o'zini yozib yuboring.");
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
