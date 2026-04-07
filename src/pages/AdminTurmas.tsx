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
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { Turma, NivelEnsino } from '@/src/types';
import { Plus, Search, Edit2, Trash2, X, GraduationCap, ChevronDown, ChevronRight } from 'lucide-react';

const TURNOS = [
  { value: 'matutino',   label: 'Matutino',   inicio: '07:00', fim: '12:00' },
  { value: 'vespertino', label: 'Vespertino',  inicio: '13:00', fim: '18:00' },
  { value: 'noturno',    label: 'Noturno',     inicio: '18:30', fim: '22:30' },
  { value: 'integral',   label: 'Integral',    inicio: '07:00', fim: '17:00' },
] as const;

const TURNO_COLORS: Record<string, string> = {
  matutino:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  vespertino: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  noturno:    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  integral:   'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-300',
};

export const NIVEIS: { value: NivelEnsino; label: string; color: string }[] = [
  { value: 'educacao_infantil',         label: 'Educação Infantil',                color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300' },
  { value: 'educacao_basica',           label: 'Educação Básica',                  color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'fundamental_1',             label: 'Ensino Fundamental I',             color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'fundamental_2',             label: 'Ensino Fundamental II',            color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' },
  { value: 'medio_normal',              label: 'Ensino Médio Normal',              color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { value: 'medio_profissionalizante',  label: 'Ensino Médio Profissionalizante',  color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
];

const NIVEL_LABEL: Record<string, string> = Object.fromEntries(NIVEIS.map(n => [n.value, n.label]));
const NIVEL_COLOR: Record<string, string> = Object.fromEntries(NIVEIS.map(n => [n.value, n.color]));
const NIVEL_ORDER: NivelEnsino[] = NIVEIS.map(n => n.value);

const emptyForm = { nome: '', serie: '', turno: 'matutino' as Turma['turno'], nivel: '' as NivelEnsino | '' };

export function AdminTurmas() {
  const { profile: adminProfile } = useAuth();
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTurma, setEditingTurma] = useState<Turma | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!adminProfile) return;
    const q = query(
      collection(db, 'turmas'),
      where('schoolId', '==', adminProfile.schoolId),
      orderBy('nome', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setTurmas(snap.docs.map(d => ({ id: d.id, ...d.data() } as Turma)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'turmas'));
    return () => unsub();
  }, [adminProfile]);

  const openCreate = () => {
    setEditingTurma(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (turma: Turma) => {
    setEditingTurma(turma);
    setFormData({ nome: turma.nome, serie: turma.serie, turno: turma.turno, nivel: turma.nivel ?? '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    const payload: Partial<Turma> = {
      nome: formData.nome,
      serie: formData.serie,
      turno: formData.turno,
      ...(formData.nivel ? { nivel: formData.nivel } : {}),
    };
    try {
      if (editingTurma?.id) {
        await updateDoc(doc(db, 'turmas', editingTurma.id), payload);
      } else {
        await addDoc(collection(db, 'turmas'), {
          ...payload,
          schoolId: adminProfile.schoolId,
          createdAt: new Date().toISOString(),
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'turmas');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta turma?')) return;
    try {
      await deleteDoc(doc(db, 'turmas', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'turmas');
    }
  };

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const filtered = turmas.filter(t =>
    t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.serie.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Group by nivel; turmas without nivel go into a "__sem_nivel" bucket
  const groups = new Map<string, Turma[]>();
  for (const turma of filtered) {
    const key = turma.nivel ?? '__sem_nivel';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(turma);
  }

  const orderedKeys = [
    ...NIVEL_ORDER.filter(k => groups.has(k)),
    ...(groups.has('__sem_nivel') ? ['__sem_nivel'] : []),
  ];

  const TurmaTable = ({ list }: { list: Turma[] }) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-700">
          <th className="text-left py-2 px-4 font-semibold text-slate-600 dark:text-slate-400">Turma</th>
          <th className="text-left py-2 px-4 font-semibold text-slate-600 dark:text-slate-400">Série</th>
          <th className="text-left py-2 px-4 font-semibold text-slate-600 dark:text-slate-400">Turno</th>
          <th className="text-right py-2 px-4 font-semibold text-slate-600 dark:text-slate-400">Ações</th>
        </tr>
      </thead>
      <tbody>
        {list.map(turma => (
          <tr key={turma.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <td className="py-2 px-4 font-medium text-slate-900 dark:text-slate-100">{turma.nome}</td>
            <td className="py-2 px-4 text-slate-600 dark:text-slate-400">{turma.serie}</td>
            <td className="py-2 px-4">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TURNO_COLORS[turma.turno]}`}>
                {TURNOS.find(t => t.value === turma.turno)?.label}
              </span>
            </td>
            <td className="py-2 px-4 text-right">
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => openEdit(turma)}>
                  <Edit2 size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(turma.id!)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10">
                  <Trash2 size={14} />
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Turmas</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Gerencie as turmas da escola
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} /> Nova Turma
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Turmas Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar turma..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <p className="text-center text-slate-500 py-8">Carregando...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
              <p>Nenhuma turma encontrada.</p>
            </div>
          ) : (
            <div className="space-y-4 overflow-x-auto">
              {orderedKeys.map(key => {
                const list = groups.get(key)!;
                const isCollapsed = collapsed.has(key);
                const label = key === '__sem_nivel' ? 'Sem Nível Definido' : NIVEL_LABEL[key];
                const colorCls = key === '__sem_nivel'
                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  : NIVEL_COLOR[key];

                return (
                  <div key={key} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleCollapse(key)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      {isCollapsed ? <ChevronRight size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorCls}`}>
                        {label}
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">{list.length} turma{list.length !== 1 ? 's' : ''}</span>
                    </button>
                    {!isCollapsed && <TurmaTable list={list} />}
                  </div>
                );
              })}
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
                {editingTurma ? 'Editar Turma' : 'Nova Turma'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome da Turma *
                </label>
                <Input
                  placeholder="ex: 1ºA, 9ºB"
                  value={formData.nome}
                  onChange={e => setFormData(f => ({ ...f, nome: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Série *
                </label>
                <Input
                  placeholder="ex: 1º Ano, 9º Ano EF"
                  value={formData.serie}
                  onChange={e => setFormData(f => ({ ...f, serie: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nível de Ensino
                </label>
                <select
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.nivel}
                  onChange={e => setFormData(f => ({ ...f, nivel: e.target.value as NivelEnsino | '' }))}
                >
                  <option value="">— Selecione o nível —</option>
                  {NIVEIS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Turno *
                </label>
                <select
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.turno}
                  onChange={e => setFormData(f => ({ ...f, turno: e.target.value as Turma['turno'] }))}
                >
                  {TURNOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1">
                  {editingTurma ? 'Salvar' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
