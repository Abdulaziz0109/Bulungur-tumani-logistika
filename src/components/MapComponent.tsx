import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, GeoJSON, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { seedLocations } from '../data/seedLocations';
import { Trash2, Route, Navigation, MapPin, Fuel, Clock, Map as MapIcon, Activity, Plus, X, MousePointer2, Printer, Shield, LogOut, Settings2, Layers, Search, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const createDivIcon = (type: string, name: string) => {
  let bgColor = '#64748b'; // slate
  if (type === 'maktab') bgColor = '#2563eb'; // blue
  else if (type === 'bogcha' || type === 'dmtt') bgColor = '#ef4444'; // red-500
  else if (type === 'boshqa') bgColor = '#059669'; // emerald

  const numMatch = name.match(/\d+/);
  const label = numMatch ? numMatch[0] : name.charAt(0).toUpperCase();

  return new L.DivIcon({
    className: 'bg-transparent border-0',
    html: `<div style="background-color: ${bgColor}; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bolder; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size: 14px; font-family: ui-sans-serif, system-ui, sans-serif; position: relative;">
            ${label}
            <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid ${bgColor};"></div>
          </div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -40]
  });
};

interface Location {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
}

function Toggle({ label, checked, onChange, color = "bg-blue-600" }: { label: string, checked: boolean, onChange: (v: boolean) => void, color?: string }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group py-1">
      <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{label}</span>
      <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${checked ? color : 'bg-slate-200'}`}>
        <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm ${checked ? 'left-[calc(100%-1.25rem)]' : 'left-1'}`}></div>
      </div>
    </label>
  );
}

export default function MapComponent() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [routeStats, setRouteStats] = useState<{distance: number, duration: number} | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [districtBoundary, setDistrictBoundary] = useState<any>(null);

  // States for Adding New Location
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newLocType, setNewLocType] = useState('maktab');
  const [newLocLat, setNewLocLat] = useState<number | ''>('');
  const [newLocLng, setNewLocLng] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);

  // Settings & Filters
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [filters, setFilters] = useState({ schools: true, kindergartens: true, others: true });
  const [layers, setLayers] = useState({ district: true, neighborhoods: false, highways: false });
  const [highwaysData, setHighwaysData] = useState<any>(null);
  const [isLoadingHighways, setIsLoadingHighways] = useState(false);

  const mapRef = useRef<L.Map>(null);
  const markerRefs = useRef<{[key: string]: L.Marker | null}>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const { role, currentUser } = useAuth();
  const navigate = useNavigate();

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (q.trim().length > 0) {
      const res = filteredLocations.filter(l => l.name.toLowerCase().includes(q.toLowerCase()));
      setSearchResults(res.slice(0, 6));
    } else {
      setSearchResults([]);
    }
  };

  const handleSearchSelect = (loc: Location) => {
    if (mapRef.current) {
      mapRef.current.flyTo([loc.lat, loc.lng], 16, { duration: 1.5 });
    }
    setTimeout(() => {
      if (markerRefs.current[loc.id]) {
         markerRefs.current[loc.id]!.openPopup();
      }
    }, 1500);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchFocused(false);
  };

  // Boshlang'ich nuqta (Default center - masalan, MMTB hududi)
  const center: [number, number] = [39.7, 67.35];

  // Component to handle map clicks for picking coordinates
  function LocationPicker() {
    useMapEvents({
      click(e) {
        if (isPickingLocation) {
          setNewLocLat(parseFloat(e.latlng.lat.toFixed(6)));
          setNewLocLng(parseFloat(e.latlng.lng.toFixed(6)));
          setIsPickingLocation(false);
          setIsAddModalOpen(true); // Re-open modal after picking
        }
      }
    });

    // Helper marker when picking
    if (newLocLat !== '' && newLocLng !== '') {
      return (
         <Marker position={[newLocLat as number, newLocLng as number]} icon={createDivIcon('boshqa', '?')}>
           <Popup>Tanlangan manzil</Popup>
         </Marker>
      );
    }
    return null;
  }

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'admin') return;
    if (!newLocName.trim() || !newLocType || newLocLat === '' || newLocLng === '') {
      showToast("Barcha maydonlarni to'ldiring", "error");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'locations'), {
        name: newLocName.trim(),
        type: newLocType,
        lat: Number(newLocLat),
        lng: Number(newLocLng),
      });
      
      setNewLocName('');
      setNewLocType('maktab');
      setNewLocLat('');
      setNewLocLng('');
      setIsAddModalOpen(false);
      
      fetchLocations();
      showToast("Muvaffaqiyatli qo'shildi!", "success");
    } catch (error) {
      console.error("Xatolik:", error);
      showToast("Xatolik yuz berdi!", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLocation = async (id: string | undefined) => {
    if (role !== 'admin') return;
    if (!id) return;
    if (window.confirm("Haqiqatan ham bu ob'ektni o'chirmoqchimisiz?")) {
      try {
        await deleteDoc(doc(db, 'locations', id));
        fetchLocations();
        showToast("Muvaffaqiyatli o'chirildi!", "success");
        // Remove from selected route if exists
        setSelectedLocations(prev => prev.filter(loc => loc.id !== id));
      } catch (error) {
        console.error("Xatolik o'chirishda:", error);
        showToast("O'chirishda xatolik yuz berdi!", "error");
      }
    }
  };

  useEffect(() => {
    fetchLocations();
    fetchBoundary();
  }, []);

  useEffect(() => {
    if (layers.highways && !highwaysData) {
      const fetchHighways = async () => {
        setIsLoadingHighways(true);
        try {
          const bbox = "39.50,67.05,39.95,67.65"; 
          const query = `[out:json][timeout:25];way[highway~"^(primary|secondary|trunk|motorway)$"](${bbox});out geom;`;
          const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
          const data = await res.json();
          const features = data.elements.map((el: any) => ({
            type: "Feature",
            properties: { id: el.id, highway: el.tags?.highway },
            geometry: { type: "LineString", coordinates: el.geometry.map((g: any) => [g.lon, g.lat]) }
          }));
          setHighwaysData({ type: "FeatureCollection", features });
        } catch (err) {
          console.error("Highways fetch error:", err);
        } finally {
          setIsLoadingHighways(false);
        }
      };
      fetchHighways();
    }
  }, [layers.highways]);

  const fetchBoundary = async () => {
    try {
      const res = await fetch('https://nominatim.openstreetmap.org/search?q=Bulungur+district,+Samarqand+Region,+Uzbekistan&polygon_geojson=1&format=json');
      const data = await res.json();
      if (data && data.length > 0 && data[0].geojson) {
        setDistrictBoundary(data[0].geojson);
      }
    } catch (err) {
      console.error('Error fetching boundary:', err);
    }
  };

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'locations'));
      
      let locs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Location[];

      // Tizimda obyektlar bo'lmasa, dastlabki (seed) ma'lumotlarni ko'rsatamiz
      if (locs.length === 0) {
         console.log("Bazada ma'lumot yo'q. Lokal ma'lumotlar yuklanmoqda...");
         locs = seedLocations
           .filter(loc => loc.lat !== null && loc.lng !== null)
           .map((loc, idx) => ({
             id: `seed-${idx}`,
             name: loc.name,
             type: loc.type,
             lat: loc.lat as number,
             lng: loc.lng as number,
           }));
      }

      setLocations(locs);
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLocations = locations.filter(loc => {
    if (loc.type === 'maktab' && !filters.schools) return false;
    if ((loc.type === 'dmtt' || loc.type === 'bogcha') && !filters.kindergartens) return false;
    if (loc.type !== 'maktab' && loc.type !== 'dmtt' && loc.type !== 'bogcha' && !filters.others) return false;
    return true;
  });

  const handleMarkerClick = (loc: Location) => {
    if (!selectedLocations.find(l => l.id === loc.id)) {
      setSelectedLocations([...selectedLocations, loc]);
      setRouteGeometry(null);
      setRouteStats(null);
    }
  };

  const removeLocation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedLocations(selectedLocations.filter(l => l.id !== id));
    setRouteGeometry(null);
    setRouteStats(null);
  };

  const calculateRoute = async () => {
    if (selectedLocations.length < 2) return;
    setIsCalculating(true);
    try {
      const coords = selectedLocations.map(l => `${l.lng},${l.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const routeCoords = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
        setRouteGeometry(routeCoords);
        setRouteStats({
          distance: route.distance, 
          duration: route.duration  
        });
      }
    } catch (err) {
      console.error('Route calculation failed:', err);
    } finally {
      setIsCalculating(false);
    }
  };

  const calculateOptimizedRoute = async () => {
    if (selectedLocations.length < 2) return;
    setIsCalculating(true);
    try {
      const coordsStr = selectedLocations.map(loc => `${loc.lng},${loc.lat}`).join(';');
      const res = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coordsStr}?roundtrip=false&source=first&overview=full&geometries=geojson`);
      const data = await res.json();
      
      if (data.code === 'Ok' && data.trips && data.trips.length > 0) {
        const trip = data.trips[0];
        const routeCoords = trip.geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
        setRouteGeometry(routeCoords);
        
        setRouteStats({
          distance: parseFloat((trip.distance / 1000).toFixed(2)),
          duration: Math.ceil(trip.duration / 60)
        });

        if (data.waypoints) {
          const reordered = new Array(selectedLocations.length);
          data.waypoints.forEach((wp: any, i: number) => {
            reordered[wp.waypoint_index] = selectedLocations[i];
          });
          setSelectedLocations(reordered);
        }
      } else {
        showToast("Optimallashtirilgan yo'nalish topilmadi", "error");
      }
    } catch (error) {
       console.error("TSP Xatolik:", error);
       showToast("Xatolik yuz berdi", "error");
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="w-full h-full relative font-sans text-slate-900 bg-[#f8fafc] overflow-hidden">
      
      {/* Header Panel */}
      <div className="print:hidden absolute top-6 left-6 z-[400] bg-white/95 backdrop-blur-md px-5 py-3 rounded-2xl shadow-xl border border-slate-100 flex items-center space-x-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <MapIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800 leading-tight">
              MMTB Logistika
            </h1>
            <div className="flex items-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">
               <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></span>
               {currentUser ? (role === 'admin' ? 'Boshqaruvchi' : 'Iqtisodchi') : 'Mehmon'}
            </div>
          </div>
        </div>
        <div className="w-px h-8 bg-slate-200 mx-2"></div>
        <div className="flex items-center space-x-2">
          {!currentUser ? (
            <button 
              onClick={() => navigate('/login')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all font-sans"
            >
              Tizimga kirish
            </button>
          ) : (
            <>
              {role === 'admin' && (
                <button 
                  onClick={() => navigate('/admin')}
                  className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-colors flex items-center space-x-1"
                >
                  <Shield className="w-4 h-4" />
                  <span>Boshqaruv Paneli</span>
                </button>
              )}
              <button 
                onClick={() => auth.signOut()}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-colors flex items-center space-x-1"
                title="Tizimdan chiqish"
              >
                 <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="print:hidden absolute top-6 left-1/2 transform -translate-x-1/2 z-[500] w-full max-w-[20rem] sm:max-w-md transition-all">
        <div className={`relative bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-100 flex items-center px-4 py-3 transition-colors ${isSearchFocused ? 'ring-4 ring-blue-500/20 border-blue-500' : ''}`}>
           <Search className="w-5 h-5 text-slate-400 mr-3" />
           <input 
             type="text" 
             placeholder="Maktab yoki bog'cha qidiring..." 
             className="w-full bg-transparent outline-none text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
             value={searchQuery}
             onChange={(e) => handleSearch(e.target.value)}
             onFocus={() => setIsSearchFocused(true)}
             onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
           />
           {searchQuery && (
              <button onMouseDown={(e) => { e.preventDefault(); setSearchQuery(''); setSearchResults([]);}} className="p-1 text-slate-400 hover:bg-slate-100 rounded-full"><X className="w-4 h-4"/></button>
           )}
        </div>
        {isSearchFocused && searchResults.length > 0 && (
          <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-2">
            {searchResults.map(res => (
              <button 
                key={res.id} 
                onMouseDown={(e) => { e.preventDefault(); handleSearchSelect(res); }}
                className="w-full text-left px-5 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex flex-col"
              >
                <span className="font-bold text-slate-800 text-sm">{res.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-0.5">{res.type === 'dmtt' ? "Bog'cha" : res.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`print:hidden absolute bottom-24 left-6 z-[600] px-6 py-3 rounded-xl text-sm font-bold shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4 ${toastMessage.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {toastMessage.text}
        </div>
      )}

      {/* Picking Mode Overlay */}
      {isPickingLocation && (
        <div className="print:hidden absolute top-6 left-1/2 transform -translate-x-1/2 z-[400] bg-slate-900 text-white px-6 py-3 rounded-full flex items-center space-x-3 shadow-2xl hover:bg-slate-800 transition-colors">
          <MousePointer2 className="w-5 h-5 text-blue-400 animate-pulse" />
          <span className="font-semibold text-sm">Xaritadan joylashuvni chertib tanlang...</span>
          <div className="w-px h-4 bg-slate-700 mx-1"></div>
          <button onClick={() => { setIsPickingLocation(false); setIsAddModalOpen(true); }} className="text-xs text-slate-300 hover:text-white font-bold transition-colors">
            Bekor qilish
          </button>
        </div>
      )}

      {/* Add Location Button */}
      {!isPickingLocation && role === 'admin' && (
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="print:hidden absolute top-24 left-6 z-[400] bg-white/95 backdrop-blur-md hover:bg-white text-slate-800 pr-5 pl-2 py-2 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 flex items-center space-x-3 transition-all hover:scale-105 active:scale-95 group"
        >
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <Plus className="w-4 h-4 text-blue-600" />
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-700 group-hover:text-slate-900">Yangi ob'ekt</span>
        </button>
      )}

      {/* Modal - Add Location */}
      {isAddModalOpen && role === 'admin' && (
        <div className="absolute inset-0 z-[500] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Yangi ob'ekt qo'shish</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddLocation} className="p-6 space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Nomi</label>
                <input 
                  type="text" 
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="Masalan: 12-maktab" 
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Turi</label>
                <select 
                  value={newLocType}
                  onChange={(e) => setNewLocType(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm font-semibold text-slate-900 cursor-pointer"
                >
                  <option value="maktab">Maktab (Umumiy ta'lim)</option>
                  <option value="dmtt">Bog'cha (DMTT)</option>
                  <option value="boshqa">Boshqa (Hokimiyat, va h.k.)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Kenglik (Lat)</label>
                  <input 
                    type="number" step="any"
                    value={newLocLat}
                    onChange={(e) => setNewLocLat(parseFloat(e.target.value))}
                    disabled
                    placeholder="..." 
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 outline-none text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Uzunlik (Lng)</label>
                  <input 
                    type="number" step="any"
                    value={newLocLng}
                    onChange={(e) => setNewLocLng(parseFloat(e.target.value))}
                    disabled
                    placeholder="..." 
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 outline-none text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <button 
                type="button"
                onClick={() => { setIsAddModalOpen(false); setIsPickingLocation(true); }}
                className="w-full py-3 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-sm rounded-xl border border-blue-100 transition-colors flex justify-center items-center space-x-2"
              >
                <MapPin className="w-4 h-4" />
                <span>Xaritadan tanlash</span>
              </button>

              <div className="pt-4 border-t border-slate-100 mt-2">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full relative py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-[0_4px_14px_0_rgb(0,0,0,0.39)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.23)] hover:shadow-slate-900/40 transition-all active:scale-95 disabled:opacity-70 disabled:shadow-none flex items-center justify-center overflow-hidden"
                >
                  {isSubmitting ? (
                    <span className="flex items-center">
                       <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                       Saqlanmoqda
                    </span>
                  ) : (
                    "Saqlash"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="absolute inset-0 z-[600] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center">
                  <Settings2 className="w-5 h-5 mr-2 text-indigo-600"/> 
                  Sozlamalar
                </h2>
                <button onClick={() => setIsSettingsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
             </div>
             <div className="p-6 space-y-6">
                {/* Filters */}
                <div>
                   <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center"><Layers className="w-3 h-3 mr-1.5"/> Ob'ektlarni ko'rsatish</h3>
                   <div className="space-y-2">
                      <Toggle label="Maktablar" checked={filters.schools} onChange={(v) => setFilters({...filters, schools: v})} color="bg-blue-600" />
                      <Toggle label="Maktabgacha ta'lim (Bog'cha)" checked={filters.kindergartens} onChange={(v) => setFilters({...filters, kindergartens: v})} color="bg-rose-600" />
                      <Toggle label="Boshqa tashkilotlar" checked={filters.others} onChange={(v) => setFilters({...filters, others: v})} color="bg-emerald-600" />
                   </div>
                </div>
                
                <div className="w-full h-px bg-slate-100"></div>
     
                {/* Layers */}
                <div>
                   <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center"><MapIcon className="w-3 h-3 mr-1.5"/> Xarita qatlamlari</h3>
                   <div className="space-y-2">
                      <Toggle label="Tuman chegarasi (GeoJSON)" checked={layers.district} onChange={(v) => setLayers({...layers, district: v})} color="bg-indigo-600" />
                      <Toggle label="Mahallalar chegarasi" checked={layers.neighborhoods} onChange={(v) => setLayers({...layers, neighborhoods: v})} color="bg-indigo-600" />
                      <div className="flex items-center justify-between">
                         <Toggle label="Katta yo'llar (Highways)" checked={layers.highways} onChange={(v) => setLayers({...layers, highways: v})} color="bg-amber-500" />
                         {isLoadingHighways && <span className="text-[10px] text-amber-500 font-bold ml-2 animate-pulse">Yuklanmoqda...</span>}
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      <MapContainer 
        center={center} 
        zoom={12} 
        className="w-full h-screen z-0"
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {filteredLocations.map((loc) => (
          <Marker 
            key={loc.id} 
            position={[loc.lat, loc.lng]} 
            icon={createDivIcon(loc.type, loc.name)}
            eventHandlers={{ click: () => handleMarkerClick(loc) }}
            ref={(el) => { markerRefs.current[loc.id] = el; }}
          >
            <Popup>
              <div className="font-sans">
                <h3 className="font-bold text-lg">{loc.name}</h3>
                <p className="text-sm text-gray-600 capitalize">Turi: {loc.type === 'dmtt' ? "Maktabgacha ta'lim" : loc.type}</p>
                <button 
                  onClick={() => handleMarkerClick(loc)}
                  className="print:hidden mt-2 w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  Marshrutga qo'shish
                </button>
                {role === 'admin' && (
                  <button 
                    onClick={() => handleDeleteLocation(loc.id)}
                    className="print:hidden mt-2 w-full px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold rounded-lg transition-colors"
                  >
                    O'chirish
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        {layers.district && districtBoundary && (
          <GeoJSON 
            data={districtBoundary} 
            style={{ color: '#1e40af', weight: 3, fillColor: '#1e40af', fillOpacity: 0.05 }} 
          />
        )}
        {layers.highways && highwaysData && (
          <GeoJSON 
            data={highwaysData} 
            style={{ color: '#f59e0b', weight: 4, opacity: 0.8 }} 
          />
        )}
        {routeGeometry && (
          <Polyline positions={routeGeometry} color="#3b82f6" weight={6} opacity={0.8} />
        )}
        <LocationPicker />
      </MapContainer>
      
      {/* Floating Settings/Filters Button */}
      <div className="print:hidden absolute bottom-6 left-6 z-[400] pointer-events-auto">
        <button onClick={() => setIsSettingsOpen(true)} className="bg-white/95 backdrop-blur-md px-5 py-3 rounded-3xl shadow-2xl border border-slate-100 flex items-center space-x-2 transition-all hover:scale-105 active:scale-95 text-slate-800">
           <Settings2 className="w-5 h-5 text-indigo-600"/>
           <span className="font-extrabold text-sm tracking-tight text-slate-700">Filtrlar</span>
        </button>
      </div>

      {/* Sidebar: Marshrut va Logistika */}
      <div className="absolute top-6 right-6 bottom-6 z-[400] w-96 flex flex-col gap-4 pointer-events-none">
        
        {/* Selected Locations Panel */}
        <div className="flex-1 pointer-events-auto bg-white/95 backdrop-blur-md p-6 rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-xl text-slate-900 tracking-tight">Marshrut</h2>
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Route className="w-4 h-4" />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-200">
            {selectedLocations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <MapPin className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">Xaritadan manzillarni tanlang</p>
              </div>
            ) : (
              selectedLocations.map((loc, idx) => (
                <div key={loc.id} className="flex items-center space-x-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm relative group">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">{loc.name}</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">{loc.type === 'dmtt' ? "Bog'cha" : loc.type}</div>
                  </div>
                  <button 
                    onClick={(e) => removeLocation(e, loc.id)}
                    className="print:hidden p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="print:hidden pt-4 border-t border-slate-100 mt-4 space-y-3">
            <button 
              className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all ${
                selectedLocations.length < 2 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-white shadow-lg active:scale-95'
              }`}
              onClick={calculateRoute}
              disabled={selectedLocations.length < 2 || isCalculating}
            >
               {isCalculating ? (
                <span className="flex items-center">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Hisoblanmoqda...
                </span>
              ) : (
                <span className="flex items-center space-x-2">
                  <Navigation className="w-4 h-4" />
                  <span>Marshrutni hisoblash</span>
                </span>
              )}
            </button>

            <button 
              className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all border ${
                selectedLocations.length < 3 
                  ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' 
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 shadow-md active:scale-95'
              }`}
              onClick={calculateOptimizedRoute}
              disabled={selectedLocations.length < 3 || isCalculating}
              title="Eng qisqa, optimal ketma-ketlikni avtomatik topish (TSP)"
            >
              <Sparkles className="w-5 h-5" />
              <span>Aqlli Optimizatsiya (TSP)</span>
            </button>
          </div>
        </div>

        {/* Economist / Analytics Panel */}
        {routeStats && (
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md p-6 rounded-3xl shadow-2xl border border-slate-100 shrink-0 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Activity className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-md text-slate-900 tracking-tight">Iqtisodchi Paneli</h3>
              </div>
              <button 
                onClick={() => window.print()}
                className="print:hidden w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors"
                title="Hisobotni chop etish"
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl">
                <div className="flex items-center space-x-1.5 mb-1 text-blue-600">
                  <MapIcon className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Masofa</span>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {(routeStats.distance / 1000).toFixed(1)} <span className="text-sm font-semibold text-slate-500">km</span>
                </div>
              </div>
              <div className="p-3 bg-orange-50 border border-orange-100 rounded-2xl">
                <div className="flex items-center space-x-1.5 mb-1 text-orange-600">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Vaqt</span>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {Math.round(routeStats.duration / 60)} <span className="text-sm font-semibold text-slate-500">min</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-900 text-white rounded-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
              <div className="flex justify-between items-end relative z-10">
                <div>
                  <div className="flex items-center space-x-2 mb-1.5 text-slate-400">
                    <Fuel className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Yoqilg'i Sarfi</span>
                  </div>
                  <div className="text-slate-400 text-[10px] leading-tight max-w-[140px]">
                    ZIL/Toza hudud normasi (25L / 100km)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-white">
                    {((routeStats.distance / 1000) / 100 * 25).toFixed(1)}
                  </div>
                  <div className="text-xs font-bold text-indigo-300">litr</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legend Panel (Condensed version) */}
        {!routeStats && (
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md p-5 rounded-3xl shadow-xl border border-slate-100 shrink-0">
            <h4 className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3">Xarita belgilari</h4>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 border border-white shadow-sm"></div>
                <span className="text-xs font-semibold text-slate-700">Maktab</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-500 border border-white shadow-sm"></div>
                <span className="text-xs font-semibold text-slate-700">Bog'cha</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-green-500 border border-white shadow-sm"></div>
                <span className="text-xs font-semibold text-slate-700">Boshqa</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
