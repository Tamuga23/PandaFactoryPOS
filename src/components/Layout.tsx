import { useState, useEffect, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, BarChart3, Store, LogOut, History, ShoppingBag, Settings as SettingsIcon, PackageOpen, Menu, X, Users, HelpCircle, Tag } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../context/StoreContext';
import { logout } from '../lib/db';
import { Toaster } from './Toast';

const navigation = [
  { name: 'Panel Principal', href: '/', icon: LayoutDashboard },
  { name: 'Terminal POS', href: '/pos', icon: ShoppingCart },
  { name: 'Catálogo Maestro', href: '/catalog', icon: PackageOpen },
  { name: 'Control de Inventario', href: '/inventory', icon: Package },
  { name: 'Compras', href: '/purchases', icon: ShoppingBag },
  { name: 'Clientes', href: '/customers', icon: Users },
  { name: 'Historial de Ventas', href: '/history', icon: History },
  { name: 'Reportes', href: '/reports', icon: BarChart3 },
  { name: 'Objeciones Generales', href: '/objeciones-universales', icon: HelpCircle },
  { name: 'Objeciones por Categoría', href: '/objeciones-categoria', icon: Tag },
  { name: 'Configuración', href: '/settings', icon: SettingsIcon },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { stats, user, companyInfo } = useStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const logoSrc = companyInfo?.logoBase64 || "/logo.png";

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  /**
   * Título real de la pantalla. El header decía "Resumen Principal del Sistema"
   * en TODAS las páginas — también sobre el POS, donde se mueve la plata. Un
   * encabezado que miente es peor que no tener ninguno.
   */
  const tituloPagina =
    navigation.find(n => n.href === location.pathname)?.name ?? 'Panel Principal';

  /*
    El título del documento era FIJO: "pandastore — Sistema de Gestión" en las
    once pantallas. Eso se ve en la pestaña del navegador, en el historial y al
    cambiar de ventana con Alt+Tab. Con varias pestañas abiertas —el POS y el
    Inventario, por ejemplo— las dos se llaman igual y hay que adivinar cuál es
    cuál. El nombre de la pantalla va primero porque es lo único que se lee
    cuando la pestaña se angosta.
  */
  useEffect(() => {
    document.title = `${tituloPagina} — pandastore`;
  }, [tituloPagina]);

  return (
    <div className="min-h-screen bg-zinc-950 flex text-zinc-200 overflow-hidden relative">
      {/* Notificaciones globales (reemplazo de alert()) */}
      <Toaster />
      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar (Desktop & Mobile) */}
      <div className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform duration-300 ease-in-out",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900 z-10 w-full relative">
          {/*
            Era un <h1>: el encabezado de nivel más alto del documento decía
            "pandastore" en las once pantallas. Un logotipo que se repite
            idéntico en todos lados no identifica NADA — y dejaba sin h1 al dato
            que sí identifica la página, que es su nombre. El header móvil ya lo
            trataba como <span>; ahora los dos coinciden.
          */}
          <div className="text-xl font-bold tracking-tight flex items-center gap-2">
            {companyInfo?.logoBase64 ? (
              <img src={companyInfo.logoBase64} alt="pandastore" className="w-8 h-8 rounded-full object-cover border border-zinc-800 bg-white" />
            ) : (
              <Store className="w-6 h-6 text-cyan-400" />
            )}
            <span className="text-white">panda</span><span className="-ml-1 bg-gradient-to-r from-cyan-400 to-[#0a85a8] bg-clip-text text-transparent">store</span>
          </div>
          {/* Era de solo icono y sin nombre: un lector lo anunciaba como
              "boton" a secas. Y sin anillo de foco, que sobre una superficie
              casi negra deja el default del navegador, que es impredecible. */}
          <button
            aria-label="Cerrar el menu"
            className="md:hidden p-2 text-zinc-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-md"
            onClick={closeMobileMenu}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar bg-zinc-900 relative z-0">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={closeMobileMenu}
                className={cn(
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors',
                  // Los 11 items del menu no declaraban foco: es el primer
                  // lugar al que llega el Tab en CADA pantalla, y el anillo
                  // caia al default del navegador sobre zinc-900.
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-lg cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-cyan-500'
                )}
              >
                <item.icon
                  className={cn(
                    isActive ? 'text-cyan-500 opacity-100' : 'opacity-80 group-hover:text-zinc-200',
                    'mr-3 flex-shrink-0 h-5 w-5'
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
        {/* Low Stock Alert embedded in sidebar */}
        {stats && stats.lowStockItems.length > 0 && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-900 relative z-0">
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
              <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1">Alerta de Bajo Inventario</p>
              <p className="text-sm text-rose-200">{stats.lowStockItems.length} artículos requieren atención</p>
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-950">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between bg-zinc-900 border-b border-zinc-800 px-4 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <button
              aria-label="Abrir el menu"
              className="p-2 -ml-2 text-zinc-400 hover:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-md"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center">
              {companyInfo?.logoBase64 ? (
                <img src={companyInfo.logoBase64} alt="pandastore" className="w-6 h-6 mr-2 rounded-full object-cover border border-zinc-800 bg-white" />
              ) : (
                <Store className="w-6 h-6 text-cyan-400 mr-2" />
              )}
              <span className="text-lg font-bold tracking-tight"><span className="text-white">panda</span><span className="bg-gradient-to-r from-cyan-400 to-[#0a85a8] bg-clip-text text-transparent">store</span></span>
            </div>
          </div>
          <button onClick={logout} aria-label="Cerrar sesión" className="p-2 text-zinc-400 hover:text-zinc-200 rounded-md bg-zinc-800/50 focus:outline-none focus:ring-1 focus:ring-cyan-500">
            <LogOut className="w-5 h-5" />
          </button>
          {/*
            El <h2> del header de escritorio es `hidden md:flex` (display:none
            en móvil), así que bajo 768px el árbol de accesibilidad saltaba de
            h1 directo a h3. Este lo lee el lector y no lo ve nadie.
          */}
          <h1 className="sr-only">{tituloPagina}</h1>
        </div>
        
        {/* Top Header */}
        <header className="hidden md:flex h-16 border-b border-zinc-800 items-center justify-between px-8 bg-zinc-900/20">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-medium text-zinc-200">{tituloPagina}</h1>
            <span className="px-2 py-1 bg-cyan-500/10 text-cyan-400 text-[10px] uppercase font-bold rounded border border-cyan-500/20">Conectado a la Nube</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative cursor-help" title={`Las actualizaciones se transmiten en tiempo real.`}>
              {stats && stats.lowStockItems.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
              )}
              <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
              </svg>
            </div>
            
            <div className="flex items-center gap-3 border-l border-zinc-800 pl-6">
              <div className="text-right hidden lg:block">
                <p className="text-sm font-medium text-zinc-200 leading-none">{user?.displayName || 'Usuario'}</p>
                {/* zinc-500 sobre el header da 4.05:1. Desde que el POS entra
                    con email/password y claim `admin`, saber CON QUE CUENTA se
                    esta operando dejo de ser accesorio. zinc-400 da 7.45:1. */}
                <p className="text-xs text-zinc-400 mt-1">{user?.email}</p>
              </div>
              {/* El avatar iba con alt="Avatar": el nombre y el correo ya
                  estan en el <p> de al lado, asi que "imagen, Avatar" solo
                  agrega ruido. Decorativa. */}
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-zinc-700" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400">
                  {user?.displayName?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <button
                onClick={logout}
                aria-label="Cerrar sesion"
                className="ml-2 p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
                title="Cerrar Sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 relative overflow-y-auto focus:outline-none custom-scrollbar">
          <div className="py-6 px-4 sm:px-6 md:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
