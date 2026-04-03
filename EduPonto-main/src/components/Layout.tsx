import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Clock, 
  Users, 
  FileText, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Bell,
  BellOff,
  Sun,
  Moon,
  Monitor,
  Building2,
  CalendarDays
} from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNotifications } from '@/src/hooks/useNotifications';
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
  const { permission, requestPermission } = useNotifications();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['admin', 'professor', 'staff'] },
    { label: 'Registrar Ponto', icon: Clock, path: '/ponto', roles: ['admin', 'professor', 'staff'] },
    { label: 'Meus Registros', icon: FileText, path: '/meus-registros', roles: ['admin', 'professor', 'staff'] },
    { label: 'Gestão de Usuários', icon: Users, path: '/usuarios', roles: ['admin'], permission: 'manageUsers' },
    { label: 'Relatórios Escolares', icon: FileText, path: '/relatorios', roles: ['admin'], permission: 'viewReports' },
    { label: 'Cadastro de Escolas', icon: Building2, path: '/escolas', roles: ['admin'] },
    { label: 'Quadros de Horário', icon: CalendarDays, path: '/quadros', roles: ['admin'] },
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
          <button 
            onClick={requestPermission}
            className={cn(
              "p-2 rounded-full transition-colors",
              permission === 'granted' ? "text-blue-600 bg-blue-50" : "text-slate-400 hover:bg-slate-100"
            )}
            title={permission === 'granted' ? "Notificações Ativadas" : "Ativar Notificações"}
          >
            {permission === 'granted' ? <Bell size={20} /> : <BellOff size={20} />}
          </button>
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
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                {profile?.displayName?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{profile?.displayName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate capitalize">{profile?.role}</p>
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
              <button 
                onClick={requestPermission}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  permission === 'granted' ? "text-blue-600 bg-blue-50 dark:bg-blue-900/20" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
                title={permission === 'granted' ? "Notificações Ativadas" : "Ativar Notificações"}
              >
                {permission === 'granted' ? <Bell size={18} /> : <BellOff size={18} />}
              </button>
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
