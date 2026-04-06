import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, doc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardContent } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { Turma, Disciplina, QuadroHorario, PeriodoAula, DiaSemana, UserProfile } from '@/src/types';
import {
  CalendarDays, Plus, Trash2, X, AlertTriangle, Users,
  LayoutGrid, BookUser, CheckCircle2, Circle,
} from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────────

function addFiftyMin(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 50;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Default start time for period N (period 1 = 07:00, +50 min each) */
function defaultPeriodStart(numero: number): string {
  const total = 7 * 60 + (numero - 1) * 50;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const DIAS: { value: DiaSemana; label: string; short: string }[] = [
  { value: 'segunda', label: 'Segunda-feira', short: 'Seg' },
  { value: 'terca',   label: 'Terça-feira',   short: 'Ter' },
  { value: 'quarta',  label: 'Quarta-feira',  short: 'Qua' },
  { value: 'quinta',  label: 'Quinta-feira',  short: 'Qui' },
  { value: 'sexta',   label: 'Sexta-feira',   short: 'Sex' },
  { value: 'sabado',  label: 'Sábado',        short: 'Sáb' },
];

const DEFAULT_PERIODS = [1, 2, 3, 4, 5, 6];

/** Tailwind cell colors — one per professor slot (cycling) */
const PROF_BG = [
  'bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700',
  'bg-green-100 border-green-300 dark:bg-green-900/40 dark:border-green-700',
  'bg-purple-100 border-purple-300 dark:bg-purple-900/40 dark:border-purple-700',
  'bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700',
  'bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700',
  'bg-teal-100 border-teal-300 dark:bg-teal-900/40 dark:border-teal-700',
  'bg-indigo-100 border-indigo-300 dark:bg-indigo-900/40 dark:border-indigo-700',
  'bg-orange-100 border-orange-300 dark:bg-orange-900/40 dark:border-orange-700',
  'bg-cyan-100 border-cyan-300 dark:bg-cyan-900/40 dark:border-cyan-700',
  'bg-pink-100 border-pink-300 dark:bg-pink-900/40 dark:border-pink-700',
];

const PROF_DOT = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500',
  'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-orange-500',
  'bg-cyan-500', 'bg-pink-500',
];

// ── types ──────────────────────────────────────────────────────────────────────

type ViewMode = 'escola' | 'professor';

interface CellKey { turmaId: string; diaSemana: DiaSemana; numero: number }

interface CellForm {
  disciplinaId: string;
  professorId: string;
  horarioInicio: string;
  horarioFim: string;
}

const emptyCellForm = (numero: number, existing?: PeriodoAula): CellForm => ({
  disciplinaId: existing?.disciplinaId ?? '',
  professorId:  existing?.professorId  ?? '',
  horarioInicio: existing?.horarioInicio ?? defaultPeriodStart(numero),
  horarioFim:    existing?.horarioFim    ?? addFiftyMin(defaultPeriodStart(numero)),
});

// ── component ──────────────────────────────────────────────────────────────────

export function AdminQuadroHorarios() {
  const { profile: adminProfile } = useAuth();

  // — data
  const [turmas, setTurmas]           = useState<Turma[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [professores, setProfessores] = useState<UserProfile[]>([]);
  const [quadros, setQuadros]         = useState<QuadroHorario[]>([]);
  const [loading, setLoading]         = useState(true);

  // — UI
  const [viewMode, setViewMode]           = useState<ViewMode>('escola');
  const [selectedDia, setSelectedDia]     = useState<DiaSemana>('segunda');
  const [selectedProfId, setSelectedProfId] = useState<string>('');
  const [editCell, setEditCell]           = useState<CellKey | null>(null);
  const [cellForm, setCellForm]           = useState<CellForm>(emptyCellForm(1));
  const [saving, setSaving]               = useState(false);

  // ── load data ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!adminProfile) return;
    const sid = adminProfile.schoolId;

    const u1 = onSnapshot(
      query(collection(db, 'turmas'), where('schoolId', '==', sid)),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Turma));
        list.sort((a, b) => a.nome.localeCompare(b.nome));
        setTurmas(list);
      },
      err => handleFirestoreError(err, OperationType.GET, 'turmas'),
    );

    const u2 = onSnapshot(
      query(collection(db, 'disciplinas'), where('schoolId', '==', sid)),
      snap => setDisciplinas(snap.docs.map(d => ({ id: d.id, ...d.data() } as Disciplina))),
      err => handleFirestoreError(err, OperationType.GET, 'disciplinas'),
    );

    const u3 = onSnapshot(
      query(collection(db, 'users'), where('schoolId', '==', sid), where('role', '==', 'professor')),
      snap => {
        const list = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
        list.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setProfessores(list);
      },
      err => handleFirestoreError(err, OperationType.GET, 'users'),
    );

    const u4 = onSnapshot(
      query(collection(db, 'quadroHorarios'), where('schoolId', '==', sid)),
      snap => {
        setQuadros(snap.docs.map(d => ({ id: d.id, ...d.data() } as QuadroHorario)));
        setLoading(false);
      },
      err => handleFirestoreError(err, OperationType.GET, 'quadroHorarios'),
    );

    return () => { u1(); u2(); u3(); u4(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminProfile]);

  // ── derived data ─────────────────────────────────────────────────────────────

  /** Map "turmaId_dia" → QuadroHorario doc */
  const quadroMap = useMemo(() => {
    const map = new Map<string, QuadroHorario>();
    quadros.forEach(q => map.set(`${q.turmaId}_${q.diaSemana}`, q));
    return map;
  }, [quadros]);

  const getCell = useCallback((turmaId: string, dia: DiaSemana, numero: number): PeriodoAula | undefined => {
    return quadroMap.get(`${turmaId}_${dia}`)?.periodos.find(p => p.numero === numero);
  }, [quadroMap]);

  /** All period numbers present for a given day (or default 1-6) */
  const periodNumsForDay = useCallback((dia: DiaSemana): number[] => {
    const nums = new Set<number>();
    quadros.filter(q => q.diaSemana === dia).forEach(q => q.periodos.forEach(p => nums.add(p.numero)));
    DEFAULT_PERIODS.forEach(n => nums.add(n));
    return Array.from(nums).sort((a, b) => a - b);
  }, [quadros]);

  /** Map profId → color index */
  const profColorIdx = useMemo(() => {
    const map = new Map<string, number>();
    professores.forEach((p, i) => map.set(p.uid, i));
    return map;
  }, [professores]);

  /** Map profId → total assigned periods across ALL days */
  const professorLoad = useMemo(() => {
    const map = new Map<string, number>();
    quadros.forEach(q =>
      q.periodos.forEach(p => {
        if (p.professorId) map.set(p.professorId, (map.get(p.professorId) ?? 0) + 1);
      }),
    );
    return map;
  }, [quadros]);

  /** Set of "turmaId_dia_numero" keys that have scheduling conflicts */
  const conflictKeys = useMemo(() => {
    const set = new Set<string>();
    DIAS.forEach(({ value: dia }) => {
      const seen = new Map<string, string[]>(); // "profId_num" → turmaIds
      quadros.filter(q => q.diaSemana === dia).forEach(q =>
        q.periodos.forEach(p => {
          if (!p.professorId) return;
          const key = `${p.professorId}_${p.numero}`;
          if (!seen.has(key)) seen.set(key, []);
          seen.get(key)!.push(q.turmaId);
        }),
      );
      seen.forEach((turmaIds, key) => {
        if (turmaIds.length > 1) {
          const num = key.split('_')[1];
          turmaIds.forEach(tid => set.add(`${tid}_${dia}_${num}`));
        }
      });
    });
    return set;
  }, [quadros]);

  /** Total conflicts count */
  const totalConflicts = conflictKeys.size;

  // ── cell editor ──────────────────────────────────────────────────────────────

  const openCell = (turmaId: string, dia: DiaSemana, numero: number) => {
    const existing = getCell(turmaId, dia, numero);
    setEditCell({ turmaId, diaSemana: dia, numero });
    setCellForm(emptyCellForm(numero, existing));
  };

  const handleSaveCell = async () => {
    if (!editCell || !adminProfile) return;
    setSaving(true);
    try {
      const { turmaId, diaSemana, numero } = editCell;
      const turma = turmas.find(t => t.id === turmaId);
      if (!turma) return;

      const disc = disciplinas.find(d => d.id === cellForm.disciplinaId);
      const prof = professores.find(p => p.uid === cellForm.professorId);

      const periodo: PeriodoAula = {
        numero,
        horarioInicio: cellForm.horarioInicio,
        horarioFim:    cellForm.horarioFim,
        disciplinaId:   cellForm.disciplinaId,
        disciplinaNome: disc?.nome ?? '',
        professorId:    cellForm.professorId,
        professorNome:  prof?.displayName ?? '',
      };

      const existing = quadroMap.get(`${turmaId}_${diaSemana}`);
      if (existing?.id) {
        const periodos = [
          ...existing.periodos.filter(p => p.numero !== numero),
          periodo,
        ].sort((a, b) => a.numero - b.numero);
        await updateDoc(doc(db, 'quadroHorarios', existing.id), { periodos });
      } else {
        await addDoc(collection(db, 'quadroHorarios'), {
          turmaId, turmaNome: turma.nome, diaSemana,
          periodos: [periodo],
          schoolId: adminProfile.schoolId,
          createdAt: new Date().toISOString(),
        });
      }
      setEditCell(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'quadroHorarios');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCell = async (turmaId: string, dia: DiaSemana, numero: number) => {
    const existing = quadroMap.get(`${turmaId}_${dia}`);
    if (!existing?.id) return;
    try {
      const periodos = existing.periodos.filter(p => p.numero !== numero);
      if (periodos.length === 0) {
        await deleteDoc(doc(db, 'quadroHorarios', existing.id));
      } else {
        await updateDoc(doc(db, 'quadroHorarios', existing.id), { periodos });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'quadroHorarios');
    }
    setEditCell(null);
  };

  // ── professor week view data ──────────────────────────────────────────────────

  /** Cells assigned to selectedProfId, grouped by day */
  const profWeek = useMemo(() => {
    const byDay: Partial<Record<DiaSemana, Array<{ turmaNome: string; periodo: PeriodoAula }>>> = {};
    if (!selectedProfId) return byDay;
    quadros.forEach(q => {
      q.periodos.forEach(p => {
        if (p.professorId !== selectedProfId) return;
        if (!byDay[q.diaSemana]) byDay[q.diaSemana] = [];
        byDay[q.diaSemana]!.push({ turmaNome: q.turmaNome, periodo: p });
      });
    });
    DIAS.forEach(({ value }) => {
      byDay[value]?.sort((a, b) => a.periodo.numero - b.periodo.numero);
    });
    return byDay;
  }, [quadros, selectedProfId]);

  // ── render ────────────────────────────────────────────────────────────────────

  const selectedProf = professores.find(p => p.uid === selectedProfId);

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Quadro de Horários</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Gerencie os horários de toda a escola · cada aula tem 50 min
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalConflicts > 0 && (
            <span className="flex items-center gap-1 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-2 py-1 rounded-full font-medium">
              <AlertTriangle size={12} /> {totalConflicts} conflito{totalConflicts !== 1 ? 's' : ''}
            </span>
          )}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('escola')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'escola'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <LayoutGrid size={14} /> Escola
            </button>
            <button
              onClick={() => setViewMode('professor')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-slate-200 dark:border-slate-700 ${
                viewMode === 'professor'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <BookUser size={14} /> Por Professor
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-slate-400">Carregando...</CardContent></Card>
      ) : turmas.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-slate-400">
          Nenhuma turma cadastrada. Cadastre turmas primeiro.
        </CardContent></Card>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════════════════
              VIEW: ESCOLA — grid por dia (linhas=períodos, colunas=turmas)
          ══════════════════════════════════════════════════════════════════ */}
          {viewMode === 'escola' && (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5">

              {/* Left: grid */}
              <div className="space-y-4">

                {/* Day tabs */}
                <div className="flex flex-wrap gap-1.5">
                  {DIAS.map(({ value, short, label }) => (
                    <button
                      key={value}
                      onClick={() => setSelectedDia(value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        selectedDia === value
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="hidden sm:inline">{label}</span>
                      <span className="sm:hidden">{short}</span>
                    </button>
                  ))}
                </div>

                {/* Schedule grid */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <table className="w-full text-sm border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70">
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400 w-24 border-b border-slate-200 dark:border-slate-700">
                          Período
                        </th>
                        {turmas.map(t => (
                          <th key={t.id} className="px-2 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-400 border-b border-l border-slate-200 dark:border-slate-700 min-w-[120px]">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{t.nome}</div>
                            <div className="text-xs font-normal text-slate-400">{t.serie}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periodNumsForDay(selectedDia).map(num => (
                        <tr key={num} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          {/* Period label */}
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                            <div className="font-semibold text-slate-700 dark:text-slate-300">{num}º aula</div>
                            <div className="text-xs tabular-nums text-slate-400">
                              {defaultPeriodStart(num)}–{addFiftyMin(defaultPeriodStart(num))}
                            </div>
                          </td>

                          {/* Cells — one per turma */}
                          {turmas.map(t => {
                            const cell = getCell(t.id!, selectedDia, num);
                            const isConflict = conflictKeys.has(`${t.id}_${selectedDia}_${num}`);
                            const ci = cell?.professorId ? (profColorIdx.get(cell.professorId) ?? 0) : -1;

                            return (
                              <td
                                key={t.id}
                                className="px-2 py-1.5 border-l border-slate-100 dark:border-slate-800"
                              >
                                <div
                                  onClick={() => openCell(t.id!, selectedDia, num)}
                                  className={`cursor-pointer rounded-lg border p-2 min-h-[56px] flex flex-col justify-center transition-all hover:shadow-sm ${
                                    cell
                                      ? `${PROF_BG[ci % PROF_BG.length]}`
                                      : 'bg-slate-50 dark:bg-slate-800/40 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                                  }`}
                                >
                                  {cell ? (
                                    <>
                                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-xs leading-tight truncate">
                                        {cell.disciplinaNome || '—'}
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                        {cell.professorNome || <span className="italic text-slate-400">Sem professor</span>}
                                      </p>
                                      <p className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                                        {cell.horarioInicio}–{cell.horarioFim}
                                      </p>
                                      {isConflict && (
                                        <span className="flex items-center gap-0.5 text-[10px] text-red-600 dark:text-red-400 mt-0.5 font-medium">
                                          <AlertTriangle size={10} /> conflito
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600 text-xs text-center w-full flex justify-center">
                                      <Plus size={14} />
                                    </span>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded border-dashed border border-slate-300 bg-slate-50" />
                    Clique para atribuir aula
                  </span>
                  {totalConflicts > 0 && (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertTriangle size={11} /> Professor alocado em duas turmas no mesmo horário
                    </span>
                  )}
                </div>
              </div>

              {/* Right: professor load panel */}
              <ProfessorLoadPanel
                professores={professores}
                professorLoad={professorLoad}
                profColorIdx={profColorIdx}
                onSelectProfessor={(uid) => { setSelectedProfId(uid); setViewMode('professor'); }}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              VIEW: PROFESSOR — week schedule for one professor
          ══════════════════════════════════════════════════════════════════ */}
          {viewMode === 'professor' && (
            <div className="space-y-4">

              {/* Professor selector */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Professor:</span>
                    <select
                      value={selectedProfId}
                      onChange={e => setSelectedProfId(e.target.value)}
                      className="flex-1 max-w-xs border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— selecione —</option>
                      {professores.map(p => (
                        <option key={p.uid} value={p.uid}>{p.displayName}</option>
                      ))}
                    </select>
                    {selectedProf && (
                      <span className="text-sm text-slate-500">
                        {professorLoad.get(selectedProf.uid) ?? 0} aulas atribuídas
                        {selectedProf.numeroAulas ? ` / ${selectedProf.numeroAulas} previstas` : ''}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {selectedProfId && (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <table className="w-full text-sm border-collapse min-w-[500px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70">
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400 w-24 border-b border-slate-200 dark:border-slate-700">
                          Período
                        </th>
                        {DIAS.map(({ value, label }) => (
                          <th key={value} className="px-2 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-400 border-b border-l border-slate-200 dark:border-slate-700 min-w-[110px]">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(
                        Object.values(profWeek).flatMap(slots => slots?.map(s => s.periodo.numero) ?? [])
                      )].sort((a, b) => a - b).concat(
                        DEFAULT_PERIODS.filter(n =>
                          !Object.values(profWeek).some(slots => slots?.some(s => s.periodo.numero === n))
                        )
                      ).filter((n, i, arr) => arr.indexOf(n) === i).sort((a, b) => a - b)
                      .map(num => (
                        <tr key={num} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                            <div className="font-semibold text-slate-700 dark:text-slate-300">{num}º aula</div>
                            <div className="text-xs tabular-nums text-slate-400">
                              {defaultPeriodStart(num)}
                            </div>
                          </td>
                          {DIAS.map(({ value: dia }) => {
                            const slot = profWeek[dia]?.find(s => s.periodo.numero === num);
                            return (
                              <td key={dia} className="px-2 py-1.5 border-l border-slate-100 dark:border-slate-800 text-center">
                                {slot ? (
                                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-2 py-1.5 text-xs">
                                    <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                      {slot.periodo.disciplinaNome || '—'}
                                    </p>
                                    <p className="text-slate-500 dark:text-slate-400 truncate">{slot.turmaNome}</p>
                                    <p className="text-[10px] text-slate-400 tabular-nums">
                                      {slot.periodo.horarioInicio}–{slot.periodo.horarioFim}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-slate-200 dark:text-slate-700 text-xs">–</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Cell Edit Modal ─────────────────────────────────────────────────────── */}
      {editCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {getCell(editCell.turmaId, editCell.diaSemana, editCell.numero) ? 'Editar Aula' : 'Atribuir Aula'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {turmas.find(t => t.id === editCell.turmaId)?.nome} ·{' '}
                  {DIAS.find(d => d.value === editCell.diaSemana)?.label} ·{' '}
                  {editCell.numero}º período
                </p>
              </div>
              <button onClick={() => setEditCell(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Início</label>
                  <Input
                    type="time"
                    value={cellForm.horarioInicio}
                    onChange={e => setCellForm(f => ({
                      ...f,
                      horarioInicio: e.target.value,
                      horarioFim: addFiftyMin(e.target.value),
                    }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Fim (auto)</label>
                  <Input type="time" value={cellForm.horarioFim} readOnly className="bg-slate-50 dark:bg-slate-800 cursor-not-allowed opacity-60" />
                </div>
              </div>

              {/* Disciplina */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Disciplina</label>
                <select
                  value={cellForm.disciplinaId}
                  onChange={e => setCellForm(f => ({ ...f, disciplinaId: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— selecione —</option>
                  {disciplinas.map(d => (
                    <option key={d.id} value={d.id}>{d.nome}</option>
                  ))}
                </select>
              </div>

              {/* Professor */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Professor</label>
                <select
                  value={cellForm.professorId}
                  onChange={e => setCellForm(f => ({ ...f, professorId: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— selecione —</option>
                  {professores.map(p => {
                    const load = professorLoad.get(p.uid) ?? 0;
                    const target = p.numeroAulas ?? 0;
                    const over = target > 0 && load >= target;
                    return (
                      <option key={p.uid} value={p.uid}>
                        {p.displayName}{over ? ` ⚠ (${load}/${target} aulas)` : target > 0 ? ` (${load}/${target})` : ` (${load} aulas)`}
                      </option>
                    );
                  })}
                </select>
                {/* Conflict warning */}
                {cellForm.professorId && conflictKeys.has(`${editCell.turmaId}_${editCell.diaSemana}_${editCell.numero}`) && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertTriangle size={11} /> Este professor já tem aula neste horário em outra turma.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 dark:border-slate-700 gap-2">
              {getCell(editCell.turmaId, editCell.diaSemana, editCell.numero) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10"
                  onClick={() => handleClearCell(editCell.turmaId, editCell.diaSemana, editCell.numero)}
                >
                  <Trash2 size={14} className="mr-1" /> Remover
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" size="sm" onClick={() => setEditCell(null)}>Cancelar</Button>
                <Button size="sm" onClick={handleSaveCell} disabled={saving || !cellForm.disciplinaId}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Professor Load Panel ───────────────────────────────────────────────────────

interface LoadPanelProps {
  professores: UserProfile[];
  professorLoad: Map<string, number>;
  profColorIdx: Map<string, number>;
  onSelectProfessor: (uid: string) => void;
}

function ProfessorLoadPanel({ professores, professorLoad, profColorIdx, onSelectProfessor }: LoadPanelProps) {
  if (professores.length === 0) {
    return (
      <Card>
        <CardContent className="pt-4 pb-4 text-center text-sm text-slate-400">
          Nenhum professor cadastrado.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="self-start">
      <div className="px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Carga dos Professores</h3>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">Aulas atribuídas vs. previstas</p>
      </div>
      <CardContent className="pt-3 pb-3 space-y-3">
        {professores.map(p => {
          const assigned = professorLoad.get(p.uid) ?? 0;
          const target   = p.numeroAulas ?? 0;
          const ci       = profColorIdx.get(p.uid) ?? 0;
          const pct      = target > 0 ? Math.min(100, Math.round((assigned / target) * 100)) : 0;
          const over     = target > 0 && assigned > target;
          const done     = target > 0 && assigned === target;

          return (
            <div key={p.uid} className="space-y-1">
              <div className="flex items-center justify-between gap-1">
                <button
                  onClick={() => onSelectProfessor(p.uid)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 truncate max-w-[160px] text-left"
                >
                  <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${PROF_DOT[ci % PROF_DOT.length]}`} />
                  {p.displayName}
                </button>
                <span className={`text-xs tabular-nums shrink-0 ${
                  over ? 'text-red-500 font-bold' : done ? 'text-green-600 font-semibold' : 'text-slate-500'
                }`}>
                  {assigned}{target > 0 ? `/${target}` : ''}
                  {done && <CheckCircle2 size={11} className="inline ml-0.5 text-green-500" />}
                  {over && <AlertTriangle size={11} className="inline ml-0.5 text-red-500" />}
                </span>
              </div>
              {target > 0 ? (
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      over ? 'bg-red-500' : done ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : (
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-slate-300 dark:bg-slate-600"
                    style={{ width: assigned > 0 ? '100%' : '0%' }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
