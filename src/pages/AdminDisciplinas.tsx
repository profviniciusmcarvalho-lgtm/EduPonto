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
import { Disciplina } from '@/src/types';
import { Plus, Search, Edit2, Trash2, X, BookOpen } from 'lucide-react';

const emptyForm = { nome: '', abreviacao: '' };

export function AdminDisciplinas() {
  const { profile: adminProfile } = useAuth();
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDisciplina, setEditingDisciplina] = useState<Disciplina | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    if (!adminProfile) return;
    const q = query(
      collection(db, 'disciplinas'),
      where('schoolId', '==', adminProfile.schoolId),
      orderBy('nome', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setDisciplinas(snap.docs.map(d => ({ id: d.id, ...d.data() } as Disciplina)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'disciplinas'));
    return () => unsub();
  }, [adminProfile]);

  const openCreate = () => {
    setEditingDisciplina(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (disc: Disciplina) => {
    setEditingDisciplina(disc);
    setFormData({ nome: disc.nome, abreviacao: disc.abreviacao ?? '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    try {
      const data = { nome: formData.nome, abreviacao: formData.abreviacao.trim() || undefined };
      if (editingDisciplina?.id) {
        await updateDoc(doc(db, 'disciplinas', editingDisciplina.id), data);
      } else {
        await addDoc(collection(db, 'disciplinas'), {
          ...data,
          schoolId: adminProfile.schoolId,
          createdAt: new Date().toISOString(),
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'disciplinas');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta disciplina?')) return;
    try {
      await deleteDoc(doc(db, 'disciplinas', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'disciplinas');
    }
  };

  const filtered = disciplinas.filter(d =>
    d.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.abreviacao ?? '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Disciplinas</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Gerencie as disciplinas / matérias da escola
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} /> Nova Disciplina
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Disciplinas Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar disciplina..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <p className="text-center text-slate-500 py-8">Carregando...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
              <p>Nenhuma disciplina encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Disciplina</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Abreviação</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(disc => (
                    <tr key={disc.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{disc.nome}</td>
                      <td className="py-3 px-4">
                        {disc.abreviacao ? (
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300">
                            {disc.abreviacao}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(disc)}>
                            <Edit2 size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(disc.id!)}
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
                {editingDisciplina ? 'Editar Disciplina' : 'Nova Disciplina'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome da Disciplina *
                </label>
                <Input
                  placeholder="ex: Matemática, Língua Portuguesa"
                  value={formData.nome}
                  onChange={e => setFormData(f => ({ ...f, nome: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Abreviação <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <Input
                  placeholder="ex: MAT, PORT, HIST"
                  value={formData.abreviacao}
                  onChange={e => setFormData(f => ({ ...f, abreviacao: e.target.value }))}
                  maxLength={6}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1">
                  {editingDisciplina ? 'Salvar' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
