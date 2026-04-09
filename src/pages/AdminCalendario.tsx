import React, { useEffect, useState, useMemo } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, doc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import {
  format, startOfMonth, endOfMonth,
  isSameDay, addMonths, subMonths, getDay,
} from 'date-fns';
import { parseISO } from 'date-fns/parseISO';
import { eachDayOfInterval } from 'date-fns/eachDayOfInterval';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { EventoEscolar, EventoTipo } from '@/src/types';
import { Plus, ChevronLeft, ChevronRight, X, Trash2, Edit2, CalendarDays, Ban } from 'lucide-react';

const TIPO_LABELS: Record<EventoTipo, string> = {
  feriado: 'Feriado', recesso: 'Recesso', evento: 'Evento', reuniao: 'Reunião',
};

const TIPO_COLORS: Record<EventoTipo, { bg: string; text: string; dot: string }> = {
  feriado: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300', dot: 'bg-red-500' },
  recesso: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-500' },
  evento: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-300', dot: 'bg-blue-500' },
  reuniao: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-800 dark:text-purple-300', dot: 'bg-purple-500' },
};

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

const emptyForm = {
  nome: '',
  data: format(new Date(), 'yyyy-MM-dd'),
  dataFim: '',
  tipo: 'evento' as EventoTipo,
  bloqueiaRegistro: false,
  descricao: '',
};

