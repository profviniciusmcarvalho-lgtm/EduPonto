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
import { Turma } from '@/src/types';
import { Plus, Search, Edit2, Trash2, X, GraduationCap } from 'lucide-react';

const TURNOS = [
  { value: 'matutino', label: 'Matutino' },
  { value: 'vespertino', label: 'Vespertino' },
  { value: 'noturno', label: 'Noturno' },
] as const;

const TURNO_COLORS: Record<string, string> = {
  matutino: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  vespertino: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  noturno: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
};

const emptyForm = { nome: '', serie: '', turno: 'matutino' as Turma['turno'] };

export function AdminTurmas() {
  const { profile: adminProfile } = useAuth();
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTurma, setEditingTurma] = useState<Turma | null>(null);
  const [formData, setFormData] = useState(emptyForm);

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
    setFormData({ nome: turma.nome, serie: turma.serie, turno: turma.turno });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    try {
      if (editingTurma?.id) {
        await updateDoc(doc(db, 'turmas', editingTurma.id), { ...formData });
      } else {
        await addDoc(collection(db, 'turmas'), {
          ...formData,
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

  const filtered = turmas.filter(t =>
    t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.serie.toLowerCase().includes(searchTerm.toLowerCase()),
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Turma</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Série</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Turno</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(turma => (
                    <tr key={turma.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{turma.nome}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{turma.serie}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TURNO_COLORS[turma.turno]}`}>
                          {TURNOS.find(t => t.value === turma.turno)?.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
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
