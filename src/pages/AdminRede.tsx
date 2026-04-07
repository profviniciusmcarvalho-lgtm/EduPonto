import React, { useEffect, useState, useMemo } from 'react';
import {
  collection, query, where, onSnapshot, getDocs,
  addDoc, doc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { Network, School } from '@/src/types';
import { Plus, X, Building2, Globe, Trash2, Edit2, Users, AlertCircle } from 'lucide-react';

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

const emptyForm = { name: '' };

export function AdminRede() {
  const { profile } = useAuth();
  const [networks, setNetworks] = useState<Network[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolUserCounts, setSchoolUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formSchoolIds, setFormSchoolIds] = useState<string[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'networks'), snap => {
      setNetworks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Network)));
      setLoading(false);
    }, err => {
      handleFirestoreError(err, OperationType.GET, 'networks');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    getDocs(collection(db, 'schools')).then(snap => {
      setSchools(snap.docs.map(d => ({ id: d.id, ...d.data() } as School)));
    }).catch(() => {});
  }, []);

  // Load user counts per school
  useEffect(() => {
    if (schools.length === 0) return;
    const counts: Record<string, number> = {};
    Promise.all(schools.map(async school => {
      const snap = await getDocs(query(collection(db, 'users'), where('schoolId', '==', school.id)));
      counts[school.id] = snap.size;
    })).then(() => setSchoolUserCounts(counts)).catch(() => {});
  }, [schools]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setFormSchoolIds([]);
    setIsModalOpen(true);
  };

  const openEdit = (network: Network) => {
    setEditingId(network.id!);
    setFormData({ name: network.name });
    setFormSchoolIds(network.schoolIds ?? []);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const payload = stripUndefined({
      name: formData.name,
      adminUids: profile ? [profile.uid] : [],
      schoolIds: formSchoolIds,
    });
    try {
      if (editingId) {
        await updateDoc(doc(db, 'networks', editingId), payload);
      } else {
        await addDoc(collection(db, 'networks'), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'networks');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta rede?')) return;
    try { await deleteDoc(doc(db, 'networks', id)); }
    catch (err) { handleFirestoreError(err, OperationType.DELETE, 'networks'); }
  };

  const toggleSchool = (schoolId: string) => {
    setFormSchoolIds(prev =>
      prev.includes(schoolId) ? prev.filter(id => id !== schoolId) : [...prev, schoolId],
    );
  };

  // All schools not in any network
  const unassignedSchools = useMemo(() => {
    const assignedIds = new Set(networks.flatMap(n => n.schoolIds ?? []));
    return schools.filter(s => !assignedIds.has(s.id));
  }, [networks, schools]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Rede de Escolas</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Gerencie redes e grupos de escolas</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nova Rede</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <Globe size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Redes</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{networks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                <Building2 size={18} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Escolas Total</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{schools.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <Building2 size={18} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Sem Rede</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{unassignedSchools.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Networks list */}
      {loading ? (
        <p className="text-center text-slate-500 py-12">Carregando...</p>
      ) : networks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Globe size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <p className="text-slate-500 dark:text-slate-400">Nenhuma rede criada ainda.</p>
            <Button className="mt-4" onClick={openCreate}><Plus size={16} className="mr-2" />Criar Primeira Rede</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {networks.map(network => {
            const networkSchools = schools.filter(s => (network.schoolIds ?? []).includes(s.id));
            const totalUsers = networkSchools.reduce((sum, s) => sum + (schoolUserCounts[s.id] ?? 0), 0);
            return (
              <Card key={network.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Globe size={18} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{network.name}</CardTitle>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {networkSchools.length} escola{networkSchools.length !== 1 ? 's' : ''} · {totalUsers} usuário{totalUsers !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(network)}><Edit2 size={14} /></Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(network.id!)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {networkSchools.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhuma escola nesta rede.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {networkSchools.map(school => (
                        <div key={school.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                          <Building2 size={16} className="text-slate-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{school.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{school.address}</p>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                            <Users size={12} />
                            <span>{schoolUserCounts[school.id] ?? 0}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-3">
                    Criado em {format(new Date(network.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? 'Editar Rede' : 'Nova Rede'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome da Rede *</label>
                <Input
                  required
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Rede Municipal de Ensino"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Escolas</label>
                {schools.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma escola disponível.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {schools.map(school => (
                      <label key={school.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formSchoolIds.includes(school.id)}
                          onChange={() => toggleSchool(school.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{school.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{school.address}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1">{editingId ? 'Salvar' : 'Criar Rede'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