export function AdminCalendario() {
  const { profile } = useAuth();
  const [eventos, setEventos] = useState<EventoEscolar[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    if (!profile) return;
    const start = format(subMonths(startOfMonth(currentMonth), 1), 'yyyy-MM-dd');
    const end = format(addMonths(endOfMonth(currentMonth), 2), 'yyyy-MM-dd');
    const q = query(
      collection(db, 'eventosEscolares'),
      where('schoolId', '==', profile.schoolId),
      where('data', '>=', start),
      where('data', '<=', end),
      orderBy('data', 'asc'),
    );
    const unsub = onSnapshot(q, snap => {
      setEventos(snap.docs.map(d => ({ id: d.id, ...d.data() } as EventoEscolar)));
    }, err => handleFirestoreError(err, OperationType.GET, 'eventosEscolares'));
    return () => unsub();
  }, [profile, currentMonth]);

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  }, [currentMonth]);

  const getEventsForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return eventos.filter(evt => {
      if (evt.dataFim) return evt.data <= dateStr && evt.dataFim >= dateStr;
      return evt.data === dateStr;
    });
  };

  const upcomingEvents = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return [...eventos].filter(e => e.data >= todayStr).sort((a, b) => a.data.localeCompare(b.data));
  }, [eventos]);

  const openCreate = (defaultDate?: string) => {
    setEditingId(null);
    setFormData({ ...emptyForm, data: defaultDate ?? format(new Date(), 'yyyy-MM-dd') });
    setIsModalOpen(true);
  };

  const openEdit = (evt: EventoEscolar) => {
    setEditingId(evt.id!);
    setFormData({
      nome: evt.nome,
      data: evt.data,
      dataFim: evt.dataFim ?? '',
      tipo: evt.tipo,
      bloqueiaRegistro: evt.bloqueiaRegistro,
      descricao: evt.descricao ?? '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const payload = stripUndefined({
      schoolId: profile.schoolId,
      nome: formData.nome,
      data: formData.data,
      dataFim: formData.dataFim || undefined,
      tipo: formData.tipo,
      bloqueiaRegistro: formData.bloqueiaRegistro,
      descricao: formData.descricao || undefined,
      createdBy: profile.uid,
    });
    try {
      if (editingId) {
        await updateDoc(doc(db, 'eventosEscolares', editingId), payload);
      } else {
        await addDoc(collection(db, 'eventosEscolares'), { ...payload, createdAt: new Date().toISOString() });
      }
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'eventosEscolares');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este evento?')) return;
    try { await deleteDoc(doc(db, 'eventosEscolares', id)); }
    catch (err) { handleFirestoreError(err, OperationType.DELETE, 'eventosEscolares'); }
  };

  // Calendar grid padding: Brazilian week Mon-Sun
  const firstDayOfWeek = getDay(startOfMonth(currentMonth)); // 0=Sun
  const startPadding = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Calendário Escolar</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Feriados, eventos e recessos</p>
        </div>
        <Button onClick={() => openCreate()} className="gap-2"><Plus size={16} /> Novo Evento</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg capitalize">
                {format(currentMonth, 'MMMM yyyy')}
              </CardTitle>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentMonth(m => subMonths(m, 1))}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-3 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors text-slate-600 dark:text-slate-400"
                >
                  Hoje
                </button>
                <button
                  onClick={() => setCurrentMonth(m => addMonths(m, 1))}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 mb-2">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-slate-400 dark:text-slate-500 py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startPadding }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {daysInMonth.map(day => {
                const dayEvents = getEventsForDay(day);
                const isToday = isSameDay(day, new Date());
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[60px] rounded-lg p-1.5 border transition-colors cursor-pointer ${
                      isToday
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : isWeekend
                        ? 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20'
                        : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                    onClick={() => {
                      if (dayEvents.length === 0) openCreate(format(day, 'yyyy-MM-dd'));
                    }}
                  >
                    <span className={`text-xs font-medium ${
                      isToday
                        ? 'text-blue-600 dark:text-blue-400 font-bold'
                        : isWeekend
                        ? 'text-slate-400 dark:text-slate-600'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}>
                      {format(day, 'd')}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.slice(0, 2).map(evt => (
                        <div
                          key={evt.id}
                          className={`text-[9px] px-1 rounded truncate font-medium cursor-pointer ${TIPO_COLORS[evt.tipo].bg} ${TIPO_COLORS[evt.tipo].text}`}
                          onClick={e => { e.stopPropagation(); openEdit(evt); }}
                        >
                          {evt.nome}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[9px] text-slate-400">+{dayEvents.length - 2}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              {(Object.entries(TIPO_LABELS) as [EventoTipo, string][]).map(([tipo, label]) => (
                <div key={tipo} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`h-2.5 w-2.5 rounded-full ${TIPO_COLORS[tipo].dot}`} />
                  {label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming events list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Próximos Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-8">
                <CalendarDays size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum evento próximo</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.slice(0, 10).map(evt => (
                  <div
                    key={evt.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors"
                  >
                    <div className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${TIPO_COLORS[evt.tipo].dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{evt.nome}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {format(parseISO(evt.data), 'dd/MM/yyyy')}
                        {evt.dataFim && ` → ${format(parseISO(evt.dataFim), 'dd/MM/yyyy')}`}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TIPO_COLORS[evt.tipo].bg} ${TIPO_COLORS[evt.tipo].text}`}>
                          {TIPO_LABELS[evt.tipo]}
                        </span>
                        {evt.bloqueiaRegistro && (
                          <span className="text-[10px] flex items-center gap-0.5 text-red-500 dark:text-red-400">
                            <Ban size={10} /> Bloqueia ponto
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => openEdit(evt)}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Edit2 size={12} className="text-slate-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(evt.id!)}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 size={12} className="text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? 'Editar Evento' : 'Novo Evento Escolar'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome *</label>
                <Input
                  required
                  value={formData.nome}
                  onChange={e => setFormData(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Dia do Professor"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data *</label>
                  <Input
                    type="date"
                    required
                    value={formData.data}
                    onChange={e => setFormData(f => ({ ...f, data: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Fim (opcional)</label>
                  <Input
                    type="date"
                    value={formData.dataFim}
                    onChange={e => setFormData(f => ({ ...f, dataFim: e.target.value }))}
                    min={formData.data}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo *</label>
                <select
                  value={formData.tipo}
                  onChange={e => setFormData(f => ({ ...f, tipo: e.target.value as EventoTipo }))}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(Object.entries(TIPO_LABELS) as [EventoTipo, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={formData.descricao}
                  onChange={e => setFormData(f => ({ ...f, descricao: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Descrição opcional..."
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="bloqueia"
                  checked={formData.bloqueiaRegistro}
                  onChange={e => setFormData(f => ({ ...f, bloqueiaRegistro: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="bloqueia" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Bloquear registro de ponto neste(s) dia(s)
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1">
                  {editingId ? 'Salvar' : 'Criar Evento'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
