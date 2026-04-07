import React, { useEffect, useState, useMemo } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, doc, updateDoc, deleteDoc, getDocs,
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { Ausencia, AusenciaStatus, AusenciaTipo, UserProfile, QuadroHorario, DiaSemana } from '@/src/types';
import { Plus, Search, Edit2, Trash2, X, AlertCircle, FileText, CheckCircle2, Clock, Link, GitMerge } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TIPO_LABELS: Record<AusenciaTipo, string> = {
  falta: 'Falta', atestado: 'Atestado', licenca: 'Licença', suspensao: 'Suspensão', outro: 'Outro',
};
const TIPO_COLORS: Record<AusenciaTipo, string> = {
  falta: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  atestado: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  licenca: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  suspensao: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  outro: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
};
const STATUS_LABELS: Record<AusenciaStatus, string> = {
  pendente: 'Pendente', justificada: 'Justificada', injustificada: 'Injustificada',
};
const STATUS_COLORS: Record<AusenciaStatus, string> = {
  pendente: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  justificada: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  injustificada: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const emptyForm = {
  userId: '', userName: '', data: format(new Date(), 'yyyy-MM-dd'),
  tipo: 'falta' as AusenciaTipo, motivo: '', status: 'pendente' as AusenciaStatus,
  documentUrl: '', substitutoId: '', substitutoNome: '',
};

const DIAS_SEMANA: Record<number, DiaSemana> = {
  0: 'sabado', // Sunday treated as sabado (unlikely but safe)
  1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado',
};

export function AdminAusencias() {
  const { profile: adminProfile } = useAuth();
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<AusenciaStatus | ''>('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  // Substitute linking state
  const [vinculoAusencia, setVinculoAusencia] = useState<Ausencia | null>(null);
  const [quadros, setQuadros] = useState<QuadroHorario[]>([]);
  const [loadingQuadros, setLoadingQuadros] = useState(false);
  const [selectedPeriodos, setSelectedPeriodos] = useState<{ quadroId: string; periodoNumero: number }[]>([]);
  const [savingVinculo, setSavingVinculo] = useState(false);

  useEffect(() => {
    if (!adminProfile) return;
    const q = query(collection(db, 'users'), where('schoolId', '==', adminProfile.schoolId), orderBy('displayName', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }, err => handleFirestoreError(err, OperationType.GET, 'users'));
    return () => unsub();
  }, [adminProfile]);

  useEffect(() => {
    if (!adminProfile) return;
    const start = startOfMonth(parseISO(`${filterMonth}-01`)).toISOString().slice(0, 10);
    const end = endOfMonth(parseISO(`${filterMonth}-01`)).toISOString().slice(0, 10);
    const q = query(
      collection(db, 'ausencias'),
      where('schoolId', '==', adminProfile.schoolId),
      where('data', '>=', start),
      where('data', '<=', end),
      orderBy('data', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      setAusencias(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ausencia)));
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.GET, 'ausencias'));
    return () => unsub();
  }, [adminProfile, filterMonth]);

  const filtered = useMemo(() =>
    ausencias
      .filter(a => !filterStatus || a.status === filterStatus)
      .filter(a => !filterUserId || a.userId === filterUserId)
      .filter(a => !searchTerm || a.userName.toLowerCase().includes(searchTerm.toLowerCase()) || (a.motivo ?? '').toLowerCase().includes(searchTerm.toLowerCase())),
    [ausencias, filterStatus, filterUserId, searchTerm],
  );

  const stats = useMemo(() => ({
    total: ausencias.length,
    pendente: ausencias.filter(a => a.status === 'pendente').length,
    justificada: ausencias.filter(a => a.status === 'justificada').length,
    injustificada: ausencias.filter(a => a.status === 'injustificada').length,
  }), [ausencias]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (a: Ausencia) => {
    setEditingId(a.id!);
    setFormData({
      userId: a.userId, userName: a.userName, data: a.data,
      tipo: a.tipo, motivo: a.motivo ?? '', status: a.status,
      documentUrl: a.documentUrl ?? '', substitutoId: a.substitutoId ?? '', substitutoNome: a.substitutoNome ?? '',
    });
    setIsModalOpen(true);
  };

  const handleUserSelect = (uid: string) => {
    const user = users.find(u => u.uid === uid);
    setFormData(f => ({ ...f, userId: uid, userName: user?.displayName ?? '' }));
  };

  const handleSubstitutoSelect = (uid: string) => {
    const user = users.find(u => u.uid === uid);
    setFormData(f => ({ ...f, substitutoId: uid, substitutoNome: user?.displayName ?? '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile || !formData.userId) return;
    const payload: Partial<Ausencia> = {
      userId: formData.userId, userName: formData.userName, schoolId: adminProfile.schoolId,
      data: formData.data, tipo: formData.tipo, status: formData.status,
      ...(formData.motivo ? { motivo: formData.motivo } : {}),
      ...(formData.documentUrl ? { documentUrl: formData.documentUrl } : {}),
      ...(formData.substitutoId ? { substitutoId: formData.substitutoId, substitutoNome: formData.substitutoNome } : {}),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (editingId) {
        await updateDoc(doc(db, 'ausencias', editingId), payload);
      } else {
        await addDoc(collection(db, 'ausencias'), { ...payload, createdAt: new Date().toISOString(), createdBy: adminProfile.uid });
      }
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'ausencias');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta ausência?')) return;
    try { await deleteDoc(doc(db, 'ausencias', id)); }
    catch (err) { handleFirestoreError(err, OperationType.DELETE, 'ausencias'); }
  };

  const openVinculo = async (a: Ausencia) => {
    if (!adminProfile || !a.substitutoId) return;
    setVinculoAusencia(a);
    setSelectedPeriodos([]);
    setLoadingQuadros(true);
    try {
      const weekday = DIAS_SEMANA[getDay(parseISO(a.data))];
      const snap = await getDocs(query(
        collection(db, 'quadroHorarios'),
        where('schoolId', '==', adminProfile.schoolId),
        where('diaSemana', '==', weekday),
      ));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as QuadroHorario));
      // Filter: only quadros where at least one period is the absent professor
      setQuadros(all.filter(q => q.periodos.some(p => p.professorId === a.userId)));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'quadroHorarios');
    } finally {
      setLoadingQuadros(false);
    }
  };

  const togglePeriodo = (quadroId: string, periodoNumero: number) => {
    setSelectedPeriodos(prev => {
      const exists = prev.find(p => p.quadroId === quadroId && p.periodoNumero === periodoNumero);
      if (exists) return prev.filter(p => !(p.quadroId === quadroId && p.periodoNumero === periodoNumero));
      return [...prev, { quadroId, periodoNumero }];
    });
  };

  const handleSaveVinculo = async () => {
    if (!vinculoAusencia || !vinculoAusencia.substitutoId || !vinculoAusencia.substitutoNome) return;
    setSavingVinculo(true);
    try {
      for (const sel of selectedPeriodos) {
        const quadro = quadros.find(q => q.id === sel.quadroId);
        if (!quadro) continue;
        const updatedPeriodos = quadro.periodos.map(p =>
          p.numero === sel.periodoNumero
            ? { ...p, substituteTeacherId: vinculoAusencia.substitutoId, substituteTeacherNome: vinculoAusencia.substitutoNome }
            : p,
        );
        await updateDoc(doc(db, 'quadroHorarios', sel.quadroId), { periodos: updatedPeriodos });
      }
      setVinculoAusencia(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'quadroHorarios');
    } finally {
      setSavingVinculo(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Ausências e Justificativas</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Registre e gerencie as ausências dos funcionários</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Registrar Ausência</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: FileText, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' },
          { label: 'Pendentes', value: stats.pendente, icon: Clock, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
          { label: 'Justificadas', value: stats.justificada, icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Injustificadas', value: stats.injustificada, icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bg}`}><Icon size={18} className={color} /></div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Registros de Ausências</CardTitle></CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Buscar funcionário ou motivo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 text-sm" />
            </div>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={filterUserId} onChange={e => setFilterUserId(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos os funcionários</option>
              {users.map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
            </select>
            {(['pendente', 'justificada', 'injustificada'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === s ? STATUS_COLORS[s] : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
            {(filterStatus || filterUserId || searchTerm) && (
              <button onClick={() => { setFilterStatus(''); setFilterUserId(''); setSearchTerm(''); }}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                <X size={12} /> Limpar
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-center text-slate-500 py-8">Carregando...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <AlertCircle size={40} className="mx-auto mb-3 opacity-30" />
              <p>Nenhuma ausência encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {['Funcionário', 'Data', 'Tipo', 'Motivo', 'Substituto', 'Status', 'Doc', 'Ações'].map(h => (
                      <th key={h} className="text-left py-3 px-3 font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{a.userName}</td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {format(parseISO(a.data), 'dd/MM/yyyy', { locale: ptBR })}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[a.tipo]}`}>{TIPO_LABELS[a.tipo]}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400 max-w-[180px] truncate">{a.motivo ?? '—'}</td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{a.substitutoNome ?? '—'}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[a.status]}`}>{STATUS_LABELS[a.status]}</span>
                      </td>
                      <td className="py-2 px-3">
                        {a.documentUrl ? (
                          <a href={a.documentUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 text-xs">
                            <Link size={12} /> Ver
                          </a>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(a)}><Edit2 size={13} /></Button>
                          {a.substitutoId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openVinculo(a)}
                              title="Vincular ao Quadro de Horários"
                              className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/10"
                            >
                              <GitMerge size={13} />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id!)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10"><Trash2 size={13} /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {isModalOpen && (        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? 'Editar Ausência' : 'Registrar Ausência'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Funcionário *</label>
                <select required value={formData.userId} onChange={e => handleUserSelect(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Selecione —</option>
                  {users.map(u => <option key={u.uid} value={u.uid}>{u.displayName} ({u.role})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data *</label>
                  <Input type="date" required value={formData.data} onChange={e => setFormData(f => ({ ...f, data: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo *</label>
                  <select value={formData.tipo} onChange={e => setFormData(f => ({ ...f, tipo: e.target.value as AusenciaTipo }))}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(Object.entries(TIPO_LABELS) as [AusenciaTipo, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select value={formData.status} onChange={e => setFormData(f => ({ ...f, status: e.target.value as AusenciaStatus }))}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {(Object.entries(STATUS_LABELS) as [AusenciaStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Motivo / Observação</label>
                <textarea rows={3} value={formData.motivo} onChange={e => setFormData(f => ({ ...f, motivo: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Descreva o motivo da ausência..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">URL do Documento</label>
                <Input type="url" value={formData.documentUrl} onChange={e => setFormData(f => ({ ...f, documentUrl: e.target.value }))}
                  placeholder="https://drive.google.com/... (link do atestado)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Professor Substituto</label>
                <select value={formData.substitutoId} onChange={e => handleSubstitutoSelect(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Sem substituto —</option>
                  {users.filter(u => u.uid !== formData.userId).map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1">{editingId ? 'Salvar' : 'Registrar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vinculo ao Quadro de Horários Modal */}
      {vinculoAusencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Vincular ao Quadro de Horários</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Substituto: <span className="font-medium text-slate-700 dark:text-slate-300">{vinculoAusencia.substitutoNome}</span>
                  {' · '}Data: {format(parseISO(vinculoAusencia.data), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <button onClick={() => setVinculoAusencia(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {loadingQuadros ? (
                <p className="text-center text-slate-500 py-4">Carregando períodos...</p>
              ) : quadros.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-500">Nenhum período encontrado para este professor neste dia da semana.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Selecione os períodos a vincular o substituto:
                  </p>
                  <div className="space-y-3">
                    {quadros.map(quadro => (
                      <div key={quadro.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{quadro.turmaNome}</p>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {quadro.periodos
                            .filter(p => p.professorId === vinculoAusencia.userId)
                            .map(periodo => {
                              const isSelected = selectedPeriodos.some(
                                s => s.quadroId === quadro.id && s.periodoNumero === periodo.numero,
                              );
                              const alreadyLinked = periodo.substituteTeacherId === vinculoAusencia.substitutoId;
                              return (
                                <label
                                  key={periodo.numero}
                                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${alreadyLinked ? 'opacity-60' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected || alreadyLinked}
                                    disabled={alreadyLinked}
                                    onChange={() => !alreadyLinked && togglePeriodo(quadro.id!, periodo.numero)}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm text-slate-800 dark:text-slate-200">
                                      <span className="font-medium">Período {periodo.numero}</span>
                                      {' — '}{periodo.disciplinaNome}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {periodo.horarioInicio} – {periodo.horarioFim}
                                      {alreadyLinked && ' · '}
                                      {alreadyLinked && <span className="text-green-600 dark:text-green-400 font-medium">Já vinculado</span>}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setVinculoAusencia(null)}>Cancelar</Button>
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={selectedPeriodos.length === 0 || savingVinculo}
                      onClick={handleSaveVinculo}
                    >
                      {savingVinculo ? 'Salvando...' : `Vincular ${selectedPeriodos.length} período(s)`}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
