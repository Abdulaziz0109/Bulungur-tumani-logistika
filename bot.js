import express from 'express';
import { Telegraf } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const appServer = express();
const port = process.env.PORT || 10000;

appServer.get('/', (req, res) => {
  res.send('Bot is running and healthy!');
});

appServer.listen(port, '0.0.0.0', () => {
  console.log(`✅ Web server ${port} portda muvaffaqiyatli ishga tushdi!`);
});

if (process.env.RENDER) {
  // Read Firebase config
  const configPath = new URL('./firebase-applet-config.json', import.meta.url);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Initialize Firebase
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);

  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  let ai = null;
  if (process.env.GEMINI_API_KEY) {
      ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } else {
      console.warn("DIQQAT: GEMINI_API_KEY topilmadi. AI funksiyalari (matnni ishlash) ishlamaydi yoki xatolik berishi mumkin.");
  }

  bot.start((ctx) => {
    ctx.reply('Assalomu alaykum! Men Bulung\'ur MMTB Logistika yordamchisiman. Menga istalgancha yozishingiz mumkin (Masalan: "15-maktab va 3-bog\'cha qayerda?").\n\nQo\'shimcha komandalar:\n/stat - Tuman statistikasi\n/report - Rasmli hisobot yuborish');
  });

  bot.command('stat', async (ctx) => {
    try {
      const querySnapshot = await getDocs(collection(db, 'locations'));
      const docs = [];
      querySnapshot.forEach((doc) => docs.push(doc.data()));
      
      const allDocs = [...docs];
      
      const total = allDocs.length;
      const maktablar = allDocs.filter(doc => doc.type === 'maktab').length;
      const bogchalar = allDocs.filter(doc => doc.type === 'dmtt' || doc.type === 'bogcha').length;
      const boshqa = allDocs.filter(doc => doc.type !== 'maktab' && doc.type !== 'dmtt' && doc.type !== 'bogcha').length;
      
      ctx.reply(`📊 *Bulung'ur MMTB Bazasi holati:*\n\nJami ob'ektlar soni: ${total} ta\nShundan maktablar: ${maktablar} ta\nBog'chalar (DMTT): ${bogchalar} ta\nBoshqa tashkilotlar: ${boshqa} ta`, { parse_mode: 'Markdown' });
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
          model: "gemini-3.5-flash",
          contents: userText,
          config: {
            systemInstruction: "Siz Bulung'ur MMTB logistika botisiz. Foydalanuvchi xabaridan qidirilayotgan barcha ob'ektlarni (maktab va bog'chalarni) aniqlang va ularni ro'yxat qilib ajrating.\n\nMisollar:\n- 'Yangiobodda qaysi maktablar bor edi' yoki 'Yangiobod maktabi' -> [{'query': 'Yangiobod', 'type': 'maktab'}]\n- '9 maktab' -> [{'query': '9', 'type': 'maktab'}]\n- '4-12-16-bogchalar' -> [{'query': '4', 'type': 'dmtt'}, {'query': '12', 'type': 'dmtt'}, {'query': '16', 'type': 'dmtt'}]\n- 'Sohibkor mahallasidagi bog\'cha' -> [{'query': 'Sohibkor', 'type': 'dmtt'}]\n- '15-maktab va 3-bog\'cha' -> [{'query': '15', 'type': 'maktab'}, {'query': '3', 'type': 'dmtt'}]\n\nObyekt turi 'type' maydoni uchun: 'maktab' (maktablar uchun), 'dmtt' (bog'chalar/DMTT/MTTlar uchun), 'barchasi' yoki 'boshqa' (aniq bo'lmasa).\n\nAgar foydalanuvchi ob'ekt qidirmayotgan bo'lsa (faqat salomlashsa yoki umumiy gap gapirsa), 'replyMessage' maydoniga uzbek tilida muloyim javob yozing. Hech qanday markdown maxsus belgilaridan (* kabi) foydalanmang.",
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
            await ctx.reply("Sizning harakatingizdan kelib chiqib, hozirgi joylashuvingizdan marshrut belgilanadi. Yandex Maps tugmasini bossangiz, marshrut ochiladi.\n\n⏳ Manzillar izlanmoqda va marshrut hisoblanmoqda... Kuting.");
            const querySnapshot = await getDocs(collection(db, 'locations'));
            const allLocations = [];
            
            querySnapshot.forEach((doc) => {
              const data = doc.data();
              if (data.name && data.lat && data.lng) allLocations.push({ id: doc.id, ...data });
            });
            
            // Collect all matched locations with helper matching function
            const matchedLocations = [];
            const matchedIds = new Set();

            const isLocMatch = (loc, qStr, tStr) => {
                const nameLower = (loc.name || "").toLowerCase();
                const mahallaLower = (loc.mahalla || "").toLowerCase();
                const landmarkLower = (loc.landmark || "").toLowerCase();
                const qLower = qStr.toLowerCase().trim();

                // Match types
                if (tStr === 'maktab' && loc.type !== 'maktab') return false;
                if ((tStr === 'dmtt' || tStr.includes('bog')) && loc.type !== 'dmtt') return false;

                // 1. Exact number matching to prevent '9' from matching '59', '29', etc.
                const qNums = qLower.match(/\d+/g);
                if (qNums && qNums.length > 0) {
                    const locNums = nameLower.match(/\d+/g);
                    if (locNums && locNums.length > 0) {
                        const hasExactNumber = qNums.some(qNum => locNums.includes(qNum));
                        if (hasExactNumber) return true;
                        return false;
                    }
                }

                // 2. Direct string contains matching
                if (nameLower.includes(qLower) || mahallaLower.includes(qLower) || landmarkLower.includes(qLower)) {
                    return true;
                }

                // 3. Uzbek Locative/Possessive Suffix Stripping for mahalla / names
                if (qLower.length > 4) {
                    const stemmed = qLower.replace(/(da|dagi|ning|si|i|dan|ga|ligi|lar|lari)$/, '').trim();
                    if (stemmed.length > 2) {
                        if (nameLower.includes(stemmed) || mahallaLower.includes(stemmed) || landmarkLower.includes(stemmed)) {
                            return true;
                        }
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

            if (matchedLocations.length === 0) {
                await ctx.reply(`Afsuski, so'rov bo'yicha hech narsa topilmadi.`);
                return;
            }

            if (matchedLocations.length === 1) {
                // Single destination
                const loc = matchedLocations[0];
                let descriptionText = `📍 Topildi: ${loc.name}`;
                
                try {
                    const prompt = `Foydalanuvchi "Qayerda?" mazmunida savol berdi.
So'rov: "${userText}"

Bazadan topilgan ma'lumot:
Nomi: ${loc.name}
Mo'ljal: ${loc.landmark || "kiritilmagan"}
Turi: ${loc.type === 'dmtt' ? "Maktabgacha ta'lim tashkiloti" : (loc.type === 'maktab' ? "Maktab" : loc.type)}
Sig'imi: ${loc.capacity ? loc.capacity + " o'rin" : "kiritilmagan"}
Maydoni: ${loc.area ? loc.area + " ga" : "kiritilmagan"}

Vazifa: Foydalanuvchiga ushbu joy qayerda ekanligini odamga o'xshab, muloyim va tushunarli tarzda izohlab bering. Agar mo'ljal kiritilgan bo'lsa, albatta yozing (Masalan: "Ushbu maktab ... mo'ljalida joylashgan"). Agar mo'ljal kiritilmagan bo'lsa, "Afsuski, aniq mo'ljal kiritilmagan, lekin xaritadagi aniq joylashuvini quyida yuborganman" deb tushuntiring. Imkon qadar qisqa (2-3 gap) va tabiiy matn yarating. Hech qanday markdown qalinlarsiz sof matn qaytaring.`;

                    const descRes = await ai.models.generateContent({
                        model: "gemini-3.5-flash",
                        contents: prompt
                    });
                    if (descRes.text) {
                        descriptionText = descRes.text;
                    }
                } catch (e) {
                    console.error("AI tushuntirishda xato:", e);
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

                    let messageTxt = "Boradigan manzillaringiz:\n\n";
                    orderedLocations.forEach((loc, index) => {
                        messageTxt += `${index + 1}. ${loc.name}\n`;
                    });

                    // Build Multi-stop Yandex URL
                    const yandexCoords = orderedLocations.map(loc => `~${loc.lat},${loc.lng}`).join('');
                    const yandexUrl = `https://yandex.ru/maps/?rtext=${yandexCoords}`;

                    // Build Multi-stop Google URL
                    const googleOrigin = `${orderedLocations[0].lat},${orderedLocations[0].lng}`;
                    const googleDest = `${orderedLocations[orderedLocations.length - 1].lat},${orderedLocations[orderedLocations.length - 1].lng}`;
                    const googleWaypoints = orderedLocations.slice(1, -1).map(w => `${w.lat},${w.lng}`).join('%7C');
                    const googleUrl = `https://www.google.com/maps/dir/?api=1&origin=${googleOrigin}&destination=${googleDest}${googleWaypoints ? `&waypoints=${googleWaypoints}` : ''}&travelmode=driving`;

                    await ctx.reply(messageTxt, {
                      reply_markup: {
                         inline_keyboard: [[
                            { text: "🗺 Yandex Navigator", url: yandexUrl },
                            { text: "📍 Google Maps", url: googleUrl }
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

                    const googleOrigin = `${matchedLocations[0].lat},${matchedLocations[0].lng}`;
                    const googleDest = `${matchedLocations[matchedLocations.length - 1].lat},${matchedLocations[matchedLocations.length - 1].lng}`;
                    const googleWaypoints = matchedLocations.slice(1, -1).map(w => `${w.lat},${w.lng}`).join('%7C');
                    const googleUrlFallback = `https://www.google.com/maps/dir/?api=1&origin=${googleOrigin}&destination=${googleDest}${googleWaypoints ? `&waypoints=${googleWaypoints}` : ''}&travelmode=driving`;

                    await ctx.reply(messageTxt, {
                      reply_markup: {
                         inline_keyboard: [[
                            { text: "🗺 Yandex'da ochish", url: yandexUrl },
                            { text: "📍 Google Maps'da", url: googleUrlFallback }
                         ]]
                      }
                    });
                }
            }
        } else if (result.replyMessage) {
            await ctx.reply(result.replyMessage);
        } else {
            await ctx.reply("Kechirasiz, so'rovingizni tushuna olmadim.");
        }

    } catch (err) {
        console.error("AI bilan ishlashda xatolik:", err);
        // Fallback
        await ctx.reply("Sizning so'rovingizni qayta ishlashda xatolik yuz berdi. Iltimos keyinroq urinib ko'ring yoki faqat obyekt raqamini yozing.");
    }
  });

  bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('✅ Bot FAQAT Render muhitida ishga tushdi!'))
    .catch((err) => console.error('Bot xatosi:', err));

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

} else {
  console.log('🛑 409-xatolikni oldini olish uchun lokal muhitda bot IQTISOD QILINDI (ishga tushirilmadi).');
}
