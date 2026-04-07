import React, { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, doc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { HorarioAula } from '@/src/types';
import { Clock, Plus, Edit2, Trash2, X } from 'lucide-react';

// ── constants ──────────────────────────────────────────────────────────────────

const TURNOS = [
  { value: 'matutino',   label: 'Matutino',   color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { value: 'vespertino', label: 'Vespertino',  color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  { value: 'noturno',    label: 'Noturno',     color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { value: 'integral',   label: 'Integral',    color: 'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-300' },
] as const;

type Turno = typeof TURNOS[number]['value'];

const TURNO_COLOR: Record<string, string> = Object.fromEntries(
  TURNOS.map(t => [t.value, t.color]),
);

const emptyForm = {
  turno: 'matutino' as Turno,
  numero: 1,
  horarioInicio: '07:00',
  horarioFim: '07:50',
};

// ── helpers ────────────────────────────────────────────────────────────────────

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ── component ──────────────────────────────────────────────────────────────────

export function AdminHorarios() {
  const { profile: adminProfile } = useAuth();
  const [horarios, setHorarios] = useState<HorarioAula[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTurno, setActiveTurno] = useState<Turno>('matutino');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHorario, setEditingHorario] = useState<HorarioAula | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  // ── load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!adminProfile) return;
    const q = query(
      collection(db, 'horarios'),
      where('schoolId', '==', adminProfile.schoolId),
      orderBy('turno', 'asc'),
      orderBy('numero', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        setHorarios(snap.docs.map(d => ({ id: d.id, ...d.data() } as HorarioAula)));
        setLoading(false);
      },
      err => handleFirestoreError(err, OperationType.GET, 'horarios'),
    );
    return () => unsub();
  }, [adminProfile]);

  // ── actions ─────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingHorario(null);
    const periodosTurno = horarios.filter(h => h.turno === activeTurno);
    const proximoNumero = periodosTurno.length > 0
      ? Math.max(...periodosTurno.map(h => h.numero)) + 1
      : 1;
    const ultimoHorario = periodosTurno.find(h => h.numero === proximoNumero - 1);
    const proximoInicio = ultimoHorario
      ? addMinutes(ultimoHorario.horarioFim, 10)
      : activeTurno === 'vespertino' ? '13:00'
      : activeTurno === 'noturno'    ? '18:30'
      : '07:00';
    setFormData({
      turno: activeTurno,
      numero: proximoNumero,
      horarioInicio: proximoInicio,
      horarioFim: addMinutes(proximoInicio, 50),
    });
    setIsModalOpen(true);
  };

  const openEdit = (h: HorarioAula) => {
    setEditingHorario(h);
    setFormData({
      turno: h.turno,
      numero: h.numero,
      horarioInicio: h.horarioInicio,
      horarioFim: h.horarioFim,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    try {
      if (editingHorario?.id) {
        await updateDoc(doc(db, 'horarios', editingHorario.id), { ...formData });
      } else {
        await addDoc(collection(db, 'horarios'), {
          ...formData,
          schoolId: adminProfile.schoolId,
          createdAt: new Date().toISOString(),
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'horarios');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este horário?')) return;
    try {
      await deleteDoc(doc(db, 'horarios', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'horarios');
    }
  };

  // Auto-update end time when start time changes
  const handleInicioChange = (value: string) => {
    setFormData(f => ({ ...f, horarioInicio: value, horarioFim: addMinutes(value, 50) }));
  };

  const filteredHorarios = horarios.filter(h => h.turno === activeTurno);

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Horários de Aula</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Cadastre os períodos de aula por turno escolar
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} /> Novo Horário
        </Button>
      </div>

      {/* Turno tabs */}
      <div className="flex gap-2 flex-wrap">
        {TURNOS.map(t => (
          <button
            key={t.value}
            onClick={() => setActiveTurno(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              activeTurno === t.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
              activeTurno === t.value ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}>
              {horarios.filter(h => h.turno === t.value).length}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock size={18} />
            {TURNOS.find(t => t.value === activeTurno)?.label} — Períodos Cadastrados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-slate-500 py-8">Carregando...</p>
          ) : filteredHorarios.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Clock size={40} className="mx-auto mb-3 opacity-30" />
              <p>Nenhum horário cadastrado para este turno.</p>
              <Button variant="ghost" onClick={openCreate} className="mt-3 gap-2 text-blue-600">
                <Plus size={14} /> Adicionar primeiro período
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400 w-24">Período</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Turno</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Início</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Término</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Duração</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHorarios.map(h => {
                    const [hI, mI] = h.horarioInicio.split(':').map(Number);
                    const [hF, mF] = h.horarioFim.split(':').map(Number);
                    const duracao = (hF * 60 + mF) - (hI * 60 + mI);
                    return (
                      <tr key={h.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold text-sm">
                            {h.numero}º
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={TURNO_COLOR[h.turno]}>
                            {TURNOS.find(t => t.value === h.turno)?.label ?? h.turno}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                          {h.horarioInicio}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                          {h.horarioFim}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-xs">
                          {duracao > 0 ? `${duracao} min` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(h)}>
                              <Edit2 size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(h.id!)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingHorario ? 'Editar Horário' : 'Novo Horário de Aula'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Turno */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Turno *
                </label>
                <select
                  value={formData.turno}
                  onChange={e => setFormData(f => ({ ...f, turno: e.target.value as Turno }))}
                  required
                  className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TURNOS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Número do período */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Número do Período *
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={formData.numero}
                  onChange={e => setFormData(f => ({ ...f, numero: Number(e.target.value) }))}
                  required
                />
              </div>

              {/* Horários */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Horário de Início *
                  </label>
                  <Input
                    type="time"
                    value={formData.horarioInicio}
                    onChange={e => handleInicioChange(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Horário de Término *
                  </label>
                  <Input
                    type="time"
                    value={formData.horarioFim}
                    onChange={e => setFormData(f => ({ ...f, horarioFim: e.target.value }))}
                    required
                  />
                </div>
              </div>

              {/* Duration preview */}
              {formData.horarioInicio && formData.horarioFim && (() => {
                const [hI, mI] = formData.horarioInicio.split(':').map(Number);
                const [hF, mF] = formData.horarioFim.split(':').map(Number);
                const dur = (hF * 60 + mF) - (hI * 60 + mI);
                return dur > 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Duração: <span className="font-semibold text-blue-600 dark:text-blue-400">{dur} minutos</span>
                  </p>
                ) : null;
              })()}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1">
                  {editingHorario ? 'Salvar Alterações' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
