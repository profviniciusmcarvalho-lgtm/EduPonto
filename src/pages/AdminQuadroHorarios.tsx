import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
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
import { Turma, Disciplina, QuadroHorario, PeriodoAula, DiaSemana, UserProfile, HorarioAula, NivelEnsino } from '@/src/types';
import { NIVEIS } from '@/src/pages/AdminTurmas';
import {
  CalendarDays, Plus, Trash2, X, AlertTriangle, Users,
  LayoutGrid, BookUser, CheckCircle2, Copy, GripVertical,
  MoveHorizontal, CopyPlus, Printer,
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

type ViewMode = 'escola' | 'professor' | 'geral';

interface CellKey { turmaId: string; diaSemana: DiaSemana; numero: number }

interface CellForm {
  disciplinaId: string;
  professorId: string;
  horarioInicio: string;
  horarioFim: string;
  room: string;
  cancelled: boolean;
  cancelReason: string;
  substituteTeacherId: string;
}

const emptyCellForm = (numero: number, existing?: PeriodoAula, defaultTimes?: { horarioInicio: string; horarioFim: string }): CellForm => ({
  disciplinaId: existing?.disciplinaId ?? '',
  professorId:  existing?.professorId  ?? '',
  horarioInicio: existing?.horarioInicio ?? defaultTimes?.horarioInicio ?? defaultPeriodStart(numero),
  horarioFim:    existing?.horarioFim    ?? defaultTimes?.horarioFim    ?? addFiftyMin(defaultPeriodStart(numero)),
  room:          existing?.room          ?? '',
  cancelled:     existing?.cancelled     ?? false,
  cancelReason:  existing?.cancelReason  ?? '',
  substituteTeacherId: existing?.substituteTeacherId ?? '',
});

/** Strip undefined values recursively — Firestore rejects `undefined` fields */
function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

// ── component ──────────────────────────────────────────────────────────────────

export function AdminQuadroHorarios() {
  const { profile: adminProfile } = useAuth();
  const location = useLocation();

  // — data
  const [turmas, setTurmas]           = useState<Turma[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [professores, setProfessores] = useState<UserProfile[]>([]);
  const [quadros, setQuadros]         = useState<QuadroHorario[]>([]);
  const [horariosAula, setHorariosAula] = useState<HorarioAula[]>([]);
  const [loading, setLoading]         = useState(true);

  // — UI
  const [viewMode, setViewMode]           = useState<ViewMode>('escola');
  const [selectedDia, setSelectedDia]     = useState<DiaSemana>('segunda');
  const [selectedProfId, setSelectedProfId] = useState<string>('');
  const [editCell, setEditCell]           = useState<CellKey | null>(null);
  const [cellForm, setCellForm]           = useState<CellForm>(emptyCellForm(1));
  const [saving, setSaving]               = useState(false);

  // — filters
  const [filterTurmaId, setFilterTurmaId] = useState<string>('');
  const [filterProfId, setFilterProfId]   = useState<string>('');
  const [filterTurno, setFilterTurno]     = useState<'' | 'matutino' | 'vespertino' | 'noturno' | 'integral'>('');
  const [filterNivel, setFilterNivel]     = useState<NivelEnsino | ''>('');
  const [filterGeralTurno, setFilterGeralTurno] = useState<string>('');

  // — copy schedule
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyFromTurmaId, setCopyFromTurmaId] = useState('');
  const [copyToTurmaId, setCopyToTurmaId]     = useState('');
  const [copyFromDia, setCopyFromDia]         = useState<DiaSemana | ''>('');
  const [copyToDia, setCopyToDia]             = useState<DiaSemana | ''>('');
  const [copying, setCopying]                 = useState(false);

  // — drag & drop (move or copy)
  const [dragMode, setDragMode] = useState<'move' | 'copy'>('move');
  const [dragSource, setDragSource] = useState<CellKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // — copy cell picker
  const [copyPickerSource, setCopyPickerSource] = useState<CellKey | null>(null);
  const [copyPickerTargetTurma, setCopyPickerTargetTurma] = useState('');
  const [copyPickerTargetDia, setCopyPickerTargetDia] = useState<DiaSemana | ''>('');
  const [copyPickerTargetNum, setCopyPickerTargetNum] = useState<number | ''>('');
  const [copyPickerSaving, setCopyPickerSaving] = useState(false);

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
        list.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
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

    const u5 = onSnapshot(
      query(collection(db, 'horarios'), where('schoolId', '==', sid)),
      snap => setHorariosAula(snap.docs.map(d => ({ id: d.id, ...d.data() } as HorarioAula))),
      err => handleFirestoreError(err, OperationType.GET, 'horarios'),
    );

    return () => { u1(); u2(); u3(); u4(); u5(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminProfile]);

  // ── read URL param ?prof=<uid> to auto-select professor ──────────────────────
  useEffect(() => {
    const profId = new URLSearchParams(location.search).get('prof');
    if (profId && professores.some(p => p.uid === profId)) {
      setSelectedProfId(profId);
      setViewMode('professor');
    }
  // Only re-run when professores list is loaded (or location changes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professores, location.search]);

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

  /** All period numbers present for a given day (or default 1-6, or from horarios) */
  const periodNumsForDay = useCallback((dia: DiaSemana): number[] => {
    const nums = new Set<number>();
    quadros.filter(q => q.diaSemana === dia).forEach(q => q.periodos.forEach(p => nums.add(p.numero)));
    DEFAULT_PERIODS.forEach(n => nums.add(n));
    // Also include numbers defined in horarios for the turnos of visible turmas
    horariosAula.forEach(h => nums.add(h.numero));
    return Array.from(nums).sort((a, b) => a - b);
  }, [quadros, horariosAula]);

  /** Map profId → color index */
  const profColorIdx = useMemo(() => {
    const map = new Map<string, number>();
    professores.forEach((p, i) => map.set(p.uid, i));
    return map;
  }, [professores]);

  /** Map "turno_numero" → HorarioAula — for looking up real times by turno + period */
  const horarioMap = useMemo(() => {
    const map = new Map<string, HorarioAula>();
    horariosAula.forEach(h => map.set(`${h.turno}_${h.numero}`, h));
    return map;
  }, [horariosAula]);

  /** Return real horario times for a turma's period, falling back to hardcoded defaults */
  const getHorarioTimes = useCallback((turmaId: string, numero: number): { horarioInicio: string; horarioFim: string } => {
    const turno = turmas.find(t => t.id === turmaId)?.turno;
    const h = turno ? horarioMap.get(`${turno}_${numero}`) : undefined;
    if (h) return { horarioInicio: h.horarioInicio, horarioFim: h.horarioFim };
    const inicio = defaultPeriodStart(numero);
    return { horarioInicio: inicio, horarioFim: addFiftyMin(inicio) };
  }, [turmas, horarioMap]);

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

  /** Turmas filtered for escola/geral views */
  const filteredTurmas = useMemo(
    () => turmas
      .filter(t => !filterTurmaId || t.id === filterTurmaId)
      .filter(t => !filterTurno || t.turno === filterTurno)
      .filter(t => !filterNivel || t.nivel === filterNivel),
    [turmas, filterTurmaId, filterTurno, filterNivel],
  );

  const TURNO_COLORS: Record<string, string> = {
    matutino: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    vespertino: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    noturno: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    integral: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  };

  // ── cell editor ──────────────────────────────────────────────────────────────

  const openCell = (turmaId: string, dia: DiaSemana, numero: number) => {
    const existing = getCell(turmaId, dia, numero);
    setEditCell({ turmaId, diaSemana: dia, numero });
    const defaultTimes = existing ? undefined : getHorarioTimes(turmaId, numero);
    setCellForm(emptyCellForm(numero, existing, defaultTimes));
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

      const subst = cellForm.substituteTeacherId
        ? professores.find(p => p.uid === cellForm.substituteTeacherId)
        : undefined;

      const periodo: PeriodoAula = {
        numero,
        horarioInicio: cellForm.horarioInicio,
        horarioFim:    cellForm.horarioFim,
        disciplinaId:   cellForm.disciplinaId,
        disciplinaNome: disc?.nome ?? '',
        professorId:    cellForm.professorId,
        professorNome:  prof?.displayName ?? '',
        ...(cellForm.room        ? { room: cellForm.room }               : {}),
        ...(cellForm.cancelled   ? { cancelled: true }                   : {}),
        ...(cellForm.cancelReason ? { cancelReason: cellForm.cancelReason } : {}),
        ...(subst ? { substituteTeacherId: subst.uid, substituteTeacherNome: subst.displayName } : {}),
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

  // ── drag & drop move / copy ───────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, turmaId: string, dia: DiaSemana, numero: number) => {
    setDragSource({ turmaId, diaSemana: dia, numero });
    e.dataTransfer.effectAllowed = dragMode === 'move' ? 'move' : 'copy';
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragOverKey(null);
  };

  const handleDragOver = (e: React.DragEvent, turmaId: string, dia: DiaSemana, numero: number) => {
    if (!dragSource) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragMode === 'move' ? 'move' : 'copy';
    setDragOverKey(`${turmaId}_${dia}_${numero}`);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOverKey(null);
    }
  };

  const handleDropCell = async (turmaId: string, dia: DiaSemana, numero: number) => {
    setDragOverKey(null);
    if (!dragSource || !adminProfile) { setDragSource(null); return; }
    if (dragSource.turmaId === turmaId && dragSource.diaSemana === dia && dragSource.numero === numero) {
      setDragSource(null);
      return;
    }
    const sourceCell = getCell(dragSource.turmaId, dragSource.diaSemana, dragSource.numero);
    if (!sourceCell) { setDragSource(null); return; }

    const { horarioInicio, horarioFim } = getHorarioTimes(turmaId, numero);
    const periodo: PeriodoAula = stripUndefined({
      ...sourceCell,
      numero,
      horarioInicio,
      horarioFim,
      cancelled: false,
      cancelReason: undefined,
      substituteTeacherId: undefined,
      substituteTeacherNome: undefined,
    });

    const turma = turmas.find(t => t.id === turmaId);
    if (!turma) { setDragSource(null); return; }

    setSaving(true);
    try {
      // Detect same-doc scenario: source and dest belong to the same Firestore document
      const isSameDoc = dragSource.turmaId === turmaId && dragSource.diaSemana === dia;

      if (isSameDoc && dragMode === 'move') {
        // Single atomic update: swap period number without touching other periods
        const srcQuadro = quadroMap.get(`${turmaId}_${dia}`);
        if (srcQuadro?.id) {
          const periodos = [
            ...srcQuadro.periodos.filter(p => p.numero !== dragSource.numero && p.numero !== numero),
            periodo,
          ].sort((a, b) => a.numero - b.numero);
          await updateDoc(doc(db, 'quadroHorarios', srcQuadro.id), { periodos });
        } else {
          // Source existed (we got sourceCell), so this shouldn't happen — graceful fallback
          await addDoc(collection(db, 'quadroHorarios'), {
            turmaId, turmaNome: turma.nome, diaSemana: dia,
            periodos: [periodo], schoolId: adminProfile.schoolId,
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        // Different docs (or copy mode) — write destination first, then remove source if moving
        const existing = quadroMap.get(`${turmaId}_${dia}`);
        if (existing?.id) {
          const periodos = [
            ...existing.periodos.filter(p => p.numero !== numero),
            periodo,
          ].sort((a, b) => a.numero - b.numero);
          await updateDoc(doc(db, 'quadroHorarios', existing.id), { periodos });
        } else {
          await addDoc(collection(db, 'quadroHorarios'), {
            turmaId,
            turmaNome: turma.nome,
            diaSemana: dia,
            periodos: [periodo],
            schoolId: adminProfile.schoolId,
            createdAt: new Date().toISOString(),
          });
        }

        // If MOVE mode, clear the source cell from its own doc
        if (dragMode === 'move') {
          const srcQuadro = quadroMap.get(`${dragSource.turmaId}_${dragSource.diaSemana}`);
          if (srcQuadro?.id) {
            const srcPeriodos = srcQuadro.periodos.filter(p => p.numero !== dragSource.numero);
            if (srcPeriodos.length === 0) {
              await deleteDoc(doc(db, 'quadroHorarios', srcQuadro.id));
            } else {
              await updateDoc(doc(db, 'quadroHorarios', srcQuadro.id), { periodos: srcPeriodos });
            }
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'quadroHorarios');
    } finally {
      setSaving(false);
      setDragSource(null);
    }
  };

  const handleCopySchedule = async () => {
    if (!copyFromTurmaId || !copyToTurmaId || !adminProfile) return;
    setCopying(true);
    try {
      const sourceDocs = copyFromDia
        ? quadros.filter(q => q.turmaId === copyFromTurmaId && q.diaSemana === copyFromDia)
        : quadros.filter(q => q.turmaId === copyFromTurmaId);

      const toTurma = turmas.find(t => t.id === copyToTurmaId);
      if (!toTurma) return;

      for (const src of sourceDocs) {
        const targetDia = (copyFromDia && copyToDia) ? copyToDia : src.diaSemana;
        const existingTarget = quadroMap.get(`${copyToTurmaId}_${targetDia}`);
        const periodos = src.periodos.map(p => stripUndefined({
          ...p,
          cancelled: false,
          cancelReason: undefined,
          substituteTeacherId: undefined,
          substituteTeacherNome: undefined,
        }));

        if (existingTarget?.id) {
          await updateDoc(doc(db, 'quadroHorarios', existingTarget.id), { periodos });
        } else {
          await addDoc(collection(db, 'quadroHorarios'), {
            turmaId: copyToTurmaId,
            turmaNome: toTurma.nome,
            diaSemana: targetDia,
            periodos,
            schoolId: adminProfile.schoolId,
            createdAt: new Date().toISOString(),
          });
        }
      }
      setShowCopyDialog(false);
      setCopyFromTurmaId(''); setCopyToTurmaId(''); setCopyFromDia(''); setCopyToDia('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'quadroHorarios');
    } finally {
      setCopying(false);
    }
  };

  // ── professor week view data ──────────────────────────────────────────────────

  const handlePrint = () => {
    window.print();
  };

  /** Cells assigned to selectedProfId, grouped by day */
  const profWeek = useMemo(() => {
    const byDay: Partial<Record<DiaSemana, Array<{ turmaNome: string; turmaId: string; periodo: PeriodoAula }>>> = {};
    if (!selectedProfId) return byDay;
    quadros.forEach(q => {
      q.periodos.forEach(p => {
        if (p.professorId !== selectedProfId) return;
        if (!byDay[q.diaSemana]) byDay[q.diaSemana] = [];
        byDay[q.diaSemana]!.push({ turmaNome: q.turmaNome, turmaId: q.turmaId, periodo: p });
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
    <>
      <style>{`
        @media print {
          body > div > div > aside,
          body > div > div > div > header,
          .no-print { display: none !important; }
          #quadro-print-area {
            width: 100% !important;
            overflow: visible !important;
          }
        }
      `}</style>
      <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Quadro de Horários</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Gerencie os horários de toda a escola · cada aula tem 50 min
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          {totalConflicts > 0 && (
            <span className="flex items-center gap-1 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-2 py-1 rounded-full font-medium">
              <AlertTriangle size={12} /> {totalConflicts} conflito{totalConflicts !== 1 ? 's' : ''}
            </span>
          )}
          {/* Drag mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 text-xs font-medium">
            <button
              onClick={() => setDragMode('move')}
              title="Mover: o card sai da origem ao soltar"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
                dragMode === 'move'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <MoveHorizontal size={13} /> Mover
            </button>
            <button
              onClick={() => setDragMode('copy')}
              title="Copiar: o card permanece na origem ao soltar"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 border-l border-slate-200 dark:border-slate-700 transition-colors ${
                dragMode === 'copy'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <CopyPlus size={13} /> Copiar
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrint}
            className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700"
          >
            <Printer size={14} /> Imprimir
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCopyDialog(true)}
            className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700"
          >
            <Copy size={14} /> Copiar Quadro
          </Button>
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
            <button
              onClick={() => setViewMode('geral')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-slate-200 dark:border-slate-700 ${
                viewMode === 'geral'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <CalendarDays size={14} /> Quadro Geral
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

              {/* Filter bar */}
                <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Filtrar:</span>
                  <select
                    value={filterTurmaId}
                    onChange={e => setFilterTurmaId(e.target.value)}
                    className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todas as turmas</option>
                    {turmas.map(t => (
                      <option key={t.id} value={t.id!}>{t.nome} {t.turno ? `(${t.turno})` : ''}</option>
                    ))}
                  </select>
                  <select
                    value={filterProfId}
                    onChange={e => setFilterProfId(e.target.value)}
                    className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todos os professores</option>
                    {professores.map(p => (
                      <option key={p.uid} value={p.uid}>{p.displayName}</option>
                    ))}
                  </select>
                  {/* Turno filter chips */}
                  {(['matutino', 'vespertino', 'noturno', 'integral'] as const).map(turno => (
                    <button
                      key={turno}
                      onClick={() => setFilterTurno(filterTurno === turno ? '' : turno)}
                      className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors capitalize ${
                        filterTurno === turno
                          ? TURNO_COLORS[turno]
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {turno}
                    </button>
                  ))}
                  {/* Nivel filter chips */}
                  {NIVEIS.map(({ value, label, color }) => (
                    <button
                      key={value}
                      onClick={() => setFilterNivel(filterNivel === value ? '' : value)}
                      className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        filterNivel === value
                          ? color
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {(filterTurmaId || filterProfId || filterTurno || filterNivel) && (
                    <button
                      onClick={() => { setFilterTurmaId(''); setFilterProfId(''); setFilterTurno(''); setFilterNivel(''); }}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    >
                      <X size={12} /> Limpar filtros
                    </button>
                  )}
                </div>

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

                {/* Print title — only shown when printing */}
                <div className="hidden print:block text-center mb-4">
                  <h1 className="text-xl font-bold">Quadro de Horários</h1>
                  <p className="text-sm">{DIAS.find(d => d.value === selectedDia)?.label} — {new Date().toLocaleDateString('pt-BR')}</p>
                </div>

                {/* Schedule grid */}
                <div id="quadro-print-area" className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <table className="w-full text-sm border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70">
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400 w-24 border-b border-slate-200 dark:border-slate-700">
                          Período
                        </th>
                        {filteredTurmas.map(t => (
                          <th key={t.id} className="px-2 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-400 border-b border-l border-slate-200 dark:border-slate-700 min-w-[120px]">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{t.nome}</div>
                            <div className="text-xs font-normal text-slate-400">{t.serie}</div>
                            {t.turno && (
                              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-0.5 ${TURNO_COLORS[t.turno] ?? ''}`}>
                                {t.turno}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periodNumsForDay(selectedDia).map(num => (
                        <tr key={num} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          {/* Period label — shows real times when possible */}
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                            <div className="font-semibold text-slate-700 dark:text-slate-300">{num}º aula</div>
                            {(() => {
                              const uniqueTurnos = [...new Set(filteredTurmas.map(t => t.turno).filter(Boolean))];
                              if (uniqueTurnos.length === 1) {
                                const h = horarioMap.get(`${uniqueTurnos[0]}_${num}`);
                                if (h) return (
                                  <div className="text-xs tabular-nums text-slate-400">{h.horarioInicio}–{h.horarioFim}</div>
                                );
                              } else if (uniqueTurnos.length > 1) {
                                // Show times per turno as small stacked badges
                                const lines = uniqueTurnos
                                  .map(turno => horarioMap.get(`${turno}_${num}`))
                                  .filter(Boolean) as HorarioAula[];
                                if (lines.length > 0) return (
                                  <div className="flex flex-col gap-0.5">
                                    {lines.map(h => (
                                      <span key={h.turno} className="text-[9px] tabular-nums text-slate-400 leading-tight">
                                        {h.horarioInicio}–{h.horarioFim}
                                      </span>
                                    ))}
                                  </div>
                                );
                              }
                              return (
                                <div className="text-xs tabular-nums text-slate-400">
                                  {defaultPeriodStart(num)}–{addFiftyMin(defaultPeriodStart(num))}
                                </div>
                              );
                            })()}
                          </td>

                          {/* Cells — one per turma */}
                          {filteredTurmas.map(t => {
                            const cell = getCell(t.id!, selectedDia, num);
                            const isConflict = conflictKeys.has(`${t.id}_${selectedDia}_${num}`);
                            const ci = cell?.professorId ? (profColorIdx.get(cell.professorId) ?? 0) : -1;
                            const dimmed = filterProfId && cell?.professorId !== filterProfId;
                            const isCancelled = cell?.cancelled;

                            return (
                              <td
                                key={t.id}
                                className="px-2 py-1.5 border-l border-slate-100 dark:border-slate-800"
                              >
                                {/* Drop target wrapper — no draggable here */}
                                <div
                                  onDragOver={(e) => handleDragOver(e, t.id!, selectedDia, num)}
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) => { e.preventDefault(); handleDropCell(t.id!, selectedDia, num); }}
                                  className={`relative rounded-lg border p-2 min-h-[56px] flex flex-col justify-center transition-all hover:shadow-sm ${dimmed ? 'opacity-30' : ''} ${
                                    dragOverKey === `${t.id}_${selectedDia}_${num}` && dragSource
                                      ? dragMode === 'move'
                                        ? 'ring-2 ring-amber-400 ring-offset-1 border-amber-400 bg-amber-50 dark:bg-amber-900/20 scale-[1.02]'
                                        : 'ring-2 ring-blue-400 ring-offset-1 border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]'
                                      : dragSource?.turmaId === t.id && dragSource?.diaSemana === selectedDia && dragSource?.numero === num
                                        ? dragMode === 'move'
                                          ? 'opacity-20 scale-95 border-dashed border-slate-400'
                                          : 'opacity-50 scale-95'
                                        : isCancelled
                                          ? 'bg-slate-100 dark:bg-slate-800/60 border-slate-300 dark:border-slate-600 opacity-70'
                                          : cell
                                            ? PROF_BG[ci % PROF_BG.length]
                                            : 'bg-slate-50 dark:bg-slate-800/40 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                                  }`}
                                >
                                  {cell ? (
                                    <>
                                      {/* Visible drag handle — top-right of card */}
                                      <div
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, t.id!, selectedDia, num)}
                                        onDragEnd={handleDragEnd}
                                        onClick={(e) => e.stopPropagation()}
                                        title={dragMode === 'move' ? 'Arraste para mover esta aula' : 'Arraste para copiar esta aula'}
                                        className="absolute top-1 right-1 cursor-grab active:cursor-grabbing p-0.5 rounded opacity-30 hover:opacity-90 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity z-10"
                                      >
                                        <GripVertical size={13} className="text-slate-600 dark:text-slate-300" />
                                      </div>

                                      {/* Copy button */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCopyPickerSource({ turmaId: t.id!, diaSemana: selectedDia, numero: num });
                                          setCopyPickerTargetTurma('');
                                          setCopyPickerTargetDia('');
                                          setCopyPickerTargetNum('');
                                        }}
                                        title="Copiar esta aula para outro horário"
                                        className="absolute top-1 right-5 p-0.5 rounded opacity-30 hover:opacity-90 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity z-10"
                                      >
                                        <Copy size={11} className="text-slate-600 dark:text-slate-300" />
                                      </button>

                                      {/* Card content — click to edit */}
                                      <div
                                        onClick={() => openCell(t.id!, selectedDia, num)}
                                        className="cursor-pointer pr-4"
                                      >
                                        <p className={`font-semibold text-slate-800 dark:text-slate-100 text-xs leading-tight truncate ${isCancelled ? 'line-through text-slate-400' : ''}`}>
                                          {cell.disciplinaNome || '—'}
                                        </p>
                                        {isCancelled ? (
                                          <span className="text-[10px] text-red-500 font-medium mt-0.5">Cancelada{cell.cancelReason ? `: ${cell.cancelReason}` : ''}</span>
                                        ) : (
                                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                            {cell.substituteTeacherId
                                              ? <span className="text-amber-600 dark:text-amber-400">↔ {cell.substituteTeacherNome?.split(' ')[0]}</span>
                                              : cell.professorNome || <span className="italic text-slate-400">Sem professor</span>
                                            }
                                          </p>
                                        )}
                                        <p className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                                          {cell.horarioInicio}–{cell.horarioFim}
                                          {cell.room && <span className="ml-1 text-blue-500">· {cell.room}</span>}
                                        </p>
                                        {isConflict && !isCancelled && (
                                          <span className="flex items-center gap-0.5 text-[10px] text-red-600 dark:text-red-400 mt-0.5 font-medium">
                                            <AlertTriangle size={10} /> conflito
                                          </span>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <span
                                      onClick={() => openCell(t.id!, selectedDia, num)}
                                      className="cursor-pointer text-slate-300 dark:text-slate-600 text-xs text-center w-full flex justify-center"
                                    >
                                      {dragSource
                                        ? dragMode === 'move'
                                          ? <MoveHorizontal size={14} className="text-amber-400" />
                                          : <GripVertical size={14} className="text-blue-300" />
                                        : <Plus size={14} />
                                      }
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
                  <span className="flex items-center gap-1">
                    <GripVertical size={11} />
                    Arraste pelo ícone ⠿ para mover/copiar aulas
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
                            const dropKey = slot ? `${slot.turmaId}_${dia}_${num}` : `prof_${dia}_${num}`;
                            const isDropTarget = !!dragSource && dragOverKey === dropKey;
                            const isSource = !!slot && dragSource?.turmaId === slot.turmaId && dragSource?.diaSemana === dia && dragSource?.numero === num;
                            return (
                              <td key={dia} className="px-2 py-1.5 border-l border-slate-100 dark:border-slate-800">
                                <div
                                  onDragOver={(e) => {
                                    if (!dragSource) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = dragMode === 'move' ? 'move' : 'copy';
                                    setDragOverKey(dropKey);
                                  }}
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const targetTurmaId = slot ? slot.turmaId : dragSource?.turmaId;
                                    if (targetTurmaId) handleDropCell(targetTurmaId, dia, num);
                                  }}
                                  className={`relative rounded-lg border p-2 min-h-[56px] flex flex-col justify-center transition-all ${
                                    isDropTarget
                                      ? dragMode === 'move'
                                        ? 'ring-2 ring-amber-400 ring-offset-1 border-amber-400 bg-amber-50 dark:bg-amber-900/20 scale-[1.02]'
                                        : 'ring-2 ring-blue-400 ring-offset-1 border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]'
                                      : isSource
                                        ? dragMode === 'move'
                                          ? 'opacity-20 scale-95 border-dashed border-slate-400'
                                          : 'opacity-50 scale-95 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
                                        : slot
                                          ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 hover:shadow-sm'
                                          : 'bg-slate-50 dark:bg-slate-800/40 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                                  }`}
                                >
                                  {slot ? (
                                    <>
                                      {/* Drag handle */}
                                      <div
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, slot.turmaId, dia, num)}
                                        onDragEnd={handleDragEnd}
                                        onClick={(e) => e.stopPropagation()}
                                        title={dragMode === 'move' ? 'Arraste para mover esta aula' : 'Arraste para copiar esta aula'}
                                        className="absolute top-1 right-1 cursor-grab active:cursor-grabbing p-0.5 rounded opacity-30 hover:opacity-90 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity z-10"
                                      >
                                        <GripVertical size={13} className="text-slate-600 dark:text-slate-300" />
                                      </div>
                                      {/* Copy button */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCopyPickerSource({ turmaId: slot.turmaId, diaSemana: dia, numero: num });
                                          setCopyPickerTargetTurma('');
                                          setCopyPickerTargetDia('');
                                          setCopyPickerTargetNum('');
                                        }}
                                        title="Copiar esta aula para outro horário/turma"
                                        className="absolute top-1 right-5 p-0.5 rounded opacity-30 hover:opacity-90 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity z-10"
                                      >
                                        <Copy size={11} className="text-slate-600 dark:text-slate-300" />
                                      </button>
                                      <div className="pr-8 text-xs">
                                        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                          {slot.periodo.disciplinaNome || '—'}
                                        </p>
                                        <p className="text-slate-500 dark:text-slate-400 truncate">{slot.turmaNome}</p>
                                        <p className="text-[10px] text-slate-400 tabular-nums">
                                          {slot.periodo.horarioInicio}–{slot.periodo.horarioFim}
                                        </p>
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-slate-200 dark:text-slate-700 text-xs flex justify-center">
                                      {dragSource
                                        ? dragMode === 'move'
                                          ? <MoveHorizontal size={14} className="text-amber-400" />
                                          : <GripVertical size={14} className="text-blue-300" />
                                        : '–'
                                      }
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
              )}

              {/* Legend */}
              <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <GripVertical size={11} />
                  Arraste pelo ícone ⠿ para mover/copiar aulas entre dias e períodos
                </span>
                <span className="flex items-center gap-1">
                  <Copy size={11} />
                  Clique em ⧉ para copiar a aula para outra turma ou horário
                </span>
              </div>
            </div>
          )}
          {/* ══════════════════════════════════════════════════════════════════
              VIEW: QUADRO GERAL — all turmas organized by turno, full week
          ══════════════════════════════════════════════════════════════════ */}
          {viewMode === 'geral' && (
            <div className="space-y-5">
              {/* Turno filter */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Turno:</span>
                {['', 'matutino', 'vespertino', 'noturno', 'integral'].map(turno => (
                  <button
                    key={turno}
                    onClick={() => setFilterGeralTurno(turno)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filterGeralTurno === turno
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {turno === '' ? 'Todos' : turno.charAt(0).toUpperCase() + turno.slice(1)}
                  </button>
                ))}
              </div>

              {/* Grid: one card per turma */}
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
                {(filterGeralTurno
                  ? turmas.filter(t => t.turno === filterGeralTurno)
                  : turmas
                ).map(turma => {
                  const allNums = new Set<number>(DEFAULT_PERIODS);
                  DIAS.forEach(({ value: dia }) => {
                    quadroMap.get(`${turma.id}_${dia}`)?.periodos.forEach(p => allNums.add(p.numero));
                  });
                  const nums = Array.from(allNums).sort((a, b) => a - b);

                  return (
                    <div key={turma.id} className="rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                      {/* Turma header */}
                      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700">
                        <div>
                          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{turma.nome}</h3>
                          <p className="text-xs text-slate-400">{turma.serie}</p>
                        </div>
                        {turma.turno && (
                          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold ${TURNO_COLORS[turma.turno] ?? ''}`}>
                            {turma.turno.charAt(0).toUpperCase() + turma.turno.slice(1)}
                          </span>
                        )}
                      </div>
                      {/* Week mini-grid */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse min-w-[420px]">
                          <thead>
                            <tr className="bg-slate-50/80 dark:bg-slate-800/50">
                              <th className="px-2 py-1.5 text-left font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-700 w-16">
                                Aula
                              </th>
                              {DIAS.map(({ value, short }) => (
                                <th key={value} className="px-1.5 py-1.5 text-center font-semibold text-slate-500 border-b border-l border-slate-200 dark:border-slate-700 min-w-[68px]">
                                  {short}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {nums.map(num => (
                              <tr key={num} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                                <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400 font-medium">
                                  {num}º
                                  <div className="text-[10px] tabular-nums text-slate-300 dark:text-slate-600">
                                    {defaultPeriodStart(num)}
                                  </div>
                                </td>
                                {DIAS.map(({ value: dia }) => {
                                  const cell = getCell(turma.id!, dia, num);
                                  const isConflict = conflictKeys.has(`${turma.id}_${dia}_${num}`);
                                  const ci = cell?.professorId ? (profColorIdx.get(cell.professorId) ?? 0) : -1;
                                  const dimProfFilter = filterProfId && cell?.professorId !== filterProfId;
                                  return (
                                    <td key={dia} className={`px-1 py-1 border-l border-slate-100 dark:border-slate-800 text-center ${dimProfFilter ? 'opacity-30' : ''}`}>
                                      {cell ? (
                                        <div className={`rounded px-1 py-1 ${PROF_BG[ci % PROF_BG.length]}`}>
                                          <p className="font-semibold text-slate-800 dark:text-slate-100 truncate leading-tight">
                                            {cell.disciplinaNome || '—'}
                                          </p>
                                          <p className="text-slate-500 dark:text-slate-400 truncate text-[10px]">
                                            {cell.professorNome?.split(' ')[0] ?? ''}
                                          </p>
                                          {isConflict && <AlertTriangle size={9} className="inline text-red-500" />}
                                        </div>
                                      ) : (
                                        <span className="text-slate-200 dark:text-slate-700">–</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Professor filter for geral */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-xs font-medium text-slate-500">Filtrar por professor:</span>
                <select
                  value={filterProfId}
                  onChange={e => setFilterProfId(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos os professores</option>
                  {professores.map(p => (
                    <option key={p.uid} value={p.uid}>{p.displayName}</option>
                  ))}
                </select>
                {filterProfId && (
                  <button
                    onClick={() => setFilterProfId('')}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10"
                  >
                    <X size={12} /> Limpar
                  </button>
                )}
              </div>
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

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
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

              {/* Room */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Sala / Local</label>
                <Input
                  placeholder="ex: Sala 201, Lab. Informática"
                  value={cellForm.room}
                  onChange={e => setCellForm(f => ({ ...f, room: e.target.value }))}
                />
              </div>

              {/* Substitute teacher */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Professor Substituto</label>
                <select
                  value={cellForm.substituteTeacherId}
                  onChange={e => setCellForm(f => ({ ...f, substituteTeacherId: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— nenhum —</option>
                  {professores.filter(p => p.uid !== cellForm.professorId).map(p => (
                    <option key={p.uid} value={p.uid}>{p.displayName}</option>
                  ))}
                </select>
                {cellForm.substituteTeacherId && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    ↔ Aula será ministrada pelo substituto
                  </p>
                )}
              </div>

              {/* Cancel toggle */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cellForm.cancelled}
                    onChange={e => setCellForm(f => ({ ...f, cancelled: e.target.checked }))}
                    className="w-4 h-4 rounded accent-red-500"
                  />
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">Marcar aula como cancelada</span>
                </label>
                {cellForm.cancelled && (
                  <Input
                    placeholder="Motivo do cancelamento (opcional)"
                    value={cellForm.cancelReason}
                    onChange={e => setCellForm(f => ({ ...f, cancelReason: e.target.value }))}
                    className="text-xs"
                  />
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
      {/* ── Copy Schedule Dialog ──────────────────────────────────────────────────── */}
      {showCopyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Copiar Quadro de Horários</h2>
                <p className="text-xs text-slate-500 mt-0.5">Copie os horários de uma turma/dia para outra</p>
              </div>
              <button onClick={() => setShowCopyDialog(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Origem</p>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Turma</label>
                    <select
                      value={copyFromTurmaId}
                      onChange={e => setCopyFromTurmaId(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— selecione —</option>
                      {turmas.map(t => <option key={t.id} value={t.id!}>{t.nome}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Dia (opcional)</label>
                    <select
                      value={copyFromDia}
                      onChange={e => setCopyFromDia(e.target.value as DiaSemana | '')}
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Todos os dias</option>
                      {DIAS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Destino</p>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Turma</label>
                    <select
                      value={copyToTurmaId}
                      onChange={e => setCopyToTurmaId(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— selecione —</option>
                      {turmas.filter(t => t.id !== copyFromTurmaId).map(t => <option key={t.id} value={t.id!}>{t.nome}</option>)}
                    </select>
                  </div>
                  {copyFromDia && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Dia destino</label>
                      <select
                        value={copyToDia}
                        onChange={e => setCopyToDia(e.target.value as DiaSemana | '')}
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Mesmo dia</option>
                        {DIAS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
                ⚠ Horários existentes no destino serão sobrescritos. Cancelamentos e substitutos não são copiados.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700">
              <Button variant="ghost" size="sm" onClick={() => setShowCopyDialog(false)}>Cancelar</Button>
              <Button
                size="sm"
                onClick={handleCopySchedule}
                disabled={copying || !copyFromTurmaId || !copyToTurmaId}
              >
                {copying ? 'Copiando...' : 'Copiar Horários'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Copy Cell Picker Modal ── */}
      {copyPickerSource && (() => {
        const srcCell = getCell(copyPickerSource.turmaId, copyPickerSource.diaSemana, copyPickerSource.numero);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Copiar Aula</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                {srcCell?.disciplinaNome} · {srcCell?.professorNome}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Turma destino</label>
                  <select
                    value={copyPickerTargetTurma}
                    onChange={e => setCopyPickerTargetTurma(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione a turma...</option>
                    {turmas.map(t => <option key={t.id} value={t.id!}>{t.nome} ({t.turno})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Dia da semana</label>
                  <select
                    value={copyPickerTargetDia}
                    onChange={e => setCopyPickerTargetDia(e.target.value as DiaSemana)}
                    className="w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione o dia...</option>
                    {DIAS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Período (aula)</label>
                  <select
                    value={copyPickerTargetNum}
                    onChange={e => setCopyPickerTargetNum(Number(e.target.value))}
                    className="w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione o período...</option>
                    {DEFAULT_PERIODS.map(n => <option key={n} value={n}>{n}º aula</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setCopyPickerSource(null)}>Cancelar</Button>
                <Button
                  size="sm"
                  disabled={!copyPickerTargetTurma || !copyPickerTargetDia || !copyPickerTargetNum || copyPickerSaving}
                  onClick={async () => {
                    if (!copyPickerTargetTurma || !copyPickerTargetDia || !copyPickerTargetNum || !adminProfile) return;
                    const srcCell = getCell(copyPickerSource.turmaId, copyPickerSource.diaSemana, copyPickerSource.numero);
                    if (!srcCell) return;
                    setCopyPickerSaving(true);
                    try {
                      const { horarioInicio, horarioFim } = getHorarioTimes(copyPickerTargetTurma, copyPickerTargetNum as number);
                      const periodo: PeriodoAula = stripUndefined({
                        ...srcCell,
                        numero: copyPickerTargetNum as number,
                        horarioInicio,
                        horarioFim,
                        cancelled: false,
                        cancelReason: undefined,
                        substituteTeacherId: undefined,
                        substituteTeacherNome: undefined,
                      });
                      const turma = turmas.find(t => t.id === copyPickerTargetTurma);
                      if (!turma) return;
                      const existing = quadroMap.get(`${copyPickerTargetTurma}_${copyPickerTargetDia}`);
                      if (existing?.id) {
                        const periodos = [
                          ...existing.periodos.filter(p => p.numero !== copyPickerTargetNum),
                          periodo,
                        ].sort((a, b) => a.numero - b.numero);
                        await updateDoc(doc(db, 'quadroHorarios', existing.id), { periodos });
                      } else {
                        await addDoc(collection(db, 'quadroHorarios'), {
                          turmaId: copyPickerTargetTurma,
                          turmaNome: turma.nome,
                          diaSemana: copyPickerTargetDia,
                          periodos: [periodo],
                          schoolId: adminProfile.schoolId,
                          createdAt: new Date().toISOString(),
                        });
                      }
                      setCopyPickerSource(null);
                    } catch (err) {
                      handleFirestoreError(err, OperationType.WRITE, 'quadroHorarios');
                    } finally {
                      setCopyPickerSaving(false);
                    }
                  }}
                >
                  {copyPickerSaving ? 'Copiando...' : 'Copiar'}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </>
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
