import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { parseISO } from 'date-fns/parseISO';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { TimeLog } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { Calendar, Filter, Download, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF with autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export function UserLogs() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    if (!profile) return;

    const start = startOfMonth(parseISO(`${month}-01`));
    const end = endOfMonth(parseISO(`${month}-01`));

    const q = query(
      collection(db, 'timeLogs'),
      where('userId', '==', profile.uid),
      where('timestamp', '>=', start.toISOString()),
      where('timestamp', '<=', end.toISOString()),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeLog));
      setLogs(logsData);
      setLoading(false);
    }, (error) => {
      console.error("Snapshot error for logs:", error);
      setTimeout(() => {
        handleFirestoreError(error, OperationType.GET, 'timeLogs');
      }, 0);
    });

    return () => unsubscribe();
  }, [profile, month]);

  const exportPDF = () => {
    const doc = new jsPDF();
    
    doc.text(`Relatório de Ponto - ${profile?.displayName}`, 14, 15);
    doc.text(`Período: ${month}`, 14, 25);

    const tableData = logs.map(log => [
      format(new Date(log.timestamp), 'dd/MM/yyyy'),
      format(new Date(log.timestamp), 'HH:mm:ss'),
      log.type === 'in' ? 'Entrada' : 'Saída',
      log.device,
      log.location ? 'Sim' : 'Não'
    ]);

    doc.autoTable({
      startY: 35,
      head: [['Data', 'Hora', 'Tipo', 'Dispositivo', 'GPS']],
      body: tableData,
    });

    doc.save(`ponto_${month}_${profile?.displayName}.pdf`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Meus Registros</h1>
          <p className="text-slate-500 dark:text-slate-400">Histórico detalhado de entradas e saídas.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" size={18} />
            <input 
              type="month" 
              className="pl-10 h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-100"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <Button variant="outline" className="gap-2" onClick={exportPDF}>
            <Download size={18} />
            <span>PDF</span>
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hora</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dispositivo</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Localização</th>
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
                      <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100 font-medium">
                        {format(new Date(log.timestamp), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {format(new Date(log.timestamp), 'HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={log.type === 'in' ? "success" : "default"} className="gap-1">
                          {log.type === 'in' ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                          {log.type === 'in' ? 'Entrada' : 'Saída'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        {log.device}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {log.location ? (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded">GPS Ativo</span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">N/A</span>
                        )}
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
