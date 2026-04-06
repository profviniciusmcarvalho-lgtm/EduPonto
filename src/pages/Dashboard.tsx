import React, { useEffect, useState } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight,
  TrendingUp,
  Users
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Cell
} from 'recharts';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  getDocs,
  Timestamp,
  getDocFromServer,
  doc
} from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { MASCOT_FULL_URL } from '@/src/constants';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { TimeLog } from '@/src/types';
import { cn } from '@/src/lib/utils';

export function Dashboard() {
  const { profile } = useAuth();
  const [recentLogs, setRecentLogs] = useState<TimeLog[]>([]);
  const [stats, setStats] = useState({
    totalHours: 0,
    daysWorked: 0,
    delays: 0,
    absences: 0,
    currentlyClockedIn: 0
  });

  useEffect(() => {
    if (!profile) return;

    // ... existing logsQuery ...

    // If admin, fetch all current logs to see who is clocked in
    if (profile.role === 'admin') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const activeQuery = query(
        collection(db, 'timeLogs'),
        where('schoolId', '==', profile.schoolId),
        where('timestamp', '>=', today.toISOString()),
        orderBy('timestamp', 'desc')
      );

      const unsubActive = onSnapshot(activeQuery, (snapshot) => {
        const logs = snapshot.docs.map(doc => doc.data() as TimeLog);
        const userLastLog = new Map<string, string>();
        
        logs.forEach(log => {
          if (!userLastLog.has(log.userId)) {
            userLastLog.set(log.userId, log.type);
          }
        });

        let clockedIn = 0;
        userLastLog.forEach(type => {
          if (type === 'in') clockedIn++;
        });

        setStats(prev => ({ ...prev, currentlyClockedIn: clockedIn }));
      }, (error) => {
        console.error("Snapshot error for active logs:", error);
        setTimeout(() => {
          handleFirestoreError(error, OperationType.GET, 'timeLogs');
        }, 0);
      });

      return () => unsubActive();
    }
  }, [profile]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
        // Skip logging for other errors, as this is simply a connection test.
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    if (!profile) return;

    // Recent logs
    const logsQuery = query(
      collection(db, 'timeLogs'),
      where('userId', '==', profile.uid),
      orderBy('timestamp', 'desc'),
      limit(5)
    );

    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeLog));
      setRecentLogs(logs);
    }, (error) => {
      console.error("Snapshot error for recent logs:", error);
      setTimeout(() => {
        handleFirestoreError(error, OperationType.GET, 'timeLogs');
      }, 0);
    });

    // Monthly stats
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    
    const monthlyQuery = query(
      collection(db, 'timeLogs'),
      where('userId', '==', profile.uid),
      where('timestamp', '>=', start.toISOString()),
      where('timestamp', '<=', end.toISOString()),
      orderBy('timestamp', 'asc')
    );

    const unsubMonthly = onSnapshot(monthlyQuery, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data() as TimeLog);
      
      // Calculate stats
      let hours = 0;
      let days = new Set<string>();
      let lastIn: Date | null = null;
      let delays = 0;
      
      // Group logs by day to find first entry
      const logsByDay = new Map<string, TimeLog[]>();
      logs.forEach(log => {
        const dateStr = format(new Date(log.timestamp), 'yyyy-MM-dd');
        if (!logsByDay.has(dateStr)) logsByDay.set(dateStr, []);
        logsByDay.get(dateStr)!.push(log);
      });

      // Calculate delays (first entry of the day > 08:00)
      const startTimeStr = profile.startTime || "08:00";
      const [startH, startM] = startTimeStr.split(':').map(Number);

      logsByDay.forEach((dayLogs, dateStr) => {
        days.add(dateStr);
        const firstIn = dayLogs.filter(l => l.type === 'in').sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
        if (firstIn) {
          const inTime = new Date(firstIn.timestamp);
          if (inTime.getHours() > startH || (inTime.getHours() === startH && inTime.getMinutes() > startM + 15)) {
            delays++;
          }
        }
      });

      // Calculate total hours
      logs.forEach(log => {
        const date = new Date(log.timestamp);
        if (log.type === 'in') {
          lastIn = date;
        } else if (log.type === 'out' && lastIn) {
          hours += (date.getTime() - lastIn.getTime()) / (1000 * 60 * 60);
          lastIn = null;
        }
      });

      // Calculate absences (Mon-Fri days with no logs)
      let absences = 0;
      const today = new Date();
      const monthStart = startOfMonth(today);
      const interval = eachDayOfInterval({ start: monthStart, end: today });
      
      interval.forEach(day => {
        const dayOfWeek = day.getDay();
        const dateStr = format(day, 'yyyy-MM-dd');
        // If it's a weekday and not today and no logs
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isSameDay(day, today) && !days.has(dateStr)) {
          absences++;
        }
      });

      setStats(prev => ({
        ...prev,
        totalHours: Math.round(hours * 10) / 10,
        daysWorked: days.size,
        delays,
        absences
      }));

      // Prepare chart data (last 7 days)
      const last7Days = eachDayOfInterval({
        start: subDays(new Date(), 6),
        end: new Date()
      });

      const data = last7Days.map(day => {
        let dayHours = 0;
        let dayIn: Date | null = null;
        
        logs.forEach(log => {
          const logDate = new Date(log.timestamp);
          if (isSameDay(logDate, day)) {
            if (log.type === 'in') dayIn = logDate;
            else if (log.type === 'out' && dayIn) {
              dayHours += (logDate.getTime() - dayIn.getTime()) / (1000 * 60 * 60);
              dayIn = null;
            }
          }
        });

        return {
          name: format(day, 'EEE', { locale: ptBR }),
          hours: Math.round(dayHours * 10) / 10
        };
      });

      setChartData(data);
      setLoading(false);
    }, (error) => {
      console.error("Snapshot error for monthly logs:", error);
      setTimeout(() => {
        handleFirestoreError(error, OperationType.GET, 'timeLogs');
      }, 0);
    });

    return () => {
      unsubLogs();
      unsubMonthly();
    };
  }, [profile]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Olá, {profile?.displayName}</h1>
        <p className="text-slate-500 dark:text-slate-400">Bem-vindo ao seu painel de controle de ponto.</p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-blue-600 text-white border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Horas no Mês</p>
                <h3 className="text-3xl font-bold mt-1">{stats.totalHours}h</h3>
              </div>
              <div className="bg-blue-500/30 p-3 rounded-lg">
                <Clock size={24} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-blue-100 text-xs">
              <TrendingUp size={14} />
              <span>Meta: {profile?.workload}h mensais</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Dias Trabalhados</p>
                <h3 className="text-3xl font-bold mt-1 text-slate-900 dark:text-slate-100">{stats.daysWorked}</h3>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 p-3 rounded-lg">
                <CheckCircle2 size={24} />
              </div>
            </div>
            <div className="mt-4 text-slate-400 dark:text-slate-500 text-xs">
              Mês de {format(new Date(), 'MMMM', { locale: ptBR })}
            </div>
          </CardContent>
        </Card>

        {profile?.role === 'admin' ? (
          <Card className="bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-600 dark:text-emerald-400 text-sm font-medium">Presentes Agora</p>
                  <h3 className="text-3xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">{stats.currentlyClockedIn}</h3>
                </div>
                <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 p-3 rounded-lg">
                  <Users size={24} />
                </div>
              </div>
              <div className="mt-4 text-emerald-600/60 dark:text-emerald-400/60 text-xs">
                Funcionários com ponto aberto
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Atrasos</p>
                  <h3 className="text-3xl font-bold mt-1 text-slate-900 dark:text-slate-100">{stats.delays}</h3>
                </div>
                <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 p-3 rounded-lg">
                  <AlertTriangle size={24} />
                </div>
              </div>
              <div className="mt-4 text-slate-400 dark:text-slate-500 text-xs">
                Este mês
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Faltas</p>
                <h3 className="text-3xl font-bold mt-1 text-slate-900 dark:text-slate-100">{stats.absences}</h3>
              </div>
              <div className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg">
                <Calendar size={24} />
              </div>
            </div>
            <div className="mt-4 text-slate-400 dark:text-slate-500 text-xs">
              Este mês
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tips Card */}
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-900/30 overflow-hidden relative">
          <CardContent className="pt-6 flex flex-col h-full">
            <div className="flex items-start gap-4 relative z-10">
              <div className="shrink-0">
                <img 
                  src={MASCOT_FULL_URL} 
                  alt="Mascote EduPonto" 
                  className="h-32 w-auto object-contain drop-shadow-md"
                />
              </div>
              <div className="flex-1 space-y-2">
                <h4 className="font-bold text-blue-900 dark:text-blue-100 text-lg leading-tight">Dica do Edu:</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed italic">
                  "Não esqueça de registrar seu ponto assim que chegar! Isso garante que sua carga horária seja contabilizada corretamente."
                </p>
                <div className="pt-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200">
                    Presente e Pronto!
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
          <div className="absolute -bottom-4 -right-4 opacity-10">
            <Clock size={120} className="text-blue-900 dark:text-blue-100" />
          </div>
        </Card>

        {/* Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Frequência Semanal</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.hours > 0 ? '#2563eb' : '#e2e8f0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentLogs.length === 0 ? (
                <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-8">Nenhum registro encontrado.</p>
              ) : (
                recentLogs.map((log) => (
                  <div key={log.id} className="flex items-center gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                      log.type === 'in' ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    )}>
                      {log.type === 'in' ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {log.type === 'in' ? 'Entrada' : 'Saída'} registrada
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {format(new Date(log.timestamp), "dd 'de' MMMM, HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
