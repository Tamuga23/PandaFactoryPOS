/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Reports from './pages/Reports';
import Purchases from './pages/Purchases';
import SalesHistory from './pages/SalesHistory';
import Settings from './pages/Settings';
import Catalog from './pages/Catalog';
import Customers from './pages/Customers';
import UniversalObjections from './components/UniversalObjections';
import CategoryObjections from './components/CategoryObjections';
import { useStoreData } from './hooks/useStoreData';
import { loginAnonymouslyUser } from './lib/db';
import { Store, LogIn } from 'lucide-react';
import { useState } from 'react';

export default function App() {
  const { user, loading } = useStoreData();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await loginAnonymouslyUser();
    } catch (error: any) {
      console.error(error);
      alert('Error: Por favor habilita el proveedor "Anónimo" en Firebase Console -> Authentication.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="text-cyan-500 animate-pulse flex items-center gap-2">
          <Store className="w-6 h-6" />
          <span className="font-semibold">Cargando App...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-cyan-500/20 overflow-hidden">
            <img src="/logo.png" alt="pandastore" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
            <Store className="w-8 h-8 text-cyan-400 hidden" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
              panda<span className="bg-gradient-to-r from-cyan-400 to-[#0a85a8] bg-clip-text text-transparent">store</span>
            </h1>
            <p className="text-zinc-400 text-sm">Entrar al sistema de administración de PandaStore.</p>
          </div>
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-3 bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-3 px-4 rounded-xl transition-all shadow-lg shadow-cyan-500/20"
          >
            {isLoggingIn ? (
              <span className="animate-pulse">Entrando...</span>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Ingresar al Sistema
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/history" element={<SalesHistory />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/objeciones-universales" element={<UniversalObjections />} />
          <Route path="/objeciones-categoria" element={<CategoryObjections />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
