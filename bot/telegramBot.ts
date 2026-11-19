import { Telegraf } from 'telegraf';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, doc, getDoc, setDoc, Firestore } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

interface BotLocation {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  mahalla?: string;
  landmark?: string;
  capacity?: number;
  cadastre?: string;
  totalLandArea?: number;
  buildingFootprintArea?: number;
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

function normalizeText(input: string): string {
  if (!input) return '';
  let out = '';
  for (const ch of input.toLowerCase()) {
    out += CYRILLIC_TO_LATIN[ch] !== undefined ? CYRILLIC_TO_LATIN[ch] : ch;
  }
  return out
    .replace(/['‘’`ʻʼ"]/g, '')
    .replace(/[-_.,/\\()?!:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistanceLabel(km: number): string {
  if (km < 1) {
    return `${km.toFixed(2)} km (${Math.round(km * 1000)} m)`;
  }
  return `${km.toFixed(2)} km`;
}

function stripUzbekSuffix(token: string): string {
  return token
    .replace(/(gacha|ning|niki|dagi|dan|ga|ka|qa|da|ta|ni|si|i)$/i, '')
    .trim();
}

const STOP_WORDS = new Set([
  'masofa', 'masofasi', 'qancha', 'necha', 'km', 'kilometr', 'metr', 'orasi',
  'orasida', 'orasidagi', 'ortasida', 'tekis', 'togri', 'chiziq', 'havo',
  'olchaganda', 'olchash', 'mashina', 'avtomobil', 'yoli', 'yolda', 'yol',
  'qayerda', 'joylashuvi', 'joylashgan', 'manzil', 'manzili', 'kadastr',
  'haqida', 'malumot', 'kerak', 'menga', 'topib', 'ber', 'bering', 'korsat',
  'marshrut', 'yonalish', 'qilib', 'ketmoqchiman', 'bormoqchiman', 'va', 'bilan',
  'hamda', 'dan', 'ga', 'gacha', 'uchun', 'eng', 'yaqin', 'ayting', 'ayt', 'chi'
]);

const KG_ALIASES = new Set(['bogcha', 'bog', 'dmtt', 'mtt', 'dmt', 'sadik', 'yasli']);
const SCHOOL_ALIASES = new Set(['maktab', 'mkt', 'shkola', 'school']);

function scoreLocationAgainstSegment(loc: BotLocation, rawSegment: string): number {
  const segNorm = normalizeText(rawSegment);
  if (!segNorm) return 0;

  const rawTokens = segNorm
    .split(' ')
    .map(stripUzbekSuffix)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));

  if (rawTokens.length === 0) return 0;

  const nameNorm = normalizeText(loc.name);
  const mahallaNorm = normalizeText(loc.mahalla || '');
  const landmarkNorm = normalizeText(loc.landmark || '');
  const isSchool = loc.type === 'maktab' || nameNorm.includes('maktab');
  const isKg = loc.type === 'dmtt' || loc.type === 'bogcha' || nameNorm.includes('dmtt') || nameNorm.includes('bogcha');

  const typeAliases = isSchool ? 'maktab' : isKg ? 'bogcha dmtt mtt' : 'boshqa tashkilot';
  const combined = `${nameNorm} ${typeAliases} ${mahallaNorm} ${landmarkNorm}`;

  const matchedAll = rawTokens.every((tok) => {
    if (KG_ALIASES.has(tok)) return isKg || combined.includes(tok);
    if (SCHOOL_ALIASES.has(tok)) return isSchool || combined.includes('maktab');
    return combined.includes(tok);
  });

  if (!matchedAll) return 0;

  let score = 10;
  const cleanedPhrase = rawTokens.join(' ');
  if (nameNorm === cleanedPhrase) score += 200;
  else if (nameNorm.startsWith(cleanedPhrase)) score += 120;
  else if (nameNorm.includes(cleanedPhrase)) score += 60;

  const nameWords = nameNorm.split(' ');
  for (const tok of rawTokens) {
    if (/^\d+$/.test(tok)) {
      if (nameWords.includes(tok)) score += 160;
      else if (nameNorm.startsWith(tok)) score += 90;
      else score -= 30;
    }
    if (KG_ALIASES.has(tok) && isKg) score += 80;
    if (SCHOOL_ALIASES.has(tok) && isSchool) score += 80;
  }

  return score;
}

function searchSingleQuery(allLocations: BotLocation[], queryText: string): BotLocation[] {
  const scored = allLocations
    .map((loc) => ({ loc, score: scoreLocationAgainstSegment(loc, queryText) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.loc.name.localeCompare(b.loc.name));

  return scored.map((s) => s.loc);
}

function extractMultipleLocations(userText: string, allLocations: BotLocation[]): BotLocation[] {
  const norm = normalizeText(userText);
  if (!norm) return [];

  // Split by explicit connectors and Uzbek -dan ... -ga(cha) boundary
  const withBoundaries = norm
    .replace(/\b(bilan|hamda|va)\b/g, ' | ')
    .replace(/(\S+dan)\s+/g, '$1 | ')
    .replace(/[;,]+/g, ' | ');

  const rawSegments = withBoundaries
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const picked: BotLocation[] = [];
  const pickedIds = new Set<string>();

  for (const seg of rawSegments) {
    const matches = searchSingleQuery(allLocations, seg);
    if (matches.length > 0) {
      const candidate = matches.find((m) => !pickedIds.has(m.id));
      if (candidate) {
        picked.push(candidate);
        pickedIds.add(candidate.id);
      }
    }
  }

  return picked;
}

function isDistanceIntent(text: string): boolean {
  const norm = normalizeText(text);
  return /\b(masofa|masofasi|orasi|orasida|orasidagi|ortasida|qancha|necha|km|tekis|togri|havo|mashina|avtomobil|yoli|yolda|olchaganda|gacha|uzoq)\b/.test(
    norm
  );
}

async function getDrivingRouteOSRM(
  locs: BotLocation[],
  db: Firestore
): Promise<{ totalDistKm: number; totalDurationMin: number; segmentKms: number[] } | null> {
  if (locs.length < 2) return null;

  const cacheDocId = locs.map((l) => l.id).join('_').slice(0, 120);
  const cacheRef = doc(db, 'route_cache', cacheDocId);

  try {
    const cacheSnap = await getDoc(cacheRef);
    if (cacheSnap.exists()) {
      const data = cacheSnap.data();
      if (typeof data.totalDist === 'number' && typeof data.totalDuration === 'number') {
        return {
          totalDistKm: data.totalDist,
          totalDurationMin: data.totalDuration,
          segmentKms: Array.isArray(data.segments) ? data.segments : []
        };
      }
    }
  } catch {
    // Ignore cache read error
  }

  try {
    const coordsList = locs.map((loc) => `${loc.lng},${loc.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsList}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
      const route = data.routes[0];
      const totalDistKm = route.distance / 1000;
      const totalDurationMin = route.duration / 60;
      const segmentKms: number[] = Array.isArray(route.legs)
        ? route.legs.map((leg: any) => leg.distance / 1000)
        : [];

      try {
        await setDoc(cacheRef, {
          ids: locs.map((l) => l.id),
          totalDist: totalDistKm,
          totalDuration: totalDurationMin,
          segments: segmentKms,
          createdAt: new Date().toISOString()
        });
      } catch {
        // Ignore cache write error
      }

      return { totalDistKm, totalDurationMin, segmentKms };
    }
  } catch (err) {
    console.error('Bot OSRM routing error:', err);
  }
  return null;
}

function buildYandexNavUrl(locs: BotLocation[]): string {
  if (locs.length === 1) {
    return `https://yandex.uz/maps/?rtext=~${locs[0].lat},${locs[0].lng}&rtt=auto`;
  }
  const coords = locs.map((l) => `${l.lat},${l.lng}`).join('~');
  return `https://yandex.uz/maps/?rtext=${coords}&rtt=auto`;
}

function buildGoogleNavUrl(locs: BotLocation[]): string {
  if (locs.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${locs[0].lat},${locs[0].lng}&travelmode=driving&dir_action=navigate`;
  }
  const origin = `${locs[0].lat},${locs[0].lng}`;
  const destination = `${locs[locs.length - 1].lat},${locs[locs.length - 1].lng}`;
  const waypoints = locs.slice(1, -1).map((l) => `${l.lat},${l.lng}`).join('%7C');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving&dir_action=navigate`;
}

let activeBot: Telegraf | null = null;

export async function startTelegramBot(): Promise<{ started: boolean; reason?: string }> {
  if (activeBot) {
    return { started: true };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || botToken === 'yoto_telegram_bot_token' || botToken.trim() === '') {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN topilmadi — Telegram bot ishga tushirilmadi.');
    return { started: false, reason: 'missing_token' };
  }

  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    console.error('❌ firebase-applet-config.json topilmadi, bot ishga tushmadi.');
    return { started: false, reason: 'missing_firebase_config' };
  }

  let firebaseConfig: any;
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error('❌ firebase-applet-config.json o‘qishda xato:', err);
    return { started: false, reason: 'invalid_firebase_config' };
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  const bot = new Telegraf(botToken);
  activeBot = bot;

  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  const appUrl =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'https://ais-pre-yrj7r5rkwlnfgheh3zezzn-710564119497.asia-southeast1.run.app';
  const hasHttpsWebApp = appUrl.startsWith('https://');

  // Locations 60-second memory cache
  let cachedLocations: BotLocation[] = [];
  let cacheExpiresAt = 0;

  async function getAllLocations(forceRefresh = false): Promise<BotLocation[]> {
    const now = Date.now();
    if (!forceRefresh && cachedLocations.length > 0 && now < cacheExpiresAt) {
      return cachedLocations;
    }
    const querySnapshot = await getDocs(collection(db, 'locations'));
    const list: BotLocation[] = [];
    querySnapshot.forEach((d) => {
      const data = d.data() as any;
      if (data.name && typeof data.lat === 'number' && typeof data.lng === 'number') {
        list.push({
          id: d.id,
          name: data.name,
          type: data.type || 'muassasa',
          lat: data.lat,
          lng: data.lng,
          mahalla: data.mahalla || '',
          landmark: data.landmark || '',
          capacity: data.capacity,
          cadastre: data.cadastre || '',
          totalLandArea: data.totalLandArea,
          buildingFootprintArea: data.buildingFootprintArea
        });
      }
    });
    cachedLocations = list;
    cacheExpiresAt = now + 60_000;
    return list;
  }

  const getMainMenu = () => {
    const keyboard: any[][] = [
      [{ text: "📍 Eng yaqin maktab/bog'cha", request_location: true }]
    ];
    if (hasHttpsWebApp) {
      keyboard.push([{ text: "🗺 To'liq xaritani ochish", web_app: { url: appUrl } }]);
    }
    keyboard.push([{ text: '📊 Tuman statistikasi' }, { text: "ℹ️ Qo'llanma / Yordam" }]);
    return {
      keyboard,
      resize_keyboard: true,
      persistent: true
    };
  };

  async function replySingleLocation(ctx: any, loc: BotLocation) {
    const typeLabel =
      loc.type === 'dmtt' || loc.type === 'bogcha'
        ? "Bog'cha (DMTT)"
        : loc.type === 'maktab'
        ? 'Maktab'
        : 'Muassasa';

    let text = `🏫 <b>${escapeHtml(loc.name)}</b>\n`;
    text += `🏷 <b>Turi:</b> ${escapeHtml(typeLabel)}\n`;
    if (loc.mahalla) text += `🏛 <b>Mahalla:</b> ${escapeHtml(loc.mahalla)}\n`;
    if (loc.landmark) text += `📍 <b>Mo'ljal:</b> ${escapeHtml(loc.landmark)}\n`;
    if (loc.cadastre) text += `🔢 <b>Kadastr:</b> <code>${escapeHtml(loc.cadastre)}</code>\n`;
    if (loc.totalLandArea) text += `📐 <b>Yer maydoni:</b> ${loc.totalLandArea} m²\n`;
    if (loc.capacity) text += `👥 <b>Sig'imi:</b> ${loc.capacity} o'rin\n`;

    const buttons: any[][] = [
      [
        { text: '🚗 Yandex Navigatsiya', url: buildYandexNavUrl([loc]) },
        { text: '🗺 Google Maps', url: buildGoogleNavUrl([loc]) }
      ]
    ];
    if (hasHttpsWebApp) {
      buttons.push([{ text: '📱 Sayt xaritada ochish', web_app: { url: appUrl } }]);
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons }
    });
    await ctx.replyWithLocation(loc.lat, loc.lng).catch(() => {});
  }

  async function replyMultiLocationDistance(ctx: any, locs: BotLocation[]) {
    const roadDetails = await getDrivingRouteOSRM(locs, db);

    let msg = '';
    if (locs.length === 2) {
      const [l1, l2] = locs;
      const straightKm = haversineDistanceKm(l1.lat, l1.lng, l2.lat, l2.lng);

      msg += `📏 <b>${escapeHtml(l1.name)}</b> ↔️ <b>${escapeHtml(l2.name)}</b>\n\n`;
      msg += `📐 <b>Tekis o'lchaganda (to'g'ri chiziq):</b> ${formatDistanceLabel(straightKm)}\n`;
      if (roadDetails) {
        msg += `🚗 <b>Mashina yo'li bilan:</b> ${formatDistanceLabel(roadDetails.totalDistKm)}\n`;
        msg += `⏱ <b>Taxminiy yo'l vaqti:</b> ~${Math.max(1, Math.round(roadDetails.totalDurationMin))} daqiqa`;
      } else {
        msg += `⚠️ <i>Mashina yo'li xizmati vaqtincha javob bermadi, tekis masofa ko'rsatildi.</i>`;
      }
    } else {
      let totalStraightKm = 0;
      msg += `🚚 <b>Ko'p manzilli masofa hisobi (${locs.length} ta nuqta):</b>\n\n`;
      for (let i = 0; i < locs.length - 1; i++) {
        const a = locs[i];
        const b = locs[i + 1];
        const segStraight = haversineDistanceKm(a.lat, a.lng, b.lat, b.lng);
        totalStraightKm += segStraight;
        const segRoad = roadDetails?.segmentKms?.[i];
        msg += `${i + 1}. <b>${escapeHtml(a.name)}</b> ➡️ <b>${escapeHtml(b.name)}</b>\n`;
        msg += `   📐 Tekis: ${segStraight.toFixed(2)} km`;
        if (segRoad !== undefined) {
          msg += ` | 🚗 Yo'l: ${segRoad.toFixed(2)} km`;
        }
        msg += `\n`;
      }
      msg += `\n📐 <b>Jami tekis masofa:</b> ${formatDistanceLabel(totalStraightKm)}\n`;
      if (roadDetails) {
        msg += `🚗 <b>Jami mashina yo'li:</b> ${formatDistanceLabel(roadDetails.totalDistKm)}\n`;
        msg += `⏱ <b>Jami vaqt:</b> ~${Math.max(1, Math.round(roadDetails.totalDurationMin))} daqiqa`;
      }
    }

    const buttons: any[][] = [
      [
        { text: '🚗 Yandex Navigatsiya', url: buildYandexNavUrl(locs) },
        { text: '🗺 Google Maps', url: buildGoogleNavUrl(locs) }
      ]
    ];

    await ctx.reply(msg, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons }
    });
  }

  const showStat = async (ctx: any) => {
    try {
      const waitMsg = await ctx.reply('📊 Statistika yuklanmoqda...');
      const allDocs = await getAllLocations(true);
      const total = allDocs.length;
      const maktablar = allDocs.filter((d) => d.type === 'maktab').length;
      const bogchalar = allDocs.filter((d) => d.type === 'dmtt' || d.type === 'bogcha').length;
      const boshqa = total - maktablar - bogchalar;

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

      await ctx.reply(
        `📊 <b>Bulung'ur MMTB Bazasi holati:</b>\n\n` +
          `📍 Jami ob'ektlar soni: <b>${total} ta</b>\n` +
          `🏫 Maktablar: <b>${maktablar} ta</b>\n` +
          `🧒 Bog'chalar (DMTT): <b>${bogchalar} ta</b>\n` +
          `🏢 Boshqa muassasalar: <b>${boshqa} ta</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: getMainMenu()
        }
      );
    } catch (error) {
      console.error('Bot stat error:', error);
      ctx.reply("❌ Statistikani olishda xatolik yuz berdi.");
    }
  };

  const showHelp = (ctx: any) => {
    ctx.reply(
      `📖 <b>Bulung'ur MMTB bot qo'llanmasi:</b>\n\n` +
        `1️⃣ <b>Tez qidiruv:</b> Raqam yoki nom yozing.\n` +
        `<i>Masalan:</i> <code>15</code>, <code>9 bog'cha</code>, <code>Sohibkor</code>\n\n` +
        `2️⃣ <b>Ikki joy orasidagi masofa (tekis va mashina yo'li):</b>\n` +
        `<i>Masalan:</i> <code>4-maktab bilan 9-bog'cha orasidagi masofa qancha?</code>\n` +
        `yoki <code>12-maktabdan 3-bog'chagacha</code>\n\n` +
        `3️⃣ <b>Eng yaqin muassasani topish:</b>\n` +
        `Pastdagi <b>📍 Eng yaqin maktab/bog'cha</b> tugmasini bosing yoki Telegramdan joylashuv yuboring.`,
      {
        parse_mode: 'HTML',
        reply_markup: getMainMenu()
      }
    );
  };

  bot.start((ctx) => {
    ctx.reply(
      `👋 <b>Bulung'ur MMTB Logistika va Xarita botiga xush kelibsiz!</b>\n\n` +
        `Men sizga yo'lda ham tezda maktab/bog'cha topish, ikki nuqta orasidagi <b>tekis</b> va <b>mashina yo'li</b> masofasini hisoblashda yordam beraman.\n\n` +
        `📌 <b>Namuna so'rovlar:</b>\n` +
        `• <code>9 bog'cha</code>\n` +
        `• <code>4-maktab bilan 15-maktab orasi qancha?</code>\n` +
        `• Yoki <b>📍 Eng yaqin maktab/bog'cha</b> tugmasini bosing.`,
      {
        parse_mode: 'HTML',
        reply_markup: getMainMenu()
      }
    );
  });

  bot.command('stat', showStat);
  bot.command('help', showHelp);

  bot.command(['route', 'marshrut'], async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 2) {
        return ctx.reply(
          "📍 <b>Marshrutni ko'rish:</b>\n<code>/route MarshrutID</code> ko'rinishida yozing.",
          { parse_mode: 'HTML' }
        );
      }

      const routeId = parts[1].trim();
      const routeSnap = await getDoc(doc(db, 'routes', routeId));
      if (!routeSnap.exists()) {
        return ctx.reply(`❌ "${escapeHtml(routeId)}" kodli marshrut topilmadi.`, { parse_mode: 'HTML' });
      }

      const routeData = routeSnap.data() as any;
      const locs: BotLocation[] = routeData.locations || [];
      let msg = `🚚 <b>BULUNG'UR MMTB MARSHRUTI: ${escapeHtml(routeData.name || 'Marshrut')}</b>\n`;
      msg += `🔢 Manzillar soni: <b>${locs.length} ta</b>\n\n`;
      locs.forEach((loc, idx) => {
        msg += `<b>${idx + 1}. ${escapeHtml(loc.name)}</b>\n`;
        if (loc.mahalla) msg += `   🏛 MFY: ${escapeHtml(loc.mahalla)}\n`;
        if (loc.landmark) msg += `   📍 Mo'ljal: ${escapeHtml(loc.landmark)}\n`;
      });

      const buttons: any[][] = [];
      if (locs.length > 0) {
        buttons.push([
          { text: '🚗 Yandex Navigatsiya', url: buildYandexNavUrl(locs) },
          { text: '🗺 Google Maps', url: buildGoogleNavUrl(locs) }
        ]);
      }
      if (hasHttpsWebApp) {
        buttons.push([{ text: "🗺 To'liq xaritada ko'rish", web_app: { url: appUrl } }]);
      }

      await ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
      });
    } catch (err) {
      console.error('Bot route cmd error:', err);
      ctx.reply("❌ Marshrut ma'lumotlarini yuklashda xatolik yuz berdi.");
    }
  });

  bot.command('report', (ctx) => {
    ctx.reply(
      "📸 Muassasaga yetib borganingizdan so'ng holatni rasmga tushirib botga yuboring. Hisobot bazaga saqlanadi."
    );
  });

  bot.on('photo', async (ctx) => {
    try {
      const photos = ctx.message.photo;
      const largestPhoto = photos[photos.length - 1];
      const sender = ctx.message.from;

      await addDoc(collection(db, 'reports'), {
        userId: sender.id,
        userFullname: `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || sender.username || "Noma'lum",
        username: sender.username || '',
        photoFileId: largestPhoto.file_id,
        photoWidth: largestPhoto.width,
        photoHeight: largestPhoto.height,
        createdAt: new Date().toISOString(),
        caption: ctx.message.caption || ''
      });

      ctx.reply('✅ Rahmat! Foto-hisobotingiz muvaffaqiyatli qabul qilindi.');
    } catch (error) {
      console.error('Bot photo report error:', error);
      ctx.reply('⚠️ Hisobotni bazaga yozishda xatolik yuz berdi.');
    }
  });

  // Nearby handler when user sends GPS location
  bot.on('location', async (ctx) => {
    try {
      const { latitude, longitude } = ctx.message.location;
      const allLocations = await getAllLocations();
      if (allLocations.length === 0) {
        return ctx.reply('❌ Bazada hali muassasalar mavjud emas.');
      }

      const nearest = [...allLocations]
        .map((loc) => ({
          loc,
          straightKm: haversineDistanceKm(latitude, longitude, loc.lat, loc.lng)
        }))
        .sort((a, b) => a.straightKm - b.straightKm)
        .slice(0, 5);

      const first = nearest[0];
      const originFake: BotLocation = {
        id: 'user_gps',
        name: 'Joylashuvim',
        type: 'boshqa',
        lat: latitude,
        lng: longitude
      };
      const roadToFirst = await getDrivingRouteOSRM([originFake, first.loc], db);

      let msg = `📍 <b>Sizga eng yaqin 5 ta muassasa:</b>\n\n`;
      nearest.forEach((item, idx) => {
        msg += `${idx + 1}. <b>${escapeHtml(item.loc.name)}</b> — 📐 ${item.straightKm.toFixed(2)} km`;
        if (idx === 0 && roadToFirst) {
          msg += ` (🚗 yo'l: ${roadToFirst.totalDistKm.toFixed(2)} km, ~${Math.max(1, Math.round(roadToFirst.totalDurationMin))} daq)`;
        }
        if (item.loc.mahalla) msg += ` • <i>${escapeHtml(item.loc.mahalla)}</i>`;
        msg += `\n`;
      });

      const inlineButtons: any[][] = [
        [
          { text: `🚗 Yandex: ${first.loc.name}`, url: `https://yandex.uz/maps/?rtext=${latitude},${longitude}~${first.loc.lat},${first.loc.lng}&rtt=auto` },
          { text: `🗺 Google: ${first.loc.name}`, url: `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${first.loc.lat},${first.loc.lng}&travelmode=driving&dir_action=navigate` }
        ]
      ];
      nearest.slice(1).forEach((item) => {
        inlineButtons.push([
          { text: `📍 ${item.loc.name} (${item.straightKm.toFixed(1)} km)`, callback_data: `pick_loc_${item.loc.id}` }
        ]);
      });

      await ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: inlineButtons }
      });
    } catch (err) {
      console.error('Bot location error:', err);
      ctx.reply("❌ Eng yaqin muassasalarni hisoblashda xatolik yuz berdi.");
    }
  });

  // Callback button handlers
  bot.action(/^pick_loc_(.+)$/, async (ctx) => {
    try {
      const locId = ctx.match[1];
      const all = await getAllLocations();
      const found = all.find((l) => l.id === locId);
      await ctx.answerCbQuery();
      if (found) {
        await replySingleLocation(ctx, found);
      } else {
        await ctx.reply("❌ Muassasa topilmadi.");
      }
    } catch (err) {
      console.error('Bot pick_loc error:', err);
    }
  });

  bot.action(/^show_loc_(.+)$/, async (ctx) => {
    try {
      const parts = ctx.match[1].split('_');
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      await ctx.answerCbQuery('Koordinata yuklanmoqda...');
      await ctx.replyWithLocation(lat, lng);
    } catch {
      await ctx.answerCbQuery("Koordinatni yuborib bo'lmadi");
    }
  });

  // Text query handler: deterministic distance + fuzzy search first, optional AI for general conversation
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const userText = ctx.message.text.trim();
    if (userText === '📊 Tuman statistikasi') return showStat(ctx);
    if (userText === "ℹ️ Qo'llanma / Yordam") return showHelp(ctx);

    ctx.telegram.sendChatAction(ctx.chat.id, 'typing').catch(() => {});

    try {
      const allLocations = await getAllLocations();
      if (allLocations.length === 0) {
        return ctx.reply("❌ Bazada muassasalar topilmadi.");
      }

      // 1. Check multi-location / distance query deterministically
      const multiMatched = extractMultipleLocations(userText, allLocations);
      const asksDistance = isDistanceIntent(userText);

      if (multiMatched.length >= 2) {
        return await replyMultiLocationDistance(ctx, multiMatched);
      }

      // 2. Single search query
      const matches = searchSingleQuery(allLocations, userText);
      if (matches.length === 1) {
        return await replySingleLocation(ctx, matches[0]);
      }

      if (matches.length === 2 && asksDistance) {
        return await replyMultiLocationDistance(ctx, matches);
      }

      if (matches.length > 1) {
        let listMessage = `🔍 So'rovingiz bo'yicha <b>${matches.length} ta</b> mos muassasa topildi:\n\n`;
        const subset = matches.slice(0, 8);
        const buttons: any[][] = [];

        subset.forEach((loc, idx) => {
          listMessage += `${idx + 1}. <b>${escapeHtml(loc.name)}</b>`;
          if (loc.mahalla) listMessage += ` — <i>${escapeHtml(loc.mahalla)}</i>`;
          listMessage += `\n`;
          buttons.push([{ text: `📍 ${loc.name}`, callback_data: `pick_loc_${loc.id}` }]);
        });

        return await ctx.reply(listMessage, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons }
        });
      }

      // 3. Optional AI conversational fallback if configured
      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Siz Bulung'ur tumani MMTB logistika botisiz. Foydalanuvchi yozdi: "${userText}". Qisqa, muloyim o'zbek tilida javob bering va agar muassasa izlayotgan bo'lsa raqamini yoki nomini yozishini so'rang (masalan: "9 bog'cha" yoki "4-maktab bilan 9-bog'cha orasidagi masofa").`
          });
          if (response.text) {
            return await ctx.reply(response.text, { reply_markup: getMainMenu() });
          }
        } catch (aiErr) {
          console.error('Bot optional AI fallback error:', aiErr);
        }
      }

      await ctx.reply(
        `❌ "<b>${escapeHtml(userText)}</b>" bo'yicha muassasa topilmadi.\n\n` +
          `💡 <b>Maslahat:</b> Faqat raqam yoki nom yozing (masalan: <code>15</code>, <code>9 bog'cha</code>) yoki ikki joy orasidagi masofa uchun: <code>4-maktab va 9-bog'cha orasi</code> deb yozing.`,
        {
          parse_mode: 'HTML',
          reply_markup: getMainMenu()
        }
      );
    } catch (err) {
      console.error('Bot text handler error:', err);
      await ctx.reply("❌ So'rovni qayta ishlashda xatolik yuz berdi. Birozdan so'ng urinib ko'ring.");
    }
  });

  bot
    .launch({ dropPendingUpdates: true })
    .then(() => {
      console.log('✅ Telegram Bot server ichida muvaffaqiyatli ishga tushdi!');
    })
    .catch((err) => {
      console.error('❌ Telegram Bot launch xatoligi:', err?.message || err);
      activeBot = null;
    });

  return { started: true };
}

export function stopTelegramBot() {
  if (activeBot) {
    try {
      activeBot.stop('SERVER_STOP');
    } catch {
      // ignore
    }
    activeBot = null;
  }
}
