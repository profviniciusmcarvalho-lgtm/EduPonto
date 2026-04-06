import React, { useEffect, useState, useMemo } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, doc, updateDoc, deleteDoc, getDocs,
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { Turma, Disciplina, QuadroHorario, PeriodoAula, DiaSemana, UserProfile } from '@/src/types';
import { CalendarDays, Plus, Trash2, X, Save, ChevronDown } from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Add 50 minutes to a HH:MM string */
function addFiftyMin(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 50;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const DIAS: { value: DiaSemana; label: string; short: string }[] = [
  { value: 'segunda',   label: 'Segunda-feira', short: 'Seg' },
  { value: 'terca',     label: 'Terça-feira',   short: 'Ter' },
  { value: 'quarta',    label: 'Quarta-feira',  short: 'Qua' },
  { value: 'quinta',    label: 'Quinta-feira',  short: 'Qui' },
  { value: 'sexta',     label: 'Sexta-feira',   short: 'Sex' },
  { value: 'sabado',    label: 'Sábado',        short: 'Sáb' },
];

const MAX_PERIODOS = 10;

const PERIOD_COLORS = [
  'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
  'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
  'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800',
  'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
  'bg-pink-50 border-pink-200 dark:bg-pink-900/20 dark:border-pink-800',
  'bg-teal-50 border-teal-200 dark:bg-teal-900/20 dark:border-teal-800',
];

function periodColor(idx: number) {
  return PERIOD_COLORS[idx % PERIOD_COLORS.length];
}

// ── types ─────────────────────────────────────────────────────────────────────

interface PeriodoForm {
  numero: number;
  horarioInicio: string;
  horarioFim: string;
  disciplinaId: string;
  professorId: string;
}

interface QuadroForm {
  turmaId: string;
  diaSemana: DiaSemana;
  periodos: PeriodoForm[];
}

const emptyPeriodo = (numero: number, prevEndTime?: string): PeriodoForm => {
  const inicio = prevEndTime ?? '07:00';
  return { numero, horarioInicio: inicio, horarioFim: addFiftyMin(inicio), disciplinaId: '', professorId: '' };
};

const emptyForm = (turmaId = '', dia: DiaSemana = 'segunda'): QuadroForm => ({
  turmaId,
  diaSemana: dia,
  periodos: [emptyPeriodo(1)],
});

// ── component ─────────────────────────────────────────────────────────────────

export function AdminQuadroHorarios() {
  const { profile: adminProfile } = useAuth();

  // firestore data
  const [turmas, setTurmas]         = useState<Turma[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [professores, setProfessores] = useState<UserProfile[]>([]);
  const [quadros, setQuadros]       = useState<QuadroHorario[]>([]);
  const [loading, setLoading]       = useState(true);

  // UI state
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('');
  const [isModalOpen, setIsModalOpen]  = useState(false);
  const [editingQuadro, setEditingQuadro] = useState<QuadroHorario | null>(null);
  const [formData, setFormData]        = useState<QuadroForm>(emptyForm());

  // ── load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!adminProfile) return;
    const schoolId = adminProfile.schoolId;

    const unsubTurmas = onSnapshot(
      query(collection(db, 'turmas'), where('schoolId', '==', schoolId)),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Turma));
        list.sort((a, b) => a.nome.localeCompare(b.nome));
        setTurmas(list);
        if (!selectedTurmaId && list.length > 0) setSelectedTurmaId(list[0].id!);
      },
      err => handleFirestoreError(err, OperationType.GET, 'turmas'),
    );

    const unsubDisc = onSnapshot(
      query(collection(db, 'disciplinas'), where('schoolId', '==', schoolId)),
      snap => setDisciplinas(snap.docs.map(d => ({ id: d.id, ...d.data() } as Disciplina))),
      err => handleFirestoreError(err, OperationType.GET, 'disciplinas'),
    );

    const unsubProf = onSnapshot(
      query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', '==', 'professor')),
      snap => setProfessores(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile))),
      err => handleFirestoreError(err, OperationType.GET, 'users'),
    );

    const unsubQuadros = onSnapshot(
      query(collection(db, 'quadroHorarios'), where('schoolId', '==', schoolId)),
      snap => {
        setQuadros(snap.docs.map(d => ({ id: d.id, ...d.data() } as QuadroHorario)));
        setLoading(false);
      },
      err => handleFirestoreError(err, OperationType.GET, 'quadroHorarios'),
    );

    return () => { unsubTurmas(); unsubDisc(); unsubProf(); unsubQuadros(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminProfile]);

  // ── derived data ───────────────────────────────────────────────────────────

  /** Map: diaSemana → QuadroHorario for the selected turma */
  const quadroByDay = useMemo(() => {
    const map: Partial<Record<DiaSemana, QuadroHorario>> = {};
    quadros
      .filter(q => q.turmaId === selectedTurmaId)
      .forEach(q => { map[q.diaSemana] = q; });
    return map;
  }, [quadros, selectedTurmaId]);

  // ── modal helpers ──────────────────────────────────────────────────────────

  const openCreate = (dia: DiaSemana) => {
    setEditingQuadro(null);
    setFormData(emptyForm(selectedTurmaId, dia));
    setIsModalOpen(true);
  };

  const openEdit = (quadro: QuadroHorario) => {
    setEditingQuadro(quadro);
    setFormData({
      turmaId: quadro.turmaId,
      diaSemana: quadro.diaSemana,
      periodos: quadro.periodos.map(p => ({
        numero: p.numero,
        horarioInicio: p.horarioInicio,
        horarioFim: p.horarioFim,
        disciplinaId: p.disciplinaId,
        professorId: p.professorId,
      })),
    });
    setIsModalOpen(true);
  };

  const addPeriodo = () => {
    setFormData(f => {
      const prev = f.periodos[f.periodos.length - 1];
      const newPeriodo = emptyPeriodo(f.periodos.length + 1, prev?.horarioFim);
      return { ...f, periodos: [...f.periodos, newPeriodo] };
    });
  };

  const removePeriodo = (idx: number) => {
    setFormData(f => ({
      ...f,
      periodos: f.periodos
        .filter((_, i) => i !== idx)
        .map((p, i) => ({ ...p, numero: i + 1 })),
    }));
  };

  const updatePeriodo = (idx: number, field: keyof PeriodoForm, value: string | number) => {
    setFormData(f => {
      const periodos = f.periodos.map((p, i) => {
        if (i !== idx) return p;
        const updated = { ...p, [field]: value };
        // auto-recalculate horarioFim when horarioInicio changes
        if (field === 'horarioInicio') {
          updated.horarioFim = addFiftyMin(value as string);
        }
        return updated;
      });
      return { ...f, periodos };
    });
  };

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;

    const turmaSel = turmas.find(t => t.id === formData.turmaId);
    if (!turmaSel) return;

    const periodos: PeriodoAula[] = formData.periodos.map(p => {
      const disc = disciplinas.find(d => d.id === p.disciplinaId);
      const prof = professores.find(pr => pr.uid === p.professorId);
      return {
        numero: p.numero,
        horarioInicio: p.horarioInicio,
        horarioFim: p.horarioFim,
        disciplinaId: p.disciplinaId,
        disciplinaNome: disc?.nome ?? '',
        professorId: p.professorId,
        professorNome: prof?.displayName ?? '',
      };
    });

    const payload: Omit<QuadroHorario, 'id'> = {
      turmaId: formData.turmaId,
      turmaNome: turmaSel.nome,
      diaSemana: formData.diaSemana,
      periodos,
      schoolId: adminProfile.schoolId,
      createdAt: editingQuadro?.createdAt ?? new Date().toISOString(),
    };

    try {
      if (editingQuadro?.id) {
        await updateDoc(doc(db, 'quadroHorarios', editingQuadro.id), { ...payload });
      } else {
        await addDoc(collection(db, 'quadroHorarios'), payload);
      }
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'quadroHorarios');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este dia do quadro?')) return;
    try {
      await deleteDoc(doc(db, 'quadroHorarios', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'quadroHorarios');
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  const selectedTurma = turmas.find(t => t.id === selectedTurmaId);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Quadro de Horários</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Organize os horários semanais por turma — cada aula tem 50 minutos
        </p>
      </div>

      {/* Turma selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 mr-1">Turma:</span>
            {loading ? (
              <span className="text-slate-400 text-sm">Carregando...</span>
            ) : turmas.length === 0 ? (
              <span className="text-slate-400 text-sm">Nenhuma turma cadastrada. Cadastre turmas primeiro.</span>
            ) : (
              turmas.map(turma => (
                <button
                  key={turma.id}
                  onClick={() => setSelectedTurmaId(turma.id!)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedTurmaId === turma.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {turma.nome}
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Schedule grid */}
      {selectedTurma && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays size={18} />
              {selectedTurma.nome} — {selectedTurma.serie}
              <span className="text-xs font-normal text-slate-500 capitalize ml-1">({selectedTurma.turno})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {DIAS.map(({ value: dia, label, short }) => {
                const quadro = quadroByDay[dia];
                return (
                  <div key={dia} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    {/* Day header */}
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
                      <div className="flex gap-1">
                        {quadro ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(quadro)}
                              className="h-6 px-2 text-xs">Editar</Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(quadro.id!)}
                              className="h-6 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10">
                              <Trash2 size={12} />
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => openCreate(dia)}
                            className="h-6 px-2 text-xs gap-1">
                            <Plus size={12} /> Aulas
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Periods */}
                    <div className="p-2 space-y-1.5 min-h-[80px]">
                      {quadro && quadro.periodos.length > 0 ? (
                        quadro.periodos.map((p, idx) => (
                          <div
                            key={p.numero}
                            className={`flex items-start gap-2 p-2 rounded border text-xs ${periodColor(idx)}`}
                          >
                            <span className="font-bold text-slate-500 dark:text-slate-400 w-4 shrink-0">
                              {p.numero}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {p.disciplinaNome || <span className="text-slate-400">—</span>}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400 truncate">{p.professorNome || '—'}</p>
                            </div>
                            <span className="shrink-0 text-slate-400 dark:text-slate-500 tabular-nums">
                              {p.horarioInicio}–{p.horarioFim}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-slate-400 text-xs py-4">Sem aulas</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal — Edit/Create day schedule */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl my-4">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {editingQuadro ? 'Editar Dia' : 'Adicionar Aulas'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {DIAS.find(d => d.value === formData.diaSemana)?.label} —{' '}
                  {turmas.find(t => t.id === formData.turmaId)?.nome}
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-3 max-h-[65vh] overflow-y-auto">
                {formData.periodos.map((periodo, idx) => (
                  <div key={idx} className={`p-3 rounded-lg border ${periodColor(idx)}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        {idx + 1}º Período
                      </span>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="tabular-nums">{periodo.horarioInicio} – {periodo.horarioFim}</span>
                        {formData.periodos.length > 1 && (
                          <button type="button" onClick={() => removePeriodo(idx)}
                            className="text-red-400 hover:text-red-600 ml-1">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Horário início */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Início
                        </label>
                        <input
                          type="time"
                          value={periodo.horarioInicio}
                          onChange={e => updatePeriodo(idx, 'horarioInicio', e.target.value)}
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                      {/* Horário fim (readonly, auto-calculated) */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Fim <span className="font-normal">(50 min)</span>
                        </label>
                        <input
                          type="time"
                          value={periodo.horarioFim}
                          readOnly
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 px-2 py-1.5 text-sm cursor-not-allowed"
                        />
                      </div>
                      {/* Disciplina */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Disciplina *
                        </label>
                        <select
                          value={periodo.disciplinaId}
                          onChange={e => updatePeriodo(idx, 'disciplinaId', e.target.value)}
                          required
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Selecione...</option>
                          {disciplinas.map(d => (
                            <option key={d.id} value={d.id}>{d.nome}</option>
                          ))}
                        </select>
                      </div>
                      {/* Professor */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Professor *
                        </label>
                        <select
                          value={periodo.professorId}
                          onChange={e => updatePeriodo(idx, 'professorId', e.target.value)}
                          required
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Selecione...</option>
                          {professores.map(p => (
                            <option key={p.uid} value={p.uid}>{p.displayName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                {formData.periodos.length < MAX_PERIODOS && (
                  <button
                    type="button"
                    onClick={addPeriodo}
                    className="w-full py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus size={14} /> Adicionar período
                  </button>
                )}
              </div>

              {/* Footer */}
              <div className="flex gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1 gap-2">
                  <Save size={14} /> {editingQuadro ? 'Salvar alterações' : 'Salvar quadro'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
