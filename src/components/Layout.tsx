import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Clock, 
  Users, 
  FileText, 
  LogOut, 
  Menu, 
  X,
  Bell,
  BellRing,
  Sun,
  Moon,
  Monitor,
  GraduationCap,
  BookOpen,
  CalendarDays,
  Building2,
  AlarmClock,
  Tv2,
  UserX,
  Globe,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { useSystemNotifications } from '@/src/hooks/useSystemNotifications';
import { useTheme } from '@/src/hooks/useTheme';
import { Button } from './ui/Button';
import { cn } from '@/src/lib/utils';
import { Logo } from './Logo';
import { UserPermissions } from '@/src/types';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { profile, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useSystemNotifications(profile?.schoolId);
  const [showNotifPanel, setShowNotifPanel] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['admin', 'professor', 'staff', 'superadmin'] },
    { label: 'Registrar Ponto', icon: Clock, path: '/ponto', roles: ['admin', 'professor', 'staff', 'superadmin'] },
    { label: 'Meus Registros', icon: FileText, path: '/meus-registros', roles: ['admin', 'professor', 'staff', 'superadmin'] },
    { label: 'Gestão de Usuários', icon: Users, path: '/usuarios', roles: ['admin'], permission: 'manageUsers' },
    { label: 'Relatórios Escolares', icon: FileText, path: '/relatorios', roles: ['admin'], permission: 'viewReports' },
    { label: 'Turmas', icon: GraduationCap, path: '/turmas', roles: ['admin'] },
    { label: 'Disciplinas', icon: BookOpen, path: '/disciplinas', roles: ['admin'] },
    { label: 'Formação de Horários', icon: Users, path: '/formacao-horarios', roles: ['admin'] },
    { label: 'Quadro de Horários', icon: CalendarDays, path: '/quadro-horarios', roles: ['admin'] },
    { label: 'Calendário Escolar', icon: CalendarDays, path: '/calendario', roles: ['admin'] },
    { label: 'Escolas', icon: Building2, path: '/escolas', roles: ['admin'] },
    { label: 'Horários de Aula', icon: AlarmClock, path: '/horarios', roles: ['admin'] },
    { label: 'Terminal de Ponto', icon: Tv2, path: '/terminal', roles: ['admin'] },
    { label: 'Ausências', icon: UserX, path: '/ausencias', roles: ['admin'] },
    { label: 'Rede de Escolas', icon: Globe, path: '/rede', roles: ['superadmin'] },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (!profile) return false;
    if (item.roles.includes(profile.role)) return true;
    if (item.permission && profile.permissions && profile.permissions[item.permission as keyof UserPermissions]) return true;
    return false;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row transition-colors duration-300">
      {/* Mobile Header */}
      <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Alternar Tema"
          >
            {resolvedTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <div className="relative">
            <button onClick={() => setShowNotifPanel(p => !p)}
              className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Notificações">
              {unreadCount > 0 ? <BellRing size={20} className="text-blue-500" /> : <Bell size={20} />}
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifPanel && (
              <div className="fixed top-14 right-2 left-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notificações</span>
                  <button onClick={() => setShowNotifPanel(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">Sem notificações</p>
                  ) : notifications.map(n => (
                    <button key={n.id} onClick={() => { markAsRead(n.id!); setShowNotifPanel(false); }}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 ${!n.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-full md:w-64 flex-shrink-0 flex flex-col fixed md:sticky top-0 h-screen z-40 transition-transform duration-300",
        !isMobileMenuOpen && "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 hidden md:flex items-center justify-center">
          <Logo size="md" />
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                  isActive 
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold" 
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                )}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4 px-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link to={`/perfil/${profile?.uid}`} className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold hover:ring-2 hover:ring-blue-300 transition-all overflow-hidden shrink-0">
                {profile?.photoUrl
                  ? <img src={profile.photoUrl} alt="foto" className="h-full w-full object-cover" />
                  : profile?.displayName?.charAt(0).toUpperCase() || 'U'
                }
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{profile?.displayName}</p>
                <Link to={`/perfil/${profile?.uid}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block">
                  Meu Perfil
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Alternar Tema"
              >
                {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowNotifPanel(p => !p)}
                  className="relative p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Notificações"
                >
                  {unreadCount > 0 ? <BellRing size={18} className="text-blue-500" /> : <Bell size={18} />}
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {showNotifPanel && (
                  <div className="absolute bottom-10 right-0 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notificações</span>
                      {unreadCount > 0 && (
                        <button onClick={markAllAsRead} className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">
                          Marcar tudo como lido
                        </button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-6">Sem notificações</p>
                      ) : notifications.map(n => (
                        <button key={n.id} onClick={() => markAsRead(n.id!)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${!n.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                          <div className="flex items-start gap-2">
                            {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                            <div className={!n.read ? '' : 'pl-4'}>
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{n.title}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                              <p className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString('pt-BR')}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10"
            onClick={handleLogout}
          >
            <LogOut size={20} />
            <span>Sair</span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
