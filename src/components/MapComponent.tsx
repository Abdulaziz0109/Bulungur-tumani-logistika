import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, GeoJSON, useMapEvents, Circle, Tooltip, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Papa from 'papaparse';
import { collection, getDocs, addDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Trash2, Route, Navigation, MapPin, Fuel, Clock, Map as MapIcon, Activity, Plus, X, MousePointer2, Printer, Shield, LogOut, Settings2, Layers, Search, Sparkles, UploadCloud, Target, Factory, LocateFixed } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const getShortLabelString = (name: string) => {
  const safeName = name || '?';
  if (safeName.includes("Mening joylashuvim") || safeName.includes("user-gps")) return "📍";
  if (safeName.includes("Xaritadan") || safeName.includes("custom")) return "📌";
  const numMatch = safeName.match(/\d+/);
  return numMatch ? numMatch[0] : safeName.charAt(0).toUpperCase();
};

const createDivIcon = (type: string, name: string) => {
  let bgColor = '#64748b'; // slate
  if (type === 'maktab') bgColor = '#2563eb'; // blue
  else if (type === 'bogcha' || type === 'dmtt') bgColor = '#ef4444'; // red-500
  else if (type === 'boshqa' || type === 'tashkilot') bgColor = '#059669'; // emerald

  const label = getShortLabelString(name);

  return new L.DivIcon({
    className: 'bg-transparent border-0',
    html: `<div style="background-color: ${bgColor}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bolder; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size: 11px; font-family: ui-sans-serif, system-ui, sans-serif; position: relative;">
            ${label}
            <div style="position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 6px solid ${bgColor};"></div>
          </div>`,
    iconSize: [24, 30],
    iconAnchor: [12, 30],
    popupAnchor: [0, -30]
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
    <div 
      className="flex items-center justify-between cursor-pointer group py-1"
      onClick={() => onChange(!checked)}
    >
      <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{label}</span>
      <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${checked ? color : 'bg-slate-200'}`}>
        <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm ${checked ? 'left-[calc(100%-1.25rem)]' : 'left-1'}`}></div>
      </div>
    </div>
  );
}

