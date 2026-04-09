import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Schedule, School, UserProfile } from '@/src/types';
import { Plus, Search, Edit2, Trash2, X, Calendar, Printer, Eraser } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { cn } from '@/src/lib/utils';

const DAY_LABELS: Record<string, string> = {
  monday: 'Segunda-feira',
  tuesday: 'Terça-feira',
  wednesday: 'Quarta-feira',
  thursday: 'Quinta-feira',
  friday: 'Sexta-feira',
  saturday: 'Sábado',
  sunday: 'Domingo',
};
const DAY_SHORT: Record<string, string> = {
  monday: 'Seg',
  tuesday: 'Ter',
  wednesday: 'Qua',
  thursday: 'Qui',
  friday: 'Sex',
  saturday: 'Sáb',
  sunday: 'Dom',
};
const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function AdminSchedules() {
  const { profile: adminProfile } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [professors, setProfessors] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  // Clear confirmation state: 0 = idle, 1 = first confirm, 2 = second confirm
  const [clearStep, setClearStep] = useState(0);
  const [isClearing, setIsClearing] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const emptyForm = {
    name: '',
    schoolId: adminProfile?.schoolId || '',
    workDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    startTime: '08:00',
    endTime: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    workload: 160,
    professorId: '',
    professorName: '',
    subject: '',
  };
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'schools'), (snap) => {
      setSchools(snap.docs.map((d) => ({ id: d.id, ...d.data() } as School)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!adminProfile) return;
    const q = query(
      collection(db, 'users'),
      where('schoolId', '==', adminProfile.schoolId),
      where('role', '==', 'professor')
    );
    const unsub = onSnapshot(q, (snap) => {
      setProfessors(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile)));
    });
    return () => unsub();
  }, [adminProfile]);

  useEffect(() => {
    if (!adminProfile) return;
    const q = query(collection(db, 'schedules'), where('schoolId', '==', adminProfile.schoolId));
    const unsub = onSnapshot(q, (snap) => {
      setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Schedule)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'schedules');
    });
    return () => unsub();
  }, [adminProfile]);

  const resetForm = () => {
    setFormData({ ...emptyForm, schoolId: adminProfile?.schoolId || '' });
    setEditingSchedule(null);
  };

  const toggleDay = (day: string) => {
    setFormData((prev) => ({
      ...prev,
      workDays: prev.workDays.includes(day)
        ? prev.workDays.filter((d) => d !== day)
        : [...prev.workDays, day],
    }));
  };

  const handleProfessorChange = (professorId: string) => {
    const professor = professors.find((p) => p.uid === professorId);
    setFormData((prev) => ({
      ...prev,
      professorId,
      professorName: professor?.displayName || '',
      subject: professor?.subject || prev.subject,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSchedule?.id) {
        await updateDoc(doc(db, 'schedules', editingSchedule.id), { ...formData });
      } else {
        await addDoc(collection(db, 'schedules'), {
          ...formData,
          createdAt: new Date().toISOString(),
        });
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'schedules');
    }
  };

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setFormData({
      name: schedule.name,
      schoolId: schedule.schoolId,
      workDays: schedule.workDays,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      lunchStart: schedule.lunchStart || '12:00',
      lunchEnd: schedule.lunchEnd || '13:00',
      workload: schedule.workload,
      professorId: schedule.professorId || '',
      professorName: schedule.professorName || '',
      subject: schedule.subject || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este quadro de horários?')) {
      try {
        await deleteDoc(doc(db, 'schedules', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'schedules');
      }
    }
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      const batch = writeBatch(db);
      schedules.forEach((s) => {
        if (s.id) batch.delete(doc(db, 'schedules', s.id));
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'schedules');
    } finally {
      setIsClearing(false);
      setClearStep(0);
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Quadro de Horários</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1e293b; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            p.subtitle { font-size: 12px; color: #64748b; margin-bottom: 24px; }
            .day-section { margin-bottom: 24px; break-inside: avoid; }
            .day-title { font-size: 14px; font-weight: bold; background: #f1f5f9; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #3b82f6; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #f8fafc; font-weight: bold; text-transform: uppercase; font-size: 10px; color: #64748b; padding: 6px 10px; border: 1px solid #e2e8f0; text-align: left; }
            td { padding: 6px 10px; border: 1px solid #e2e8f0; }
            tr:nth-child(even) td { background: #f8fafc; }
            .no-schedules { color: #94a3b8; font-size: 12px; padding: 8px 0; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const filtered = schedules.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.professorName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group filtered schedules by day for print view
  const schedulesByDay = ALL_DAYS.map((day) => ({
    day,
    label: DAY_LABELS[day],
    schedules: filtered.filter((s) => s.workDays.includes(day)),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Quadros de Horário</h1>
          <p className="text-slate-500 dark:text-slate-400">Defina os quadros de horário dos funcionários.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2 text-slate-600 dark:text-slate-400" onClick={handlePrint}>
            <Printer size={18} /> Imprimir Semana
          </Button>
          <Button
            variant="outline"
            className="gap-2 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={() => setClearStep(1)}
            disabled={schedules.length === 0}
          >
            <Eraser size={18} /> Limpar Quadro
          </Button>
          <Button className="gap-2" onClick={() => { resetForm(); setIsModalOpen(true); }}>
            <Plus size={18} /> Novo Quadro
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <Input
              placeholder="Buscar quadro, professor ou disciplina..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              Nenhum quadro de horário cadastrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nome</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Professor / Disciplina</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dias</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Horário</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Intervalo</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Carga</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((schedule) => (
                    <tr key={schedule.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <Calendar size={16} className="text-green-600 dark:text-green-400" />
                          </div>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{schedule.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {schedule.professorName ? (
                          <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{schedule.professorName}</p>
                            {schedule.subject && (
                              <p className="text-xs text-blue-600 dark:text-blue-400">{schedule.subject}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {ALL_DAYS.map((day) => (
                            <span
                              key={day}
                              className={cn(
                                'text-[10px] font-bold px-1.5 py-0.5 rounded',
                                schedule.workDays.includes(day)
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                              )}
                            >
                              {DAY_SHORT[day]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        {schedule.startTime} – {schedule.endTime}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        {schedule.lunchStart && schedule.lunchEnd
                          ? `${schedule.lunchStart} – ${schedule.lunchEnd}`
                          : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        {schedule.workload}h / mês
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <Button variant="ghost" size="sm" className="text-blue-600 dark:text-blue-400" onClick={() => handleEdit(schedule)}>
                          <Edit2 size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 dark:text-red-400" onClick={() => handleDelete(schedule.id!)}>
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden print content */}
      <div className="hidden">
        <div ref={printRef}>
          <h1>Quadro de Horários</h1>
          <p className="subtitle">Gerado em {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          {schedulesByDay.map(({ day, label, schedules: daySchedules }) => (
            <div key={day} className="day-section">
              <div className="day-title">{label}</div>
              {daySchedules.length === 0 ? (
                <p className="no-schedules">Nenhum horário cadastrado para este dia.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Professor</th>
                      <th>Disciplina</th>
                      <th>Entrada</th>
                      <th>Saída</th>
                      <th>Intervalo</th>
                      <th>Carga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daySchedules.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.professorName || '—'}</td>
                        <td>{s.subject || '—'}</td>
                        <td>{s.startTime}</td>
                        <td>{s.endTime}</td>
                        <td>{s.lunchStart && s.lunchEnd ? `${s.lunchStart} – ${s.lunchEnd}` : '—'}</td>
                        <td>{s.workload}h/mês</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Schedule Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
          <Card className="w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingSchedule ? 'Editar Quadro' : 'Novo Quadro de Horário'}</CardTitle>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={24} />
              </button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nome do Quadro *</label>
                  <Input
                    required
                    placeholder="Ex: Turno Matutino"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                {professors.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Professor</label>
                    <select
                      className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.professorId}
                      onChange={(e) => handleProfessorChange(e.target.value)}
                    >
                      <option value="">(Nenhum)</option>
                      {professors.map((p) => (
                        <option key={p.uid} value={p.uid}>
                          {p.displayName}{p.subject ? ` — ${p.subject}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Disciplina</label>
                  <Input
                    placeholder="Ex: Matemática"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  />
                  {formData.professorId && formData.subject && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Disciplina preenchida automaticamente com base no professor selecionado.
                    </p>
                  )}
                </div>

                {schools.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Escola</label>
                    <select
                      className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.schoolId}
                      onChange={(e) => setFormData({ ...formData, schoolId: e.target.value })}
                    >
                      <option value={adminProfile?.schoolId}>(Esta escola)</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Dias de Trabalho *</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_DAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
                          formData.workDays.includes(day)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                        )}
                      >
                        {DAY_SHORT[day]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Entrada *</label>
                    <Input
                      type="time"
                      required
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Saída *</label>
                    <Input
                      type="time"
                      required
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Início do Intervalo</label>
                    <Input
                      type="time"
                      value={formData.lunchStart}
                      onChange={(e) => setFormData({ ...formData, lunchStart: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fim do Intervalo</label>
                    <Input
                      type="time"
                      value={formData.lunchEnd}
                      onChange={(e) => setFormData({ ...formData, lunchEnd: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Carga Horária (h/mês) *</label>
                  <Input
                    type="number"
                    required
                    min={1}
                    value={formData.workload}
                    onChange={(e) => setFormData({ ...formData, workload: Number(e.target.value) })}
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1">
                    {editingSchedule ? 'Salvar Alterações' : 'Cadastrar Quadro'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* First clear confirmation */}
      {clearStep === 1 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
          <Card className="w-full max-w-sm shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-red-600 dark:text-red-400">Limpar Quadro de Horários</CardTitle>
              <button onClick={() => setClearStep(0)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={24} />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Tem certeza que deseja excluir <strong>todos os {schedules.length} quadros de horário</strong>? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setClearStep(0)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => setClearStep(2)}
                >
                  Sim, continuar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Second clear confirmation */}
      {clearStep === 2 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
          <Card className="w-full max-w-sm shadow-2xl border-2 border-red-400 dark:border-red-700">
            <CardHeader className="flex flex-row items-center justify-between bg-red-50 dark:bg-red-900/20 rounded-t-xl">
              <CardTitle className="text-red-700 dark:text-red-400">⚠️ Confirmação Final</CardTitle>
              <button onClick={() => setClearStep(0)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={24} />
              </button>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                Esta é sua última chance de cancelar.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Todos os quadros de horário serão <strong>permanentemente excluídos</strong>. Tem absoluta certeza?
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setClearStep(0)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleClearAll}
                  disabled={isClearing}
                >
                  {isClearing ? 'Limpando...' : 'Excluir Tudo'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
