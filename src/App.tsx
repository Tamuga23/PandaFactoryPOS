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
import { StoreDataProvider, useStore } from './context/StoreContext';
import { loginWithEmail, mensajeErrorLogin } from './lib/db';
import { Store, LogIn, AlertCircle } from 'lucide-react';
import React, { useState } from 'react';

// P3.1: el provider monta las suscripciones UNA sola vez; AppContent y todos
// los hijos (Layout, páginas) consumen la misma instancia vía useStore().
export default function App() {
  return (
    <StoreDataProvider>
      <AppContent />
    </StoreDataProvider>
  );
}

function AppContent() {
  const { user, loading, authError } = useStore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Completá el correo y la contraseña.');
      return;
    }
    setIsLoggingIn(true);
    setError(null);
    try {
      await loginWithEmail(email, password);
      // No hace falta hacer nada más: onAuthStateChanged en useStoreData
      // verifica el claim `admin` y recién ahí monta la app.
      setPassword('');
    } catch (err: any) {
      console.error('[login]', err?.code, err?.message);
      setError(mensajeErrorLogin(err?.code ?? ''));
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Error de credenciales (local) o sesión válida sin permisos de staff (del hook).
  const errorVisible = error ?? authError;

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
          {/* P4.7: /logo.png no existe en public/ — icono directo, sin img rota */}
          <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-cyan-500/20">
            <Store className="w-8 h-8 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
              panda<span className="bg-gradient-to-r from-cyan-400 to-[#0a85a8] bg-clip-text text-transparent">store</span>
            </h1>
            <p className="text-zinc-400 text-sm">Entrar al sistema de administración de PandaStore.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3 text-left">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Correo
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoggingIn}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
                placeholder="vos@tudominio.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoggingIn}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>

            {/* `red-*` no existe en la paleta declarada: el peligro es
                `rose-*`. Eran los únicos tres usos del proyecto. */}
            {errorVisible && (
              <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2.5 text-left">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-rose-300 text-xs leading-relaxed">{errorVisible}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-cyan-700 text-white hover:bg-cyan-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-3 px-4 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
          </form>
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
