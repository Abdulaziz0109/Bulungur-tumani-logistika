import React, { useState, useEffect } from 'react';
import { 
  Navigation, 
  CheckCircle2, 
  MapPin, 
  Clock, 
  Route as RouteIcon, 
  ExternalLink, 
  Volume2, 
  VolumeX, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  Compass, 
  Car, 
  Phone,
  Sparkles,
  Share2
} from 'lucide-react';
import { Location } from '../types';

interface DriverModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: Location[];
  routeStats: any;
  onOpenInAppNavigator?: () => void;
  onOpenTelegramShare?: () => void;
}

export const DriverModeModal: React.FC<DriverModeModalProps> = ({
  isOpen,
  onClose,
  locations,
  routeStats,
  onOpenInAppNavigator,
  onOpenTelegramShare
}) => {
  const [activeStopIndex, setActiveStopIndex] = useState<number>(0);
  const [completedStops, setCompletedStops] = useState<Record<number, boolean>>({});
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);

  useEffect(() => {
    // Reset or ensure bounds
    if (activeStopIndex >= locations.length) {
      setActiveStopIndex(Math.max(0, locations.length - 1));
    }
  }, [locations.length, activeStopIndex]);

  if (!isOpen || locations.length === 0) return null;

  const currentStop = locations[activeStopIndex] || locations[0];
  const isFirst = activeStopIndex === 0;
  const isLast = activeStopIndex === locations.length - 1;

  // Speak announcement using Web Speech API if supported
  const speakStop = (loc: Location, index: number) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const text = `${index + 1}-manzil: ${loc.name}. ${loc.landmark ? "Mo'ljal: " + loc.landmark : ""}`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'uz-UZ';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Audio speech synthesis fallback
    }
  };

  const handleNext = () => {
    setCompletedStops(prev => ({ ...prev, [activeStopIndex]: true }));
    if (!isLast) {
      const nextIdx = activeStopIndex + 1;
      setActiveStopIndex(nextIdx);
      speakStop(locations[nextIdx], nextIdx);
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      const prevIdx = activeStopIndex - 1;
      setActiveStopIndex(prevIdx);
      speakStop(locations[prevIdx], prevIdx);
    }
  };

  const toggleComplete = (idx: number) => {
    setCompletedStops(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // Construct navigator links for individual stop
  const getYandexNaviUrl = (loc: Location) => {
    // yandexnavi deep link works natively on mobile if installed, else fallback to web route
    return `https://yandex.uz/maps/?rtext=~${loc.lat},${loc.lng}`;
  };

  const getGoogleNaviUrl = (loc: Location) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
  };

  const getAppleMapsUrl = (loc: Location) => {
    return `https://maps.apple.com/?daddr=${loc.lat},${loc.lng}`;
  };

  // Whole route URLs
  const getFullYandexRouteUrl = () => {
    const coords = locations.map(l => `${l.lat},${l.lng}`).join('~');
    return `https://yandex.uz/maps/?rtext=${coords}`;
  };

  const getFullGoogleRouteUrl = () => {
    if (locations.length === 0) return '';
    const origin = `${locations[0].lat},${locations[0].lng}`;
    const destination = `${locations[locations.length - 1].lat},${locations.length > 1 ? locations[locations.length - 1].lng : ''}`;
    const waypoints = locations.slice(1, -1).map(l => `${l.lat},${l.lng}`).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}`;
  };

  const completedCount = Object.values(completedStops).filter(Boolean).length;
  const progressPercent = Math.round((completedCount / locations.length) * 100);

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[96vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-black text-base sm:text-lg tracking-tight text-white flex items-center gap-1.5">
                  Haydovchi Rejimi
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-2 py-0.5 rounded-full">
                    GPS Navigatsiya
                  </span>
                </h2>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {locations.length} ta manzil • {completedCount} tasi yetkazildi ({progressPercent}%)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Voice toggle */}
            <button
              type="button"
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              title={voiceEnabled ? "Ovozli ko'rsatgichni o'chirish" : "Ovozli ko'rsatgichni yoqish"}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                voiceEnabled 
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' 
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Telegram Share quick action */}
            {onOpenTelegramShare && (
              <button
                type="button"
                onClick={onOpenTelegramShare}
                className="hidden sm:flex items-center space-x-1.5 px-3 py-2 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="Marshrutni Telegram orqali yuborish"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Telegram</span>
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Yopish"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5 shrink-0">
          <div 
            className="bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Main Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Active Stop Hero Spotlight Card */}
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-850/90 border-2 border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 px-4 py-1.5 bg-amber-500 text-slate-950 font-black text-[10px] sm:text-xs rounded-bl-2xl uppercase tracking-wider flex items-center space-x-1 shadow-md">
              <Compass className="w-3 h-3" />
              <span>Hozirgi mo'ljal: {activeStopIndex + 1} / {locations.length}</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="w-7 h-7 rounded-xl bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center shrink-0">
                    {activeStopIndex + 1}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                    {currentStop.type === 'dmtt' ? "Bog'cha (DMTT)" : currentStop.type === 'maktab' ? "Maktab" : "Muassasa"}
                  </span>
                  {completedStops[activeStopIndex] && (
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Yetkazildi</span>
                    </span>
                  )}
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {currentStop.name}
                </h3>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                  {currentStop.mahalla && (
                    <div className="flex items-center space-x-1 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="font-semibold text-white">{currentStop.mahalla}</span>
                    </div>
                  )}
                  {currentStop.landmark && (
                    <div className="flex items-center space-x-1 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                      <span className="text-amber-400 font-bold">Mo'ljal:</span>
                      <span className="font-medium text-slate-200">{currentStop.landmark}</span>
                    </div>
                  )}
                  {currentStop.cadastre && (
                    <div className="flex items-center space-x-1 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 font-mono text-[11px]">
                      <span className="text-slate-400">Kadastr:</span>
                      <span className="text-slate-200">{currentStop.cadastre}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Navigation Action Grid for Current Stop */}
              <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
                <a
                  href={getYandexNaviUrl(currentStop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs sm:text-sm rounded-2xl flex items-center justify-center space-x-2 shadow-lg shadow-orange-600/30 transition-all active:scale-95 no-underline cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M12.5 2C6.701 2 2 6.701 2 12.5S6.701 23 12.5 23 23 18.299 23 12.5 18.299 2 12.5 2zm1.751 14.125h-1.59l-.49 1.487h-1.3l1.884-5.263h1.492l1.884 5.263h-1.39l-.49-1.487zm-1.325-1.026h1.06l-.53-1.614-.53 1.614z"/>
                  </svg>
                  <span>Yandex Navigatorda ochish</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
                </a>

                <a
                  href={getGoogleNaviUrl(currentStop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs sm:text-sm rounded-2xl flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/30 transition-all active:scale-95 no-underline cursor-pointer"
                >
                  <img src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Google_Maps_icon_%282020%29.svg" className="w-4 h-4 shrink-0" alt="" />
                  <span>Google Maps'da ochish</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
                </a>
              </div>
            </div>

            {/* Stepper controls for Driver */}
            <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={isFirst}
                  onClick={handlePrev}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-xs flex items-center space-x-1 transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Oldingi</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleComplete(activeStopIndex)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer ${
                    completedStops[activeStopIndex]
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{completedStops[activeStopIndex] ? "Yetkazildi deb belgilandi" : "Yetkazildi deb belgilash"}</span>
                </button>
              </div>

              <div className="flex items-center space-x-2">
                {!isLast ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs sm:text-sm flex items-center space-x-1.5 shadow-lg shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>Navbatdagi manzilga o'tish</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCompletedStops(prev => ({ ...prev, [activeStopIndex]: true }));
                      onClose();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm flex items-center space-x-1.5 shadow-lg shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Marshrutni yakunlash</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Whole Route Launchers */}
          <div className="bg-slate-850 p-4 rounded-2xl border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="font-extrabold text-sm text-white flex items-center space-x-2">
                  <RouteIcon className="w-4 h-4 text-amber-400" />
                  <span>Butun marshrutni tashqi ilovada ochish</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Barcha {locations.length} ta nuqtani ketma-ketlikda navigatoringizga yuklang
                </p>
              </div>

              {routeStats && (
                <div className="flex items-center space-x-3 text-xs font-bold text-slate-300 shrink-0">
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>{Math.round(routeStats.duration / 60)} daq</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Navigation className="w-3.5 h-3.5 text-blue-400" />
                    <span>{(routeStats.distance / 1000).toFixed(1)} km</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <a
                href={getFullYandexRouteUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-300 font-bold text-xs flex items-center justify-center space-x-2 transition-all no-underline text-center cursor-pointer"
              >
                <span>Yandex Maps (To'liq)</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <a
                href={getFullGoogleRouteUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 font-bold text-xs flex items-center justify-center space-x-2 transition-all no-underline text-center cursor-pointer"
              >
                <span>Google Maps (To'liq)</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              {onOpenInAppNavigator && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenInAppNavigator();
                  }}
                  className="py-2.5 px-3 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-indigo-400" />
                  <span>O'zimizning Navigator</span>
                </button>
              )}
            </div>
          </div>

          {/* Sequential Stops Checklist */}
          <div>
            <h4 className="font-extrabold text-sm text-slate-300 mb-3 flex items-center justify-between">
              <span>Marshrut Manzillari Ro'yxati</span>
              <span className="text-xs font-normal text-slate-500">Ixtiyoriy manzilni bosing</span>
            </h4>

            <div className="space-y-2">
              {locations.map((loc, idx) => {
                const isActive = idx === activeStopIndex;
                const isDone = !!completedStops[idx];

                return (
                  <div
                    key={loc.id || idx}
                    onClick={() => {
                      setActiveStopIndex(idx);
                      speakStop(loc, idx);
                    }}
                    className={`p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isActive 
                        ? 'bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30' 
                        : isDone
                        ? 'bg-slate-900/60 border-slate-800 text-slate-400 opacity-75'
                        : 'bg-slate-850 hover:bg-slate-800/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        isDone
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isActive
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className={`font-bold text-xs sm:text-sm truncate ${isActive ? 'text-amber-200' : isDone ? 'line-through text-slate-400' : 'text-white'}`}>
                            {loc.name}
                          </span>
                          <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                            {loc.type === 'dmtt' ? "Bog'cha" : loc.type === 'maktab' ? "Maktab" : "Ob'ekt"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 truncate">
                          {loc.mahalla && <span>🏛 {loc.mahalla}</span>}
                          {loc.landmark && <span className="truncate">📍 {loc.landmark}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Quick Single Nav Button */}
                    <div className="flex items-center space-x-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <a
                        href={getYandexNaviUrl(loc)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 transition-colors"
                        title="Yandex Navigatsiyada ochish"
                      >
                        <Navigation className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0 text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px]">Bulung'ur MMTB Haydovchi Yo'riqnomasi</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-all cursor-pointer"
          >
            Yopish
          </button>
        </div>

      </div>
    </div>
  );
};