export default function MapComponent() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [multiRouteGeometries, setMultiRouteGeometries] = useState<{coords: [number, number][], color: string}[] | null>(null);
  const [vehiclesCount, setVehiclesCount] = useState<number>(1);
  const [isRoundtrip, setIsRoundtrip] = useState<boolean>(false);
  const [isStartMyLoc, setIsStartMyLoc] = useState<boolean>(false);
  const [isEndMyLoc, setIsEndMyLoc] = useState<boolean>(false);
  const [sharedStartPoint, setSharedStartPoint] = useState<boolean>(false);
  const [routeStats, setRouteStats] = useState<{distance: number, duration: number} | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [districtBoundary, setDistrictBoundary] = useState<any>(null);

  // Area Boundary Search States
  const [searchAreaQuery, setSearchAreaQuery] = useState('');
  const [isSearchingArea, setIsSearchingArea] = useState(false);
  const [mahallaBoundary, setMahallaBoundary] = useState<any>(null);

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
  const [neighborhoodsData, setNeighborhoodsData] = useState<any>(null);
  const [isLoadingNeighborhoods, setIsLoadingNeighborhoods] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  const mapRef = useRef<L.Map>(null);
  const markerRefs = useRef<{[key: string]: L.Marker | null}>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingCSV, setIsUploadingCSV] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isPickingRoutePoint, setIsPickingRoutePoint] = useState(false);

  // States for Radius Analysis
  const [isRadiusMode, setIsRadiusMode] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [radiusCenter, setRadiusCenter] = useState<[number, number] | null>(null);

  const [optimizedRouteDistance, setOptimizedRouteDistance] = useState<number | null>(null);
  const [hideUnselected, setHideUnselected] = useState(false);

  const { role, currentUser } = useAuth();
  const navigate = useNavigate();

  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in km
  };

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

  const searchAreaBoundary = async () => {
    if (!searchAreaQuery.trim()) return;
    setIsSearchingArea(true);
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchAreaQuery)}&polygon_geojson=1&format=json&countrycodes=uz`);
        const data = await res.json();

        const filteredData = data.filter((item: any) => item.geojson && (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon'));

        if (filteredData.length > 0) {
            const boundaryData = filteredData[0].geojson;
            setMahallaBoundary(boundaryData);
            
            if (mapRef.current) {
                const geojsonObj = L.geoJSON(boundaryData);
                const bounds = geojsonObj.getBounds();
                mapRef.current.fitBounds(bounds, { padding: [50, 50], duration: 1.5 });
            }
            setIsSettingsOpen(false); // Close settings to see the map
            showToast("Hudud chegarasi topildi", "success");
        } else {
            showToast("Bu hududning chegarasi (Polygon) OpenStreetMap bazasida kiritilmagan", "error");
        }
    } catch (err) {
        console.error("Area search error:", err);
        showToast("Xatolik yuz berdi", "error");
    } finally {
        setIsSearchingArea(false);
    }
  };

  // Boshlang'ich nuqta (Default center - masalan, MMTB hududi)
  const center: [number, number] = [39.7, 67.35];

  // Component to handle map clicks for picking coordinates
  function LocationPicker() {
    useMapEvents({
      click(e) {
        if (isPickingRoutePoint) {
           const customLocation: Location = {
             id: `custom-${Date.now()}`,
             name: `📍 Xaritadan belgilangan nuqta`,
             type: 'boshqa',
             lat: parseFloat(e.latlng.lat.toFixed(6)),
             lng: parseFloat(e.latlng.lng.toFixed(6))
           };
           setSelectedLocations(prev => {
             return [...prev, customLocation];
           });
           showToast("Xaritadan nuqta marshrutga qo'shildi!", "success");
           setIsPickingRoutePoint(false);
           return;
        } else if (isPickingLocation && !isRadiusMode) {
          setNewLocLat(parseFloat(e.latlng.lat.toFixed(6)));
          setNewLocLng(parseFloat(e.latlng.lng.toFixed(6)));
          setIsPickingLocation(false);
          if (editingLocation) {
              setIsEditModalOpen(true);
          } else {
              setIsAddModalOpen(true); // Re-open modal after picking
          }
        } else if (isRadiusMode) {
          const lat = e.latlng.lat;
          const lng = e.latlng.lng;
          setRadiusCenter([lat, lng]);
          
          let schools = 0;
          let kindergartens = 0;
          let others = 0;
          
          locations.forEach(loc => {
            const dist = getDistanceFromLatLonInKm(lat, lng, loc.lat, loc.lng);
            if (dist <= radiusKm) {
              if (loc.type === 'maktab') schools++;
              else if (loc.type === 'dmtt' || loc.type === 'bogcha') kindergartens++;
              else others++;
            }
          });
          
          showToast(`${radiusKm} km radiusda: ${schools} ta maktab, ${kindergartens} ta bog'cha${others > 0 ? `, ${others} ta boshqa` : ''} bor`, 'success');
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

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      showToast('Brauzeringizda GPS qo\'llab-quvvatlanmaydi.', 'error');
      return;
    }
    
    // Set a loading toast if needed, or simply let the browser ask for permission
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation([lat, lng]);
        
        if (mapRef.current) {
          mapRef.current.flyTo([lat, lng], 14, { duration: 1.5 });
        }
        
        showToast("📍 Joylashuvingiz aniqlandi.", 'success');
      },
      (error) => {
        console.error("GPS Error:", error);
        if (error.code === error.PERMISSION_DENIED) {
           showToast('Joylashuvni aniqlashga ruxsat berilmadi.', 'error');
        } else {
           showToast('Joylashuvni aniqlashda xatolik yuz berdi.', 'error');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const handleCycleMyLocation = () => {
    if (!isStartMyLoc && !isEndMyLoc) {
       handleToggleStartMyLoc(true);
    } else if (isStartMyLoc && !isEndMyLoc) {
       handleToggleEndMyLoc(true);
    } else {
       handleToggleStartMyLoc(false);
       handleToggleEndMyLoc(false);
    }
  };

  const handleToggleStartMyLoc = (checked: boolean) => {
    if (checked) {
       if (!navigator.geolocation) { showToast("Brauzoringizda GPS yo'q", "error"); return; }
       navigator.geolocation.getCurrentPosition(pos => {
           const loc: Location = { id: 'user-gps-start', name: "📍 Mening joylashuvim (Boshlang'ich)", type: 'boshqa', lat: pos.coords.latitude, lng: pos.coords.longitude };
           setSelectedLocations(prev => [loc, ...prev.filter(l => l.id !== 'user-gps-start')]);
           setIsStartMyLoc(true);
           showToast("Joylashuvingiz marshrut boshiga qo'shildi", "success");
       });
    } else {
       setSelectedLocations(prev => prev.filter(l => l.id !== 'user-gps-start'));
       setIsStartMyLoc(false);
    }
  };

  const handleToggleEndMyLoc = (checked: boolean) => {
    if (checked) {
       if (!navigator.geolocation) { showToast("Brauzoringizda GPS yo'q", "error"); return; }
       navigator.geolocation.getCurrentPosition(pos => {
           const loc: Location = { id: 'user-gps-end', name: "🏁 Mening joylashuvim (Yakuniy)", type: 'boshqa', lat: pos.coords.latitude, lng: pos.coords.longitude };
           setSelectedLocations(prev => [...prev.filter(l => l.id !== 'user-gps-end'), loc]);
           setIsEndMyLoc(true);
           showToast("Joylashuvingiz marshrut oxiriga qo'shildi", "success");
       });
    } else {
       setSelectedLocations(prev => prev.filter(l => l.id !== 'user-gps-end'));
       setIsEndMyLoc(false);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!newLocName.trim() || !newLocType || newLocLat === '' || newLocLng === '') {
      showToast("Barcha maydonlarni to'ldiring", "error");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const locationData = {
        name: newLocName.trim(),
        type: newLocType,
        lat: Number(newLocLat),
        lng: Number(newLocLng),
      };

      if (role === 'admin') {
        await addDoc(collection(db, 'locations'), locationData);
        showToast("Muvaffaqiyatli qo'shildi!", "success");
      } else {
        await addDoc(collection(db, 'requests'), {
          actionType: 'add',
          data: locationData,
          status: 'pending',
          createdBy: currentUser.uid,
          createdAt: new Date().toISOString()
        });
        showToast("Yangi joylashuv taklifi adminga yuborildi!", "success");
      }
      
      setNewLocName('');
      setNewLocType('maktab');
      setNewLocLat('');
      setNewLocLng('');
      setIsAddModalOpen(false);
      
      fetchLocations();
    } catch (error) {
      console.error("Xatolik:", error);
      showToast("Xatolik yuz berdi!", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !editingLocation) return;
    if (!newLocName.trim() || !newLocType || newLocLat === '' || newLocLng === '') {
      showToast("Barcha maydonlarni to'ldiring", "error");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const locationData = {
        name: newLocName.trim(),
        type: newLocType,
        lat: Number(newLocLat),
        lng: Number(newLocLng),
      };

      if (role === 'admin') {
        // Direct update for admin
        import('firebase/firestore').then(async ({ updateDoc }) => {
            const docRef = doc(db, 'locations', editingLocation.id);
            await updateDoc(docRef, locationData);
            showToast("Muvaffaqiyatli tahrirlandi!", "success");
            setIsEditModalOpen(false);
            setEditingLocation(null);
            fetchLocations();
        });
      } else {
        await addDoc(collection(db, 'requests'), {
          actionType: 'edit',
          originalId: editingLocation.id,
          data: locationData,
          status: 'pending',
          createdBy: currentUser.uid,
          createdAt: new Date().toISOString()
        });
        showToast("Tahrirlash taklifi adminga yuborildi!", "success");
        setIsEditModalOpen(false);
        setEditingLocation(null);
      }
    } catch (error: any) {
      console.error("Xatolik:", error);
      showToast(error.message || "Xatolik yuz berdi!", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (loc: Location) => {
    setEditingLocation(loc);
    setNewLocName(loc.name);
    setNewLocType(loc.type);
    setNewLocLat(loc.lat);
    setNewLocLng(loc.lng);
    setIsEditModalOpen(true);
  };

  const handleDeleteLocation = async (id: string | undefined) => {
    if (!currentUser) return;
    if (!id) return;
    if (window.confirm("Haqiqatan ham bu ob'ektni o'chirmoqchimisiz?")) {
      try {
        if (role === 'admin') {
           await deleteDoc(doc(db, 'locations', id));
           fetchLocations();
           showToast("Muvaffaqiyatli o'chirildi!", "success");
           setSelectedLocations(prev => prev.filter(loc => loc.id !== id));
        } else {
           // Not supporting delete requests currently, simply show message
           showToast("Faqat admin o'chira oladi. Tahrirlash orqali taklif bering.", "error");
        }
      } catch (error) {
        console.error("Xatolik o'chirishda:", error);
        showToast("O'chirishda xatolik yuz berdi!", "error");
      }
    }
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!currentUser) {
      showToast("Tizimga kirmagansiz", "error");
      return;
    }

    setIsUploadingCSV(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          let successCount = 0;
          
          for (let i = 0; i < rows.length; i += 500) {
            const batch = writeBatch(db);
            const chunk = rows.slice(i, i + 500);
            
            for (const row of chunk) {
              if (row.name && row.type && row.lat && row.lng) {
                const docRef = doc(collection(db, 'locations'));
                batch.set(docRef, {
                  name: row.name.toString().trim(),
                  type: row.type.toString().trim(),
                  lat: parseFloat(row.lat),
                  lng: parseFloat(row.lng)
                });
                successCount++;
              }
            }
            await batch.commit();
          }

          showToast(`${successCount} ta ob'ekt muvaffaqiyatli bazaga qo'shildi!`, "success");
          fetchLocations();
        } catch (error) {
          console.error("CSV import error:", error);
          showToast("Xatolik yuz berdi", "error");
        } finally {
          setIsUploadingCSV(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      },
      error: (error) => {
        console.error("Papa Parse Error:", error);
        showToast("Faylni o'qishda xatolik", "error");
        setIsUploadingCSV(false);
      }
    });
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

  useEffect(() => {
    if (layers.neighborhoods && !neighborhoodsData) {
      const fetchNeighborhoods = async () => {
        setIsLoadingNeighborhoods(true);
        try {
          const bbox = "39.50,67.05,39.95,67.65"; 
          const query = `[out:json][timeout:25];(relation["admin_level"~"8|9|10|11"]["boundary"="administrative"](${bbox});way["admin_level"~"8|9|10|11"]["boundary"="administrative"](${bbox}););out geom;`;
          const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
          const data = await res.json();
          const features: any[] = [];
          data.elements.forEach((el: any) => {
             if (el.type === 'way' && el.geometry) {
                 features.push({
                    type: "Feature",
                    properties: { id: el.id, name: el.tags?.name || '' },
                    geometry: { type: "LineString", coordinates: el.geometry.map((g: any) => [g.lon, g.lat]) }
                 });
             } else if (el.type === 'relation' && el.members) {
                 el.members.forEach((mem: any) => {
                     if (mem.geometry) {
                         features.push({
                            type: "Feature",
                            properties: { id: el.id, name: el.tags?.name || '' },
                            geometry: { type: "LineString", coordinates: mem.geometry.map((g: any) => [g.lon, g.lat]) }
                         });
                     }
                 });
             }
          });
          setNeighborhoodsData({ type: "FeatureCollection", features });
        } catch (err) {
          console.error("Neighborhoods fetch error:", err);
        } finally {
          setIsLoadingNeighborhoods(false);
        }
      };
      fetchNeighborhoods();
    }
  }, [layers.neighborhoods]);

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

      setLocations(locs);
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLocations = locations.filter(loc => {
    if (hideUnselected && selectedLocations.length > 0) {
      if (!selectedLocations.find(l => l.id === loc.id)) return false;
    }
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

  const handleClearRoute = () => {
    setSelectedLocations([]);
    setIsStartMyLoc(false);
    setIsEndMyLoc(false);
    setRouteGeometry(null);
    setRouteStats(null);
  };

  const removeLocation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedLocations(selectedLocations.filter(l => l.id !== id));
    if (id === 'user-gps-start') setIsStartMyLoc(false);
    if (id === 'user-gps-end') setIsEndMyLoc(false);
    setRouteGeometry(null);
    setRouteStats(null);
  };

  const calculateRoute = async () => {
    if (selectedLocations.length < 2) return;
    setIsCalculating(true);
    setMultiRouteGeometries(null);
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

        // Background fetch for C scenario (optimized distance)
        fetch(`https://router.project-osrm.org/trip/v1/driving/${coords}?roundtrip=false&source=first&overview=false`)
          .then(r => r.json())
          .then(d => {
            if (d.code === 'Ok' && d.trips && d.trips.length > 0) {
              setOptimizedRouteDistance(d.trips[0].distance);
            }
          })
          .catch(e => console.error("Could not fetch optimized trip distance", e));
      }
    } catch (err) {
      console.error('Route calculation failed:', err);
    } finally {
      setIsCalculating(false);
    }
  };

  const kMeansClustering = (locations: Location[], k: number) => {
    if (k <= 1) return [locations];
    if (locations.length <= k) return locations.map(l => [l]);

    // Group locations by exact coordinates to keep them together
    const groupsMap = new Map<string, Location[]>();
    locations.forEach(loc => {
      const key = `${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`;
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key)!.push(loc);
    });
    
    const uniqueGroups = Array.from(groupsMap.values());
    if (uniqueGroups.length <= k) {
        return uniqueGroups.map(g => g);
    }

    let centroids = [];
    let shuffled = [...uniqueGroups].sort(() => 0.5 - Math.random());
    for (let i = 0; i < k; i++) centroids.push({ lat: shuffled[i][0].lat, lng: shuffled[i][0].lng });

    const targetSize = Math.ceil(locations.length / k);
    let clusters: Location[][] = Array.from({ length: k }, () => []);
    
    let iterations = 0;
    while (iterations < 50) {
      clusters = Array.from({ length: k }, () => []);
      const clusterSizes = new Array(k).fill(0);
      
      let distances: {groupIdx: number, clusterIdx: number, dist: number}[] = [];
      uniqueGroups.forEach((group, gIdx) => {
          for(let cIdx = 0; cIdx < k; cIdx++) {
              const dist = Math.pow(group[0].lat - centroids[cIdx].lat, 2) + Math.pow(group[0].lng - centroids[cIdx].lng, 2);
              distances.push({groupIdx: gIdx, clusterIdx: cIdx, dist});
          }
      });
      
      distances.sort((a, b) => a.dist - b.dist);
      const assignedGroups = new Set<number>();
      
      for (const d of distances) {
          if (assignedGroups.has(d.groupIdx)) continue;
          
          if (clusterSizes[d.clusterIdx] < targetSize || k === 1) {
              assignedGroups.add(d.groupIdx);
              clusters[d.clusterIdx].push(...uniqueGroups[d.groupIdx]);
              clusterSizes[d.clusterIdx] += uniqueGroups[d.groupIdx].length;
          }
      }
      
      // Fallback for remaining groups if clusters enforce strictly
      uniqueGroups.forEach((group, gIdx) => {
          if (!assignedGroups.has(gIdx)) {
              let minSize = Infinity;
              let bestCluster = 0;
              for(let c=0; c<k; c++) {
                  if (clusterSizes[c] < minSize) {
                      minSize = clusterSizes[c];
                      bestCluster = c;
                  }
              }
              clusters[bestCluster].push(...group);
              clusterSizes[bestCluster] += group.length;
          }
      });
      
      let changed = false;
      for (let i = 0; i < k; i++) {
        if (clusters[i].length === 0) continue;
        const newLat = clusters[i].reduce((sum, loc) => sum + loc.lat, 0) / clusters[i].length;
        const newLng = clusters[i].reduce((sum, loc) => sum + loc.lng, 0) / clusters[i].length;
        if (Math.abs(newLat - centroids[i].lat) > 0.00001 || Math.abs(newLng - centroids[i].lng) > 0.00001) {
          changed = true;
        }
        centroids[i] = { lat: newLat, lng: newLng };
      }
      if (!changed) break;
      iterations++;
    }
    return clusters.filter(c => c.length > 0);
  };

  const calculateOptimizedRoute = async () => {
    if (selectedLocations.length < 2) return;
    setIsCalculating(true);
    setRouteGeometry(null);
    setMultiRouteGeometries(null);
    try {
      const tripParams = `?roundtrip=${isRoundtrip}&source=first&overview=full&geometries=geojson`;

      if (vehiclesCount <= 1) {
        const coordsStr = selectedLocations.map(loc => `${loc.lng},${loc.lat}`).join(';');
        const res = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coordsStr}${tripParams}`);
        const data = await res.json();
        
        if (data.code === 'Ok' && data.trips && data.trips.length > 0) {
          const trip = data.trips[0];
          const routeCoords = trip.geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
          setRouteGeometry(routeCoords);
          
          setRouteStats({
            distance: trip.distance,
            duration: trip.duration
          });
          setOptimizedRouteDistance(trip.distance);

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
      } else {
        let clusters: Location[][] = [];
        if (sharedStartPoint) {
            const depot = selectedLocations[0];
            const toCluster = selectedLocations.slice(1);
            if (toCluster.length > 0) {
                clusters = kMeansClustering(toCluster, vehiclesCount);
                for (let i = 0; i < clusters.length; i++) {
                   clusters[i] = [depot, ...clusters[i]];
                }
            } else {
                clusters = [[depot]];
            }
        } else {
            clusters = kMeansClustering(selectedLocations, vehiclesCount);
        }

        const colors = ['#ec4899', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#eab308', '#f43f5e', '#6366f1', '#14b8a6', '#84cc16'];
        let totalDist = 0;
        let totalDur = 0;
        const multi = [];
        
        for (let i = 0; i < clusters.length; i++) {
           const cluster = clusters[i];
           if (cluster.length < 2) continue; 
           
           const coordsStr = cluster.map(loc => `${loc.lng},${loc.lat}`).join(';');
           const res = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coordsStr}${tripParams}`);
           const data = await res.json();
           
           if (data.code === 'Ok' && data.trips && data.trips.length > 0) {
               const trip = data.trips[0];
               const routeCoords = trip.geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
               totalDist += trip.distance;
               totalDur += trip.duration;
               multi.push({coords: routeCoords, color: colors[i % colors.length]});
           }
        }
        
        setMultiRouteGeometries(multi);
        setRouteStats({ distance: totalDist, duration: totalDur });
        setOptimizedRouteDistance(totalDist);
      }
    } catch (error) {
       console.error("TSP Xatolik:", error);
       showToast("Xatolik yuz berdi", "error");
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="w-full h-full relative font-sans text-slate-900 bg-[#f8fafc] overflow-hidden print:overflow-visible print:bg-white print:p-8 print:h-auto print:-m-8">
      
      {/* Print Document Header */}
      <div className="hidden print:block text-center mb-8 border-b-2 border-slate-900 pb-4 shrink-0 mt-8">
        <h1 className="text-xl font-black uppercase tracking-widest text-slate-900 mb-1">O'zbekiston Respublikasi, Maktabgacha va maktab ta'limi vazirligi</h1>
        <h2 className="text-lg font-bold text-slate-700">Bulung'ur MMTB - Logistika marshruti va Xarajatlar Smetasi</h2>
      </div>

      {/* Header Panel */}
      <div className="print:hidden absolute top-4 left-4 md:top-6 md:left-6 z-[400] bg-white/95 backdrop-blur-md px-3 py-2 md:px-5 md:py-3 rounded-2xl shadow-xl border border-slate-100 flex items-center space-x-2 md:space-x-4 max-w-[calc(100vw-32px)]">
        <div className="flex items-center space-x-2 md:space-x-3">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <MapIcon className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm md:text-lg font-bold tracking-tight text-slate-800 leading-tight truncate max-w-[120px] md:max-w-none">
              MMTB Logistika
            </h1>
            <div className="flex items-center text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-wider">
               <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 shrink-0"></span>
               <span className="truncate">{currentUser ? 'Iqtisodchi' : 'Mehmon'}</span>
            </div>
          </div>
        </div>
        <div className="w-px h-6 md:h-8 bg-slate-200 mx-1 md:mx-2 shrink-0"></div>
        <div className="flex items-center space-x-1 md:space-x-2 overflow-x-auto hide-scrollbar">
          {!currentUser ? (
            <button 
              onClick={() => navigate('/login')}
              className="px-2 py-1.5 md:px-4 md:py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] md:text-xs rounded-xl shadow-md transition-all font-sans whitespace-nowrap"
            >
              Tizimga kirish
            </button>
          ) : (
            <>
              {currentUser && (
                <button 
                  onClick={() => navigate('/admin')}
                  className="px-2 py-1.5 md:px-3 md:py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] md:text-xs rounded-xl transition-colors flex items-center space-x-1 whitespace-nowrap"
                >
                  <Settings2 className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">Iqtisodchi Paneli</span>
                </button>
              )}
              <button 
                onClick={() => auth.signOut()}
                className="px-2 py-1.5 md:px-3 md:py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] md:text-xs rounded-xl transition-colors flex items-center space-x-1 shrink-0"
                title="Tizimdan chiqish"
              >
                 <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="print:hidden absolute top-20 md:top-6 left-1/2 transform -translate-x-1/2 z-[500] w-[90%] sm:max-w-md transition-all">
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
        <div className={`print:hidden absolute bottom-36 md:bottom-24 left-1/2 transform -translate-x-1/2 md:left-6 md:translate-x-0 z-[600] px-4 md:px-6 py-2 md:py-3 rounded-xl text-xs md:text-sm font-bold shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4 ${toastMessage.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {toastMessage.text}
        </div>
      )}

      {/* Picking Mode Overlay */}
      {(isPickingLocation || isPickingRoutePoint) && (
        <div className="print:hidden absolute top-20 md:top-6 left-1/2 transform -translate-x-1/2 z-[400] bg-slate-900 text-white px-4 md:px-6 py-2 md:py-3 rounded-full flex items-center space-x-2 md:space-x-3 shadow-2xl hover:bg-slate-800 transition-colors w-[90%] md:w-auto justify-center">
          <MousePointer2 className="w-4 h-4 md:w-5 md:h-5 text-blue-400 animate-pulse shrink-0" />
          <span className="font-semibold text-xs md:text-sm truncate">Xaritadan joylashuvni chertib tanlang...</span>
          <div className="w-px h-3 md:h-4 bg-slate-700 mx-1 shrink-0"></div>
          <button onClick={() => { 
            if (isPickingRoutePoint) {
               setIsPickingRoutePoint(false);
            } else {
               setIsPickingLocation(false); 
               if (editingLocation) {
                   setIsEditModalOpen(true);
               } else {
                   setIsAddModalOpen(true); 
               }
            }
          }} className="text-[10px] md:text-xs text-slate-300 hover:text-white font-bold transition-colors whitespace-nowrap shrink-0">
            Bekor qilish
          </button>
        </div>
      )}

      {/* Add Location Button */}
      {(!isPickingLocation && !isPickingRoutePoint && currentUser) && (
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="print:hidden absolute top-20 md:top-24 left-4 md:left-6 z-[400] bg-white/95 backdrop-blur-md hover:bg-white text-slate-800 pr-4 md:pr-5 pl-1.5 md:pl-2 py-1.5 md:py-2 rounded-xl md:rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 flex items-center space-x-2 md:space-x-3 transition-all hover:scale-105 active:scale-95 group"
        >
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <Plus className="w-4 h-4 text-blue-600" />
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-700 group-hover:text-slate-900">Yangi ob'ekt</span>
        </button>
      )}

      {/* Zoom Control Position fix is above in MapContainer */}

      {/* Primary Action Buttons On Map */}
      <div className={`print:hidden absolute ${(!isPickingLocation && !isPickingRoutePoint && currentUser) ? 'top-36 md:top-40' : 'top-20 md:top-24'} left-4 md:left-6 z-[400] flex flex-col space-y-3`}>
        <button
          onClick={() => setIsPickingRoutePoint(true)}
          title="Xaritadan nuqta marshrutga qo'shish"
          className="bg-white/95 backdrop-blur-md hover:bg-slate-50 text-slate-800 p-3 md:p-3.5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 flex items-center justify-center transition-all hover:scale-105 active:scale-95 group"
        >
          <MousePointer2 className="w-5 h-5 md:w-6 md:h-6 text-emerald-600 group-hover:text-emerald-700 transition-colors" />
        </button>
      </div>

      {/* Modal - Add/Edit Location */}
      {(isAddModalOpen || isEditModalOpen) && currentUser && (
        <div 
          className="absolute inset-0 z-[500] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
                setIsAddModalOpen(false);
                setIsEditModalOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 max-w-md w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  {isEditModalOpen ? (role === 'admin' ? "Ob'ektni tahrirlash" : "Tahrirlash taklifi") : "Yangi ob'ekt qo'shish"}
              </h2>
              <button 
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }} 
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={isEditModalOpen ? handleEditLocation : handleAddLocation} className="p-6 space-y-5 overflow-y-auto">
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
                    onChange={(e) => setNewLocLat(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="..." 
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 outline-none focus:border-blue-400 focus:bg-white text-xs font-mono font-bold transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Uzunlik (Lng)</label>
                  <input 
                    type="number" step="any"
                    value={newLocLng}
                    onChange={(e) => setNewLocLng(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="..." 
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 outline-none focus:border-blue-400 focus:bg-white text-xs font-mono font-bold transition-colors"
                  />
                </div>
              </div>

              <button 
                type="button"
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); setIsPickingLocation(true); }}
                className="w-full py-3 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-sm rounded-xl border border-blue-100 transition-colors flex justify-center items-center space-x-2"
              >
                <MapPin className="w-4 h-4" />
                <span>Xaritadan tanlash</span>
              </button>

              <div className="pt-4 border-t border-slate-100 mt-2">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full relative py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-[0_4px_14px_0_rgb(0,0,0,0.39)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.23)] hover:shadow-slate-900/40 transition-all active:scale-95 disabled:opacity-70 disabled:shadow-none flex items-center justify-center overflow-hidden mb-4"
                >
                  {isSubmitting ? (
                    <span className="flex items-center">
                       <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                       Saqlanmoqda
                    </span>
                  ) : (
                    isEditModalOpen && role !== 'admin' ? "Taklif yuborish" : "Saqlash"
                  )}
                </button>
                
                {/* Bulk Import */}
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-center"><UploadCloud className="w-3 h-3 mr-1.5"/> Ommaviy yuklash (CSV)</h3>
                  <input 
                    type="file" 
                    accept=".csv" 
                    ref={fileInputRef} 
                    onChange={handleBulkUpload} 
                    className="hidden" 
                  />
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingCSV}
                    className="w-full py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 font-bold text-sm rounded-xl transition-colors flex justify-center items-center space-x-2 mb-2"
                  >
                    {isUploadingCSV ? (
                      <>
                        <div className="w-4 h-4 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin"></div>
                        <span>Yuklanmoqda...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        <span>📁 Excel (CSV) orqali yuklash</span>
                      </>
                    )}
                  </button>
                  <div className="text-center">
                    <a href="data:text/csv;charset=utf-8,name,type,lat,lng%0A1-maktab,maktab,39.6543,66.9754%0A5-bog'cha,bogcha,39.6600,66.9800%0AMarkaziy shifoxona,boshqa,39.6680,66.9900" download="namuna.csv" className="text-[11px] font-bold text-indigo-500 hover:text-indigo-600 underline">
                      namuna.csv yuklab olish
                    </a>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div 
          className="absolute inset-0 z-[600] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSettingsOpen(false);
          }}
        >
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 max-w-md w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
             <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center">
                  <Settings2 className="w-5 h-5 mr-2 text-indigo-600"/> 
                  Sozlamalar
                </h2>
                <button onClick={() => setIsSettingsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
             </div>
             <div className="p-6 space-y-6 overflow-y-auto">
                {/* Radius Analysis */}
                <div>
                   <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center"><Target className="w-3 h-3 mr-1.5"/> Radius Analizi (Qamrov)</h3>
                   <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                          <input 
                              type="number" 
                              min="1"
                              max="100"
                              placeholder="Radius (km)" 
                              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm font-semibold text-slate-900"
                              value={radiusKm}
                              onChange={(e) => setRadiusKm(Number(e.target.value))}
                          />
                          <span className="text-sm font-bold text-slate-500 shrink-0">km</span>
                      </div>
                      <Toggle 
                          label="Radius analizini yoqish" 
                          checked={isRadiusMode} 
                          onChange={(v) => {
                              setIsRadiusMode(v);
                              if (!v) setRadiusCenter(null);
                          }} 
                          color="bg-indigo-600" 
                      />
                      {isRadiusMode && (
                          <div className="text-xs text-slate-500 bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex items-start mt-2">
                             <Target className="w-4 h-4 text-indigo-500 mr-2 shrink-0 mt-0.5" />
                             <p>Xaritadan istalgan nuqtani tanlasangiz, <b>{radiusKm} km</b> radiusdagi barcha ta'lim muassasalari soni hisoblanadi.</p>
                          </div>
                      )}
                   </div>
                </div>
                
                <div className="w-full h-px bg-slate-100"></div>

                {/* Area Search */}
                <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center"><Search className="w-3 h-3 mr-1.5"/> Maxsus hudud chegarasini izlab chizish</h3>
                    <p className="text-[10px] text-slate-500 font-medium mb-2">Biron mahalla yoki qishloq nomini kiriting. (OSM bazasida mavjud bo'lsa chiziladi)</p>
                    <div className="flex items-center space-x-2">
                        <input 
                            type="text" 
                            placeholder="Masalan: Oqtepa..." 
                            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                            value={searchAreaQuery}
                            onChange={(e) => setSearchAreaQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') searchAreaBoundary() }}
                        />
                        <button 
                            onClick={searchAreaBoundary}
                            disabled={isSearchingArea}
                            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white font-bold text-sm rounded-xl transition-colors flex items-center shrink-0"
                        >
                            {isSearchingArea ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : "Chizish"}
                        </button>
                    </div>
                    {mahallaBoundary && (
                        <div className="mt-2 text-right">
                            <button 
                              onClick={() => { setMahallaBoundary(null); setSearchAreaQuery(''); }} 
                              className="text-[10px] text-red-500 hover:text-red-700 font-bold tracking-wider uppercase"
                            >
                              Chegarani tozalash
                            </button>
                        </div>
                    )}
                </div>
                
                <div className="w-full h-px bg-slate-100"></div>

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
                      <div className="flex items-center justify-between">
                         <Toggle label="Mahallalar chegarasi" checked={layers.neighborhoods} onChange={(v) => setLayers({...layers, neighborhoods: v})} color="bg-indigo-600" />
                         {isLoadingNeighborhoods && <span className="text-[10px] text-indigo-500 font-bold ml-2 animate-pulse">Yuklanmoqda...</span>}
                      </div>
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
        className="w-full h-screen z-0 print:hidden"
        ref={mapRef}
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Radius Circle */}
        {isRadiusMode && radiusCenter && (
           <Circle 
             center={radiusCenter} 
             radius={radiusKm * 1000} 
             pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.15, weight: 2, dashArray: '5, 5' }}
           />
        )}

        {/* User GPS Location Marker */}
        {userLocation && (
          <Marker 
            position={userLocation}
            icon={L.divIcon({
              className: 'pulsing-gps-marker bg-transparent border-0',
              html: `
                <div style="position: relative; width: 34px; height: 42px; pointer-events: none;">
                  <div class="animate-ping" style="position: absolute; top: 0; left: 0; width: 34px; height: 34px; background-color: #3b82f6; border-radius: 50%; opacity: 0.7;"></div>
                  <div style="background-color: #3b82f6; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); position: relative; z-index: 10;">
                    🙋‍♂️
                    <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #3b82f6;"></div>
                  </div>
                </div>
              `,
              iconSize: [34, 42],
              iconAnchor: [17, 40]
            })}
          >
            <Tooltip direction="top" offset={[0, -20]} opacity={0.9} className="border-0 shadow-lg rounded-xl font-sans font-bold text-blue-700 bg-white/90 backdrop-blur-sm px-3 py-2 text-xs">
              📍 Siz shu yerdasiz
            </Tooltip>
          </Marker>
        )}
        
        {filteredLocations.map((loc) => (
          <Marker 
            key={loc.id} 
            position={[loc.lat, loc.lng]} 
            icon={createDivIcon(loc.type, loc.name)}
            eventHandlers={{ click: () => handleMarkerClick(loc) }}
            ref={(el) => { markerRefs.current[loc.id] = el; }}
          >
            <Popup offset={[0, -20]}>
              <div className="font-sans text-center mt-1">
                <h3 className="font-extrabold text-[13px] text-slate-800 leading-tight mb-1">{loc.name}</h3>
                <p className="text-[10px] font-medium text-slate-500 capitalize mb-2 bg-slate-100 rounded px-1.5 py-0.5 inline-block">
                  {loc.type === 'dmtt' ? "Maktabgacha ta'lim" : loc.type}
                </p>
                <div className="flex flex-col space-y-1.5 pt-1 border-t border-slate-100">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleMarkerClick(loc); }}
                    className="print:hidden w-full px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center"
                  >
                    Marshrutga qo'shish
                  </button>
                  {currentUser && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); openEditModal(loc); }}
                      className="print:hidden w-full px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                      title="Joylashuv xatomi? To'g'irlash"
                    >
                      {role === 'admin' ? "To'g'irlash" : "To'g'irlash (Taklif)"}
                    </button>
                  )}
                  {(currentUser && role === 'admin') && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc.id); }}
                      className="print:hidden w-full px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center"
                    >
                      O'chirish
                    </button>
                  )}
                </div>
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
        {mahallaBoundary && (
          <GeoJSON 
            key={JSON.stringify(mahallaBoundary)} // force remount when geometry changes
            data={mahallaBoundary} 
            style={{ color: '#ef4444', weight: 2, dashArray: '5, 5', fillColor: '#ef4444', fillOpacity: 0.1 }} 
          />
        )}
        {layers.neighborhoods && neighborhoodsData && (
          <GeoJSON 
            data={neighborhoodsData} 
            style={{ color: '#6366f1', weight: 2, dashArray: '4, 4', fillOpacity: 0 }}
            onEachFeature={(feature, layer) => {
               if (feature.properties?.name) {
                  layer.bindTooltip(feature.properties.name, { permanent: false, direction: 'center', className: 'text-[10px] font-bold bg-white/90 border-0 rounded shadow-sm px-1.5 py-0.5' });
               }
            }}
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
        {multiRouteGeometries && multiRouteGeometries.map((m, idx) => (
          <Polyline key={idx} positions={m.coords} color={m.color} weight={6} opacity={0.8} />
        ))}
        <LocationPicker />
      </MapContainer>
      
      {/* Floating Settings/Filters Button */}
      <div className="print:hidden absolute bottom-24 md:bottom-6 left-4 md:left-6 z-[400] pointer-events-auto">
        <button onClick={() => setIsSettingsOpen(true)} className="bg-white/95 backdrop-blur-md px-4 py-2 md:px-5 md:py-3 rounded-2xl md:rounded-3xl shadow-2xl border border-slate-100 flex items-center space-x-2 transition-all hover:scale-105 active:scale-95 text-slate-800">
           <Settings2 className="w-4 h-4 md:w-5 md:h-5 text-indigo-600"/>
           <span className="font-extrabold text-xs md:text-sm tracking-tight text-slate-700">Filtrlar</span>
        </button>
      </div>

      {/* Mobile Toggle Navbar Button */}
      <div className="print:hidden md:hidden absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[400] pointer-events-auto">
        <button 
           onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)} 
           className="bg-slate-900 px-6 py-3.5 rounded-full shadow-2xl border border-slate-700 flex items-center space-x-2 transition-all active:scale-95 text-white shadow-blue-900/20"
        >
           <Route className="w-5 h-5 text-indigo-400"/>
           <span className="font-extrabold text-sm tracking-tight">Marshrut paneli</span>
           {selectedLocations.length > 0 && (
             <div className="ml-2 bg-indigo-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black">
               {selectedLocations.length}
             </div>
           )}
        </button>
      </div>

      {/* Mobile Overlay */}
      {isMobilePanelOpen && (
        <div 
          className="md:hidden fixed inset-0 z-[440] bg-slate-900/40 backdrop-blur-sm transition-opacity pointer-events-auto"
          onClick={() => setIsMobilePanelOpen(false)}
        />
      )}

      {/* Sidebar: Marshrut va Logistika */}
      <div className={`fixed md:absolute bottom-0 md:bottom-6 md:top-6 md:right-6 md:left-auto left-0 right-0 w-full md:w-96 z-[450] flex flex-col gap-2 md:gap-4 pointer-events-none print:hidden transition-transform duration-300 md:translate-y-0 ${isMobilePanelOpen ? 'translate-y-0' : 'translate-y-[100%]'}`}>
        
        {/* Selected Locations Panel */}
        <div className="flex-1 pointer-events-auto bg-white/95 backdrop-blur-md p-4 md:p-6 rounded-t-3xl md:rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden max-h-[70vh] md:max-h-none h-full">
          
          {/* Mobile Handle & Close */}
          <div className="flex items-center justify-between mb-4 md:hidden">
            <div className="w-10"></div>
            <div className="w-12 h-1.5 bg-slate-300 rounded-full cursor-pointer" onClick={() => setIsMobilePanelOpen(false)}></div>
            <button onClick={() => setIsMobilePanelOpen(false)} className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-800 bg-slate-100 rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center justify-between mb-4 shrink-0 hidden md:flex">
            <h2 className="font-extrabold text-xl text-slate-900 tracking-tight">Marshrut</h2>
            <div className="flex space-x-2">
              {selectedLocations.length > 0 && (
                <button onClick={handleClearRoute} className="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors border border-red-200" title="Tozalash">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                <Route className="w-4 h-4" />
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between mb-4 shrink-0 md:hidden">
            <h2 className="font-extrabold text-xl text-slate-900 tracking-tight">Marshrut paneli</h2>
            <div className="flex space-x-2">
              {selectedLocations.length > 0 && (
                <button onClick={handleClearRoute} className="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors border border-red-200" title="Tozalash">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                <Route className="w-4 h-4" />
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
            {selectedLocations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
                <p className="text-sm">Xaritadan manzillarni tanlang</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedLocations.map((loc, idx) => {
                  let bgColor = 'bg-slate-500';
                  if (loc.type === 'maktab') bgColor = 'bg-blue-600';
                  else if (loc.type === 'bogcha' || loc.type === 'dmtt') bgColor = 'bg-red-500';
                  else if (loc.type === 'boshqa' || loc.type === 'tashkilot') bgColor = 'bg-emerald-600';

                  return (
                    <div 
                      key={loc.id} 
                      onClick={(e) => removeLocation(e, loc.id)}
                      className={`relative w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shadow-md cursor-pointer group hover:bg-red-500 transition-colors border-2 border-white ${bgColor}`} 
                      title={loc.name}
                    >
                      <span className="group-hover:hidden">{getShortLabelString(loc.name)}</span>
                      <X className="w-4 h-4 hidden group-hover:block" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="print:hidden pt-3 border-t border-slate-100 mt-2 space-y-3">
            {selectedLocations.length > 0 && (
              <label className="flex items-center space-x-2 text-sm font-semibold text-slate-700 cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg transition-colors">
                <input 
                  type="checkbox" 
                  checked={hideUnselected}
                  onChange={(e) => setHideUnselected(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">Faqat tanlanganlarini xaritada ko'rsatish</span>
              </label>
            )}
            
            <div className="flex flex-col space-y-2 mb-4">
               <button 
                 onClick={handleCycleMyLocation}
                 className={`flex items-center justify-between p-3 rounded-xl border transition-colors shadow-sm ${(!isStartMyLoc && !isEndMyLoc) ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100' : (isStartMyLoc && !isEndMyLoc) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}
               >
                  <div className="flex items-center space-x-2">
                     <span className="text-lg">{(!isStartMyLoc && !isEndMyLoc) ? '📍' : (isStartMyLoc && !isEndMyLoc) ? '📍' : '🔄'}</span>
                     <span className="text-[13px] font-bold">
                       {(!isStartMyLoc && !isEndMyLoc) ? 'Joylashuvimni marshrutga qo\'shish' : (isStartMyLoc && !isEndMyLoc) ? '📍 Faqat boshlang\'ich nuqta' : '🔄 Boshlang\'ich va Yakuniy nuqta'}
                     </span>
                  </div>
               </button>
            </div>

            <div className="flex space-x-2">
              <button 
                className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all ${
                  selectedLocations.length < 2 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-lg active:scale-95'
                }`}
                onClick={calculateOptimizedRoute}
                disabled={selectedLocations.length < 2 || isCalculating}
                title="Marshrutni hisoblash"
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
            </div>
            
            {selectedLocations.length > 5 && (
               <div className="flex flex-col space-y-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
                 <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600">Marshrutlar soni:</span>
                    <div className="flex items-center shadow-sm rounded-lg overflow-hidden border border-slate-200">
                      <button onClick={() => setVehiclesCount(Math.max(1, vehiclesCount - 1))} className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-600 font-bold border-r border-slate-200 transition-colors">-</button>
                      <input type="number" value={vehiclesCount} readOnly className="w-8 text-center text-xs font-black py-1 bg-white text-slate-900 outline-none" />
                      <button onClick={() => setVehiclesCount(Math.min(10, vehiclesCount + 1))} className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-600 font-bold border-l border-slate-200 transition-colors">+</button>
                    </div>
                 </div>
                 {vehiclesCount > 1 && (
                   <label className="flex items-center space-x-2 text-[11px] font-semibold text-slate-700 cursor-pointer pt-1 border-t border-slate-200">
                     <input type="checkbox" checked={sharedStartPoint} onChange={(e) => setSharedStartPoint(e.target.checked)} className="rounded border-slate-300 text-blue-600 w-3 h-3" />
                     <span>1-chi manzil hamma uchun boshlang'ich bo'lsin</span>
                   </label>
                 )}
               </div>
            )}
            
            {selectedLocations.length >= 2 && (
               <label className="flex items-center space-x-2 text-[11px] font-semibold text-slate-700 cursor-pointer p-1.5 hover:bg-slate-50 rounded-xl transition-colors">
                 <input type="checkbox" checked={isRoundtrip} onChange={(e) => setIsRoundtrip(e.target.checked)} className="rounded border-slate-300 text-blue-600 w-3 h-3" />
                 <span>Aylanma marshrut (Oxirida boshlang'ichga qaytish)</span>
               </label>
            )}
          </div>
        </div>

        {/* Economist / Analytics Panel */}
        {routeStats && (
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md p-4 md:p-6 mb-4 md:mb-0 mx-2 md:mx-0 rounded-3xl shadow-2xl border border-slate-100 shrink-0 w-auto md:w-[384px] animate-in slide-in-from-right-4 duration-300 print:hidden overflow-y-auto max-h-[55vh] md:max-h-[calc(100vh-120px)] overscroll-contain block">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Route className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-[15px] text-slate-900 tracking-tight">Marshrut Ma'lumotlari</h3>
              </div>
              <button 
                onClick={() => window.print()}
                className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors"
                title="Smetani chop etish"
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                <div className="flex items-center space-x-1.5 mb-1 text-blue-600">
                  <MapIcon className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Masofa</span>
                </div>
                <div className="text-xl font-black text-slate-900 leading-none mt-1">
                  {(routeStats.distance / 1000).toFixed(1)} <span className="text-sm font-semibold text-slate-500">km</span>
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                <div className="flex items-center space-x-1.5 mb-1 text-orange-600">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Vaqt</span>
                </div>
                <div className="text-xl font-black text-slate-900 leading-none mt-1">
                  {Math.round(routeStats.duration / 60)} <span className="text-sm font-semibold text-slate-500">min</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legend Panel (Condensed version) */}
        {!routeStats && (
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md p-4 md:p-5 mx-2 md:ml-0 md:mr-16 mb-6 md:mb-6 rounded-3xl shadow-xl border border-slate-100 shrink-0">
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

      {/* Print Table Layout */}
      {routeStats && (
        <div className="hidden print:block mt-8 text-black border-t-2 border-dashed border-slate-300 pt-6 px-4">
          <div className="flex justify-between items-start mb-6 font-bold text-sm">
            <div>
              <p>Topshiriq sanasi: <span className="font-normal text-slate-700">{new Date().toLocaleDateString()}</span></p>
            </div>
            <div className="text-right">
              <p>Holati: <span className="font-normal text-slate-700">Tasdiqlandi</span></p>
            </div>
          </div>

          <table className="w-full text-sm border-collapse border border-slate-800 mb-8">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-800 py-2 px-3 text-center w-12 font-bold uppercase text-[10px]">№</th>
                <th className="border border-slate-800 py-2 px-3 text-left font-bold uppercase text-[10px]">Muassasa nomi</th>
                <th className="border border-slate-800 py-2 px-3 text-left font-bold uppercase text-[10px]">Turi</th>
              </tr>
            </thead>
            <tbody>
              {selectedLocations.map((loc, i) => (
                <tr key={loc.id}>
                  <td className="border border-slate-800 py-1.5 px-3 text-center">{i + 1}</td>
                  <td className="border border-slate-800 py-1.5 px-3 font-medium">{loc.name}</td>
                  <td className="border border-slate-800 py-1.5 px-3 uppercase text-[10px] text-slate-600">{loc.type}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mb-16 border-2 border-slate-900 rounded-xl p-5 bg-slate-50 w-full max-w-2xl mx-auto">
            <h4 className="font-black border-b-2 border-slate-900 pb-2 mb-4 uppercase text-sm tracking-widest text-center">Tasdiqlangan Marshrut Ma'lumotlari</h4>
            
            <div className="flex justify-between items-center mb-3 text-base">
              <span className="font-bold">Jami marshrut uzunligi:</span>
              <span className="font-semibold">{(routeStats.distance / 1000).toFixed(1)} km</span>
            </div>
            <div className="flex justify-between items-center mb-3 text-base">
              <span className="font-bold">Taxminiy borish vaqti:</span>
              <span className="font-semibold">{Math.round(routeStats.duration / 60)} daqiqa</span>
            </div>
            <div className="flex justify-between items-center mt-6 pt-4 border-t-2 border-slate-900 font-black text-lg">
              <span>Tasdiqlandi:</span>
            </div>
          </div>

          <div className="flex justify-between px-12 mt-20">
            <div className="text-center font-bold">
              <div className="mb-12 text-left">Tasdiqlayman:<br/>MMTB Mudiri</div>
              <div className="border-t border-slate-900 w-64 mx-auto pt-2 text-sm text-slate-500 uppercase">(Imzo, F.I.O)</div>
            </div>
            <div className="text-center font-bold">
              <div className="mb-12 text-left">Tuzdi:<br/>Bosh Iqtisodchi</div>
              <div className="border-t border-slate-900 w-64 mx-auto pt-2 text-sm text-slate-500 uppercase">(Imzo, F.I.O)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
