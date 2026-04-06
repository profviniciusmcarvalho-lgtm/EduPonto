import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot,
  addDoc, doc, updateDoc,
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardContent } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { Turma, Disciplina, QuadroHorario, PeriodoAula, DiaSemana, UserProfile } from '@/src/types';
import {
  Users, Plus, Trash2, X, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, CalendarDays,
} from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────────

function addFiftyMin(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 50;
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

// ── types ──────────────────────────────────────────────────────────────────────

interface AulaAtribuida {
  quadroId: string;
  diaSemana: DiaSemana;
  turmaId: string;
  turmaNome: string;
  numero: number;
  horarioInicio: string;
  horarioFim: string;
  disciplinaId: string;
  disciplinaNome: string;
}

interface SlotForm {
  turmaId: string;
  diaSemana: DiaSemana;
  numero: number;
  horarioInicio: string;
  disciplinaId: string;
}

const emptySlot = (): SlotForm => ({
  turmaId: '',
  diaSemana: 'segunda',
  numero: 1,
  horarioInicio: '07:00',
  disciplinaId: '',
});

// ── component ──────────────────────────────────────────────────────────────────

export function AdminFormacaoHorarios() {
  const { profile: adminProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [professores, setProfessores] = useState<UserProfile[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [quadros, setQuadros] = useState<QuadroHorario[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<SlotForm>(emptySlot());
  const [saving, setSaving] = useState(false);

  const selectedProfId = searchParams.get('prof') ?? null;

  // ── load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!adminProfile) return;
    const schoolId = adminProfile.schoolId;

    const unsubProf = onSnapshot(
      query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', '==', 'professor')),
      snap => {
        const list = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
        list.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setProfessores(list);
      },
      err => handleFirestoreError(err, OperationType.GET, 'users'),
    );

    const unsubTurmas = onSnapshot(
      query(collection(db, 'turmas'), where('schoolId', '==', schoolId)),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Turma));
        list.sort((a, b) => a.nome.localeCompare(b.nome));
        setTurmas(list);
      },
      err => handleFirestoreError(err, OperationType.GET, 'turmas'),
    );

    const unsubDisc = onSnapshot(
      query(collection(db, 'disciplinas'), where('schoolId', '==', schoolId)),
      snap => setDisciplinas(snap.docs.map(d => ({ id: d.id, ...d.data() } as Disciplina))),
      err => handleFirestoreError(err, OperationType.GET, 'disciplinas'),
    );

    const unsubQuadros = onSnapshot(
      query(collection(db, 'quadroHorarios'), where('schoolId', '==', schoolId)),
      snap => {
        setQuadros(snap.docs.map(d => ({ id: d.id, ...d.data() } as QuadroHorario)));
        setLoading(false);
      },
      err => handleFirestoreError(err, OperationType.GET, 'quadroHorarios'),
    );

    return () => { unsubProf(); unsubTurmas(); unsubDisc(); unsubQuadros(); };
  }, [adminProfile]);

  // ── derived: aulas por professor ─────────────────────────────────────────

  const aulasPorProf = useMemo(() => {
    const map: Record<string, AulaAtribuida[]> = {};
    quadros.forEach(q => {
      q.periodos.forEach(p => {
        if (!p.professorId) return;
        if (!map[p.professorId]) map[p.professorId] = [];
        map[p.professorId].push({
          quadroId: q.id!,
          diaSemana: q.diaSemana,
          turmaId: q.turmaId,
          turmaNome: q.turmaNome,
          numero: p.numero,
          horarioInicio: p.horarioInicio,
          horarioFim: p.horarioFim,
          disciplinaId: p.disciplinaId,
          disciplinaNome: p.disciplinaNome,
        });
      });
    });
    return map;
  }, [quadros]);

  const selectedProf = professores.find(p => p.uid === selectedProfId) ?? null;
  const selectedAulas = selectedProfId ? (aulasPorProf[selectedProfId] ?? []) : [];
  const targetAulas = selectedProf?.numeroAulas ?? 0;
  const assignedAulas = selectedAulas.length;
  const progress = targetAulas > 0 ? Math.min(100, Math.round((assignedAulas / targetAulas) * 100)) : 0;

  // ── handlers ─────────────────────────────────────────────────────────────

  const openAddModal = () => {
    setFormData(emptySlot());
    setIsModalOpen(true);
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile || !selectedProfId || !selectedProf) return;
    setSaving(true);

    try {
      const turma = turmas.find(t => t.id === formData.turmaId);
      const disc = disciplinas.find(d => d.id === formData.disciplinaId);
      const horarioFim = addFiftyMin(formData.horarioInicio);

      const newPeriod: PeriodoAula = {
        numero: formData.numero,
        horarioInicio: formData.horarioInicio,
        horarioFim,
        disciplinaId: formData.disciplinaId,
        disciplinaNome: disc?.nome ?? '',
        professorId: selectedProfId,
        professorNome: selectedProf.displayName,
      };

      const existing = quadros.find(
        q => q.turmaId === formData.turmaId && q.diaSemana === formData.diaSemana,
      );

      if (existing?.id) {
        const periodos = existing.periodos.filter(p => p.numero !== formData.numero);
        periodos.push(newPeriod);
        periodos.sort((a, b) => a.numero - b.numero);
        await updateDoc(doc(db, 'quadroHorarios', existing.id), { periodos });
      } else {
        await addDoc(collection(db, 'quadroHorarios'), {
          turmaId: formData.turmaId,
          turmaNome: turma?.nome ?? '',
          diaSemana: formData.diaSemana,
          periodos: [newPeriod],
          schoolId: adminProfile.schoolId,
          createdAt: new Date().toISOString(),
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'quadroHorarios');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSlot = async (quadroId: string, periodoNum: number) => {
    const quadro = quadros.find(q => q.id === quadroId);
    if (!quadro || !confirm('Remover esta aula do horário?')) return;
    try {
      const periodos = quadro.periodos.filter(p => p.numero !== periodoNum);
      await updateDoc(doc(db, 'quadroHorarios', quadroId), { periodos });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'quadroHorarios');
    }
  };

  const selectProf = (uid: string) => setSearchParams({ prof: uid });
  const clearProf = () => setSearchParams({});

  // ── render ────────────────────────────────────────────────────────────────

  const inputCls =
    'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users size={22} /> Formação de Horários
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Atribua aulas aos professores. Os horários aparecem automaticamente no{' '}
            <button
              onClick={() => navigate('/quadro-horarios')}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Quadro de Horários
            </button>.
          </p>
        </div>
        {selectedProfId && (
          <Button onClick={openAddModal} className="gap-2" size="sm">
            <Plus size={14} /> Adicionar Aula
          </Button>
        )}
      </div>

      {/* ── PROFESSOR LIST ── */}
      {!selectedProfId ? (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Carregando...</div>
            ) : professores.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                Nenhum professor cadastrado. Cadastre professores em{' '}
                <button
                  onClick={() => navigate('/usuarios')}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Gestão de Usuários
                </button>.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {professores.map(prof => {
                  const assigned = (aulasPorProf[prof.uid] ?? []).length;
                  const target = prof.numeroAulas ?? 0;
                  const pct = target > 0 ? Math.min(100, Math.round((assigned / target) * 100)) : 0;
                  const complete = target > 0 && assigned >= target;

                  return (
                    <button
                      key={prof.uid}
                      onClick={() => selectProf(prof.uid)}
                      className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left transition-colors"
                    >
                      <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
                        {prof.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {prof.displayName}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full max-w-[140px]">
                            <div
                              className={`h-2 rounded-full transition-all ${complete ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {assigned}/{target} aulas/sem
                          </span>
                          {complete && <CheckCircle2 size={13} className="text-green-500 shrink-0" />}
                          {!complete && target > 0 && <AlertCircle size={13} className="text-amber-400 shrink-0" />}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* ── PROFESSOR DETAIL ── */
        <div className="space-y-4">
          {/* Back */}
          <button
            onClick={clearProf}
            className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ChevronLeft size={16} /> Voltar à lista de professores
          </button>

          {/* Professor card + progress */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xl shrink-0">
                  {selectedProf!.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedProf!.displayName}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{selectedProf!.email}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex-1 h-3 bg-slate-200 dark:bg-slate-700 rounded-full">
                      <div
                        className={`h-3 rounded-full transition-all ${progress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span
                      className={`text-sm font-bold tabular-nums shrink-0 ${
                        progress >= 100 ? 'text-green-600 dark:text-green-400' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {assignedAulas}/{targetAulas} aulas atribuídas
                    </span>
                    {progress >= 100
                      ? <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                      : <AlertCircle size={18} className="text-amber-400 shrink-0" />}
                  </div>
                  {targetAulas === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      ⚠ Defina o nº de aulas semanais no cadastro do professor para ver o progresso.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* View in schedule board */}
          <button
            onClick={() => navigate('/quadro-horarios')}
            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            <CalendarDays size={14} /> Ver no Quadro de Horários
          </button>

          {/* Classes grouped by day */}
          {selectedAulas.length === 0 ? (
            <div className="text-center py-10 text-slate-400 dark:text-slate-500">
              Nenhuma aula atribuída. Clique em{' '}
              <button
                onClick={openAddModal}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                + Adicionar Aula
              </button>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {DIAS.map(({ value: dia, label }) => {
                const aulasNoDia = selectedAulas
                  .filter(a => a.diaSemana === dia)
                  .sort((a, b) => a.numero - b.numero);
                if (aulasNoDia.length === 0) return null;
                return (
                  <Card key={dia}>
                    <CardContent className="p-4">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                        {label} — {aulasNoDia.length} aula{aulasNoDia.length > 1 ? 's' : ''}
                      </h3>
                      <div className="space-y-2">
                        {aulasNoDia.map(aula => (
                          <div
                            key={`${aula.quadroId}-${aula.numero}`}
                            className="flex items-start gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                {aula.numero}º · {aula.turmaNome} ·{' '}
                                {aula.disciplinaNome || <span className="text-slate-400">—</span>}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                {aula.horarioInicio}–{aula.horarioFim}
                              </p>
                            </div>
                            <button
                              onClick={() => handleRemoveSlot(aula.quadroId, aula.numero)}
                              className="p-1 text-red-400 hover:text-red-600 rounded shrink-0"
                              title="Remover aula"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ADD SLOT MODAL ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Adicionar Aula</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  para {selectedProf?.displayName}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddSlot} className="p-6 space-y-4">
              {/* Turma */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Turma *
                </label>
                <select
                  value={formData.turmaId}
                  onChange={e => setFormData(f => ({ ...f, turmaId: e.target.value }))}
                  required
                  className={inputCls}
                >
                  <option value="">Selecione a turma</option>
                  {turmas.map(t => (
                    <option key={t.id} value={t.id!}>
                      {t.nome} — {t.serie}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dia + Período */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Dia da semana *
                  </label>
                  <select
                    value={formData.diaSemana}
                    onChange={e => setFormData(f => ({ ...f, diaSemana: e.target.value as DiaSemana }))}
                    required
                    className={inputCls}
                  >
                    {DIAS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nº do Período *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.numero}
                    onChange={e => setFormData(f => ({ ...f, numero: parseInt(e.target.value) || 1 }))}
                    required
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Horário */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Horário de Início *
                </label>
                <input
                  type="time"
                  value={formData.horarioInicio}
                  onChange={e => setFormData(f => ({ ...f, horarioInicio: e.target.value }))}
                  required
                  className={inputCls}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Término automático: {addFiftyMin(formData.horarioInicio || '07:00')} (50 min)
                </p>
              </div>

              {/* Disciplina */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Disciplina *
                </label>
                <select
                  value={formData.disciplinaId}
                  onChange={e => setFormData(f => ({ ...f, disciplinaId: e.target.value }))}
                  required
                  className={inputCls}
                >
                  <option value="">Selecione a disciplina</option>
                  {disciplinas.map(d => (
                    <option key={d.id} value={d.id!}>{d.nome}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? 'Salvando...' : 'Adicionar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
