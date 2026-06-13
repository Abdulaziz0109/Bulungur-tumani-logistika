import React, { useState, useEffect } from 'react';
import { collection, getDocs, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { useNavigate } from 'react-router-dom';
import { Users, LogOut, Plus, Shield, User, X, Map as MapIcon, ArrowLeft, MessageSquare, Check, XCircle, Camera, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'requests' | 'reports'>('users');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // New User Form State
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    fetchUsers();
    fetchRequests();
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const snap = await getDocs(collection(db, 'reports'));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort newest photo reports first
      list.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setReports(list);
    } catch (e) {
      console.error("Failed to load reports:", e);
    }
  };

  const fetchRequests = async () => {
    try {
      const snap = await getDocs(collection(db, 'requests'));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(r => (r as any).status === 'pending');
      setRequests(list);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApprove = async (req: any) => {
      try {
          if (req.actionType === 'add') {
              await setDoc(doc(collection(db, 'locations')), req.data);
          } else if (req.actionType === 'edit') {
              await updateDoc(doc(db, 'locations', req.originalId), req.data);
          }
          await updateDoc(doc(db, 'requests', req.id), { status: 'approved' });
          setSuccess("Taklif tasdiqlandi va xaritaga qo'shildi!");
          fetchRequests();
      } catch (err: any) {
          setError(err.message || 'Xatolik yuz berdi');
      }
  };

  const handleReject = async (reqId: string) => {
      if (window.confirm("Bu taklifni rad etasizmi?")) {
          try {
              await updateDoc(doc(db, 'requests', reqId), { status: 'rejected' });
              setSuccess("Taklif rad etildi.");
              fetchRequests();
          } catch (err: any) {
             setError(err.message || 'Xatolik yuz berdi');
          }
      }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    
    try {
      // Create a secondary app to create user without automatically signing out the current admin
      const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const newUserId = userCredential.user.uid;
      
      // Save it to firestore users collection using default db (from main app)
      await setDoc(doc(db, 'users', newUserId), {
        email: newEmail,
        role: newRole,
        createdAt: new Date().toISOString()
      });
      
      // Sign out and delete secondary app instance if possible or just sign out
      await secondaryAuth.signOut();
      
      setSuccess("Foydalanuvchi muvaffaqiyatli qo'shildi!");
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      setIsModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Xatolik yuz berdi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm("Haqiqatan ham bu foydalanuvchini o'chirmoqchimisiz? (Auth bazasidan o'chmaydi, faqat Firestore dan o'chadi)")) {
       await deleteDoc(doc(db, 'users', userId));
       fetchUsers();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-100 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <h1 className="font-extrabold text-slate-900 tracking-tight text-lg">Iqtisodchi Paneli</h1>
          </div>
        </div>
        
        <div className="p-4 flex-1">
          <ul className="space-y-2">
            <li>
              <button 
                onClick={() => setActiveTab('users')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${activeTab === 'users' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                <Users className="w-5 h-5" />
                <span>Foydalanuvchilar</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('requests')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-colors ${activeTab === 'requests' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                <div className="flex items-center space-x-3">
                  <MessageSquare className="w-5 h-5" />
                  <span>Takliflar</span>
                </div>
                {requests.length > 0 && (
                  <span className="bg-red-500 text-white min-w-[20px] h-[20px] flex items-center justify-center rounded-full text-[10px] px-1">{requests.length}</span>
                )}
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('reports')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${activeTab === 'reports' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                <Camera className="w-5 h-5" />
                <span>Foto-Hisobotlar (Bot)</span>
              </button>
            </li>
            <li>
              <button onClick={() => navigate('/')} className="w-full flex items-center space-x-3 px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-xl font-semibold text-sm transition-colors">
                <MapIcon className="w-5 h-5" />
                <span>Xaritaga qaytish</span>
              </button>
            </li>
          </ul>
        </div>
        
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
             <span className="text-xs font-bold text-slate-500 truncate px-2">{currentUser?.email}</span>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center space-x-2 px-4 py-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-bold text-sm transition-colors">
            <LogOut className="w-4 h-4" />
            <span>Chiqish</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-8 overflow-y-auto">
        <div className="md:hidden flex items-center mb-6 space-x-4">
           <button onClick={() => navigate('/')} className="p-2 bg-white rounded-lg shadow-sm border border-slate-100 text-slate-600"><ArrowLeft className="w-5 h-5"/></button>
           <h1 className="text-xl font-extrabold text-slate-900">Iqtisodchi Paneli</h1>
        </div>

        {/* Mobile-friendly horizontal tabs */}
        <div className="flex md:hidden bg-slate-105 p-1 rounded-xl mb-6 gap-1 shrink-0">
          <button 
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex-1 text-center py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'users' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
          >
            Xodimlar
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`flex-1 text-center py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'requests' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
          >
            Takliflar ({requests.length})
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`flex-1 text-center py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'reports' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
          >
            Hisobotlar ({reports.length})
          </button>
        </div>

        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {activeTab === 'users' ? "Foydalanuvchilar ro'yxati" : activeTab === 'requests' ? "Xaritadagi o'zgarish takliflari" : "TG Bot Foto-Hisobotlari"}
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {activeTab === 'users' ? "Tizimga kirish huquqiga ega barcha odamlar" : activeTab === 'requests' ? "Foydalanuvchilar tomondan yuborilgan yangi joylashuv yoki tahrirlashlar" : "Telegram bot orqali yo'ldan yuborilgan fotofaktlar"}
            </p>
          </div>
          {activeTab === 'users' && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center space-x-2 shadow-lg shadow-indigo-200 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Yangi xodim</span>
            </button>
          )}
        </div>

        {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-sm font-bold flex items-center justify-between">
              {error}
              <button onClick={() => setError('')}><X className="w-4 h-4"/></button>
            </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl border border-green-100 text-sm font-bold flex items-center justify-between">
            {success}
            <button onClick={() => setSuccess('')}><X className="w-4 h-4"/></button>
          </div>
        )}

        {activeTab === 'users' ? (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-bold tracking-widest text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Foydalanuvchi (Email)</th>
                <th className="px-6 py-4">Rol</th>
                <th className="px-6 py-4">Holat</th>
                <th className="px-6 py-4">Amal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8">Yuklanmoqda...</td></tr>
              ) : users.map((user) => (
                <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900 flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                      <User className="w-4 h-4"/>
                    </div>
                    <span>{user.email || 'Email kiritilmagan'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${user.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {user.role === 'admin' ? 'Iqtisodchi' : 'Iqtisodchi (User)'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center text-xs font-bold text-slate-400">
                      Faol
                    </span>
                  </td>
                  <td className="px-6 py-4">
                     <button onClick={() => handleDeleteUser(user.id)} className="text-red-500 hover:text-red-700 font-bold text-xs px-3 py-1 border border-red-100 hover:bg-red-50 rounded-lg transition-colors">
                       Bekor qilish
                     </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                 <tr>
                   <td colSpan={4} className="text-center py-8 text-slate-500">Hech kim topilmadi. Avval admin ro'yxatdan o'tkazing.</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
        ) : activeTab === 'requests' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            {requests.map((req) => (
              <div key={req.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col justify-between">
                 <div>
                    <div className="flex items-center justify-between mb-4">
                       <span className={`px-2.5 py-1 text-[10px] uppercase tracking-widest font-extrabold rounded-md ${req.actionType === 'add' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                         {req.actionType === 'add' ? 'Yangi qo\'shish' : 'Tahrirlash'}
                       </span>
                       <span className="text-xs text-slate-400 font-medium">Taklif</span>
                    </div>
                    <div className="space-y-1 mb-6">
                       <h3 className="font-extrabold text-slate-900 border-b border-slate-50 pb-2 mb-2">{req.data?.name}</h3>
                       <p className="text-xs text-slate-500 capitalize"><strong>Turi:</strong> {req.data?.type}</p>
                       <p className="text-xs text-slate-500 font-mono mt-1 blur-[1px] hover:blur-none transition">
                          {req.data?.lat}, {req.data?.lng}
                       </p>
                    </div>
                 </div>
                 <div className="flex space-x-3">
                    <button onClick={() => handleApprove(req)} className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 font-bold py-2.5 rounded-xl text-xs transition-colors flex justify-center items-center space-x-1.5">
                       <Check className="w-4 h-4" /> <span>Tasdiqlash</span>
                    </button>
                    <button onClick={() => handleReject(req.id)} className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-100 font-bold py-2.5 rounded-xl text-xs transition-colors flex justify-center items-center space-x-1.5">
                       <XCircle className="w-4 h-4" /> <span>Rad etish</span>
                    </button>
                 </div>
              </div>
            ))}
            {requests.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                Hozircha o'zgarishlar tasdiqlash uchun kutilmayapti.
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            {reports.map((report) => (
              <div key={report.id} className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 flex flex-col justify-between overflow-hidden group">
                 <div>
                    <div className="flex items-center justify-between mb-4">
                       <span className="px-2.5 py-1 text-[10px] uppercase tracking-widest font-extrabold bg-blue-50 text-blue-700 rounded-lg flex items-center">
                         <Camera className="w-34 h-3.5 mr-1" /> Telegram Bot
                       </span>
                       <span className="text-[10px] text-slate-400 font-bold flex items-center uppercase tracking-wide">
                         <Clock className="w-3.5 h-3.5 mr-1 text-slate-300" /> {report.createdAt ? new Date(report.createdAt).toLocaleDateString('uz-UZ') : "Noma'lum"}
                       </span>
                    </div>

                    <div className="flex items-center space-x-3 mb-4 border-b border-slate-50 pb-3">
                       <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-indigo-600 font-black text-xs uppercase">
                         {report.userFullname ? report.userFullname.substring(0, 2) : "User"}
                       </div>
                       <div>
                          <h4 className="font-extrabold text-slate-900 text-sm leading-tight">{report.userFullname || "Telegram Foydalanuvchi"}</h4>
                          <p className="text-[10px] text-indigo-500 font-bold mt-0.5">
                            {report.username ? `@${report.username}` : `ID: ${report.userId || "Noma'lum"}`}
                          </p>
                       </div>
                    </div>

                    <div className="relative mb-4 bg-slate-50 rounded-2xl overflow-hidden aspect-[4/3] border border-slate-100 flex items-center justify-center">
                      <img 
                        src={`/api/telegram-photo/${report.photoFileId}`} 
                        alt="Telegram hisobot" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&auto=format&fit=crop&q=60";
                        }}
                      />
                    </div>

                    {report.caption && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-100/50 mb-4 font-sans italic leading-relaxed">
                        "{report.caption}"
                      </p>
                    )}
                 </div>
                 
                 <a 
                   href={`/api/telegram-photo/${report.photoFileId}`} 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-extrabold py-3.5 rounded-xl text-center text-xs transition-colors flex justify-center items-center space-x-1.5 cursor-pointer leading-none"
                 >
                    <span>Asl rasmni ko'rish (Full size)</span>
                 </a>
              </div>
            ))}
            {reports.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                Telegram bot orqali hali rasm/hisobotlar yuborilmagan.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-extrabold text-slate-900">Yangi xodim qo'shish</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5"/></button>
            </div>
            
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
               {error && <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100">{error}</div>}
               
               <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Email</label>
                  <input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold outline-none" placeholder="xodim@example.com" />
               </div>
               <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Parol (min 6 belgi)</label>
                  <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required minLength={6} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold outline-none" placeholder="••••••••" />
               </div>
               <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Rol (Huquq)</label>
                  <select value={newRole} onChange={e=>setNewRole(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold outline-none cursor-pointer">
                    <option value="admin">Iqtisodchi</option>
                  </select>
               </div>

               <div className="mt-6 pt-4 border-t border-slate-100">
                  <button disabled={isSubmitting} type="submit" className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors flex justify-center items-center">
                    {isSubmitting ? "Kuting..." : "Saqlash"}
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
