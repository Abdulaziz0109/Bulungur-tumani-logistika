import React, { useState, useEffect } from 'react';
import { collection, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { useNavigate } from 'react-router-dom';
import { Users, LogOut, Plus, Shield, User, X, Map as MapIcon, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
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
  }, []);

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
            <h1 className="font-extrabold text-slate-900 tracking-tight text-lg">Admin Panel</h1>
          </div>
        </div>
        
        <div className="p-4 flex-1">
          <ul className="space-y-2">
            <li>
              <button className="w-full flex items-center space-x-3 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-sm">
                <Users className="w-5 h-5" />
                <span>Foydalanuvchilar</span>
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
           <h1 className="text-xl font-extrabold text-slate-900">Admin Panel</h1>
        </div>

        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Foydalanuvchilar ro'yxati</h2>
            <p className="text-slate-500 text-sm mt-1">Tizimga kirish huquqiga ega barcha odamlar</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center space-x-2 shadow-lg shadow-indigo-200 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Yangi xodim</span>
          </button>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl border border-green-100 text-sm font-bold flex items-center justify-between">
            {success}
            <button onClick={() => setSuccess('')}><X className="w-4 h-4"/></button>
          </div>
        )}

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
                      {user.role === 'admin' ? 'Admin' : 'Iqtisodchi (User)'}
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
                    <option value="user">Iqtisodchi / Logist (Oddiy foydalanuvchi)</option>
                    <option value="admin">Admin (To'liq boshqaruv)</option>
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
