import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot
} from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { parseISO } from 'date-fns/parseISO';
import { eachDayOfInterval } from 'date-fns/eachDayOfInterval';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { TimeLog, UserProfile } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { Calendar, Filter, Download, Users, Clock, AlertTriangle, Search } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function AdminReports() {
  const { profile: adminProfile } = useAuth();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedUserId, setSelectedUserId] = useState<string>('all');

  useEffect(() => {
    if (!adminProfile) return;

    // Fetch all users for the school
    const usersQuery = query(
      collection(db, 'users'),
      where('schoolId', '==', adminProfile.schoolId),
      orderBy('displayName', 'asc')
    );

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setUsers(usersData);
    }, (error) => {
      console.error("Snapshot error for users:", error);
      setTimeout(() => {
        handleFirestoreError(error, OperationType.GET, 'users');
      }, 0);
    });

    return () => unsubUsers();
  }, [adminProfile]);

  useEffect(() => {
    if (!adminProfile) return;

    const start = startOfMonth(parseISO(`${month}-01`));
    const end = endOfMonth(parseISO(`${month}-01`));

    let q = query(
      collection(db, 'timeLogs'),
      where('schoolId', '==', adminProfile.schoolId),
      where('timestamp', '>=', start.toISOString()),
      where('timestamp', '<=', end.toISOString()),
      orderBy('timestamp', 'desc')
    );

    if (selectedUserId !== 'all') {
      q = query(
        collection(db, 'timeLogs'),
        where('userId', '==', selectedUserId),
        where('timestamp', '>=', start.toISOString()),
        where('timestamp', '<=', end.toISOString()),
        orderBy('timestamp', 'desc')
      );
    }

    const unsubMonthly = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeLog));
      setLogs(logsData);
      
      // Calculate delays for alerts
      let totalDelays = 0;
      const logsByUserAndDay = new Map<string, Map<string, TimeLog[]>>();
      
      logsData.forEach(log => {
        if (!logsByUserAndDay.has(log.userId)) logsByUserAndDay.set(log.userId, new Map());
        const dateStr = format(new Date(log.timestamp), 'yyyy-MM-dd');
        if (!logsByUserAndDay.get(log.userId)!.has(dateStr)) logsByUserAndDay.get(log.userId)!.set(dateStr, []);
        logsByUserAndDay.get(log.userId)!.get(dateStr)!.push(log);
      });

      logsByUserAndDay.forEach((daysMap, userId) => {
        const user = users.find(u => u.uid === userId);
        const startTimeStr = user?.startTime || "08:00";
        const [startH, startM] = startTimeStr.split(':').map(Number);

        daysMap.forEach((dayLogs) => {
          const firstIn = dayLogs.filter(l => l.type === 'in').sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
          if (firstIn) {
            const inTime = new Date(firstIn.timestamp);
            if (inTime.getHours() > startH || (inTime.getHours() === startH && inTime.getMinutes() > startM + 15)) {
              totalDelays++;
            }
          }
        });
      });

      setStats(prev => ({ ...prev, delays: totalDelays }));
      setLoading(false);
    }, (error) => {
      console.error("Snapshot error for logs:", error);
      setTimeout(() => {
        handleFirestoreError(error, OperationType.GET, 'timeLogs');
      }, 0);
    });

    return () => unsubMonthly();
  }, [adminProfile, month, selectedUserId, users]);

  const [stats, setStats] = useState({
    delays: 0
  });

  const calculateUserStats = (userId: string, userLogs: TimeLog[], userProfile?: UserProfile) => {
    let hours = 0;
    let days = new Set<string>();
    let lastIn: Date | null = null;
    let delays = 0;
    
    const logsByDay = new Map<string, TimeLog[]>();
    userLogs.forEach(log => {
      const dateStr = format(new Date(log.timestamp), 'yyyy-MM-dd');
      if (!logsByDay.has(dateStr)) logsByDay.set(dateStr, []);
      logsByDay.get(dateStr)!.push(log);
    });

    const startTimeStr = userProfile?.startTime || "08:00";
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

    // Sort logs by timestamp for correct hour calculation
    const sortedLogs = [...userLogs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    sortedLogs.forEach(log => {
      const date = new Date(log.timestamp);
      if (log.type === 'in') {
        lastIn = date;
      } else if (log.type === 'out' && lastIn) {
        hours += (date.getTime() - lastIn.getTime()) / (1000 * 60 * 60);
        lastIn = null;
      }
    });

    // Calculate absences
    let absences = 0;
    const reportDate = parseISO(`${month}-01`);
    const monthStart = startOfMonth(reportDate);
    const monthEnd = endOfMonth(reportDate);
    const today = new Date();
    const endForInterval = isSameDay(monthStart, startOfMonth(today)) ? today : monthEnd;
    
    const interval = eachDayOfInterval({ start: monthStart, end: endForInterval });
    
    interval.forEach(day => {
      const dayOfWeek = day.getDay();
      const dateStr = format(day, 'yyyy-MM-dd');
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isSameDay(day, today) && !days.has(dateStr)) {
        absences++;
      }
    });

    return {
      totalHours: Math.round(hours * 10) / 10,
      daysWorked: days.size,
      delays,
      absences
    };
  };

  const isLate = (log: TimeLog, user?: UserProfile) => {
    if (log.type !== 'in') return false;
    const startTimeStr = user?.startTime || "08:00";
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const logTime = new Date(log.timestamp);
    return logTime.getHours() > startH || (logTime.getHours() === startH && logTime.getMinutes() > startM + 15);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const selectedUser = users.find(u => u.uid === selectedUserId);
    
    doc.setFontSize(18);
    doc.text('EduPonto - Relatório de Frequência', 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Escola: ${adminProfile?.schoolId || 'N/A'}`, 14, 30);
    doc.text(`Período: ${format(parseISO(`${month}-01`), 'MMMM yyyy')}`, 14, 37);
    doc.text(`Funcionário: ${selectedUser?.displayName || 'Todos os Funcionários'}`, 14, 44);

    // 1. Detailed Logs Table
    doc.setFontSize(14);
    doc.text('Registros Detalhados', 14, 55);

    const tableData = logs.map(log => [
      log.userName,
      format(new Date(log.timestamp), 'dd/MM/yyyy'),
      format(new Date(log.timestamp), 'HH:mm:ss'),
      log.type === 'in' ? 'Entrada' : 'Saída',
      log.device
    ]);

    autoTable(doc, {
      startY: 60,
      head: [['Funcionário', 'Data', 'Hora', 'Tipo', 'Dispositivo']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }, // Blue-600
    });

    // 2. Summary Section
    const finalY = (doc as any).lastAutoTable.finalY || 60;
    doc.setFontSize(14);
    doc.text('Resumo Mensal', 14, finalY + 15);

    if (selectedUserId !== 'all') {
      const stats = calculateUserStats(selectedUserId, logs, selectedUser);
      const summaryData = [
        ['Total de Horas', `${stats.totalHours}h`],
        ['Dias Trabalhados', stats.daysWorked.toString()],
        ['Atrasos', stats.delays.toString()],
        ['Faltas', stats.absences.toString()]
      ];

      autoTable(doc, {
        startY: finalY + 20,
        body: summaryData,
        theme: 'plain',
        styles: { fontSize: 12 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
      });
    } else {
      // Summary for all users
      const userSummaries = users.map(user => {
        const userLogs = logs.filter(l => l.userId === user.uid);
        const stats = calculateUserStats(user.uid, userLogs, user);
        return [
          user.displayName,
          `${stats.totalHours}h`,
          stats.daysWorked.toString(),
          stats.delays.toString(),
          stats.absences.toString()
        ];
      });

      autoTable(doc, {
        startY: finalY + 20,
        head: [['Funcionário', 'Horas', 'Dias', 'Atrasos', 'Faltas']],
        body: userSummaries,
        theme: 'striped',
        headStyles: { fillColor: [71, 85, 105] }, // Slate-600
      });
    }

    doc.save(`relatorio_ponto_${month}_${selectedUser?.displayName || 'geral'}.pdf`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Relatórios Escolares</h1>
          <p className="text-slate-500 dark:text-slate-400">Visão geral de frequência e carga horária.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Users className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" size={18} />
            <select 
              className="pl-10 h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="all">Todos os Funcionários</option>
              {users.map(user => (
                <option key={user.uid} value={user.uid}>{user.displayName}</option>
              ))}
            </select>
          </div>
          
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" size={18} />
            <input 
              type="month" 
              className="pl-10 h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-100"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          
          {adminProfile?.permissions?.exportReports && (
            <Button variant="outline" className="gap-2" onClick={exportPDF}>
              <Download size={18} />
              <span>Exportar PDF</span>
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Total de Registros</p>
                <h3 className="text-3xl font-bold mt-1 text-slate-900 dark:text-slate-100">{logs.length}</h3>
              </div>
              <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-3 rounded-lg">
                <Clock size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Funcionários Ativos</p>
                <h3 className="text-3xl font-bold mt-1 text-slate-900 dark:text-slate-100">{new Set(logs.map(l => l.userId)).size}</h3>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 p-3 rounded-lg">
                <Users size={24} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Alertas de Atraso</p>
                <h3 className="text-3xl font-bold mt-1 text-slate-900 dark:text-slate-100">{stats.delays}</h3>
              </div>
              <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 p-3 rounded-lg">
                <AlertTriangle size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Funcionário</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hora</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dispositivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto"></div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                      Nenhum registro encontrado para este período.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold text-xs">
                            {log.userName.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{log.userName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {format(new Date(log.timestamp), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {format(new Date(log.timestamp), 'HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Badge variant={log.type === 'in' ? "success" : "default"}>
                            {log.type === 'in' ? 'Entrada' : 'Saída'}
                          </Badge>
                          {log.type === 'in' && isLate(log, users.find(u => u.uid === log.userId)) && (
                            <Badge variant="warning" className="text-[10px] py-0 px-1.5">
                              Atraso
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        {log.device}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
