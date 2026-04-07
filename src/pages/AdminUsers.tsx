import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth } from '@/src/lib/firebase';
import firebaseConfig from '@/firebase-applet-config.json';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { UserProfile, UserRole, UserPermissions } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { Plus, Search, UserPlus, Mail, Shield, Clock, Trash2, Edit2, X, Check, LayoutGrid, List, CheckCircle2, CalendarDays } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';

export function AdminUsers() {
  const { profile: adminProfile } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Form state
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: '',
    role: 'professor' as UserRole,
    turno: 'integral' as 'matutino' | 'vespertino' | 'noturno' | 'integral',
    workload: 160,
    startTime: '07:00',
    endTime: '17:00',
    numeroAulas: 20,
    matricula: '',
    cpf: '',
    permissions: {
      viewLogs: false,
      editLogs: false,
      manageUsers: false,
      viewReports: false,
      exportReports: false
    } as UserPermissions
  });

  useEffect(() => {
    if (!adminProfile) return;

    const q = query(
      collection(db, 'users'),
      where('schoolId', '==', adminProfile.schoolId),
      orderBy('displayName', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setUsers(usersData);
      setLoading(false);
    }, (error) => {
      console.error("Snapshot error for users:", error);
      setTimeout(() => {
        handleFirestoreError(error, OperationType.GET, 'users');
      }, 0);
    });

    return () => unsubscribe();
  }, [adminProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;

    try {
      if (editingUser) {
        // Update existing user
        const userRef = doc(db, 'users', editingUser.uid);
        await updateDoc(userRef, {
          displayName: formData.displayName,
          role: formData.role,
          turno: formData.turno,
          workload: Number(formData.workload),
          startTime: formData.startTime,
          endTime: formData.endTime,
          numeroAulas: formData.role === 'professor' ? Number(formData.numeroAulas) : null,
          ...(formData.matricula ? { matricula: formData.matricula } : {}),
          ...(formData.cpf ? { cpf: formData.cpf.replace(/\D/g, '') } : {}),
          permissions: formData.permissions
        });
      } else {
        // Create new user in Auth using secondary app
        const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth, 
            formData.email, 
            formData.password
          );
          
          const uid = userCredential.user.uid;
          
          // Create user profile in Firestore
          const newUser: UserProfile = {
            uid,
            email: formData.email,
            displayName: formData.displayName,
            role: formData.role,
            turno: formData.turno,
            schoolId: adminProfile.schoolId,
            workload: Number(formData.workload),
            startTime: formData.startTime,
            endTime: formData.endTime,
            ...(formData.role === 'professor' ? { numeroAulas: Number(formData.numeroAulas) } : {}),
            ...(formData.matricula ? { matricula: formData.matricula } : {}),
            ...(formData.cpf ? { cpf: formData.cpf.replace(/\D/g, '') } : {}),
            createdAt: new Date().toISOString(),
            permissions: formData.permissions
          };
          
          await setDoc(doc(db, 'users', uid), newUser);
          
          // Sign out from secondary app (important!)
          await signOut(secondaryAuth);
        } finally {
          // Clean up secondary app
          await deleteApp(secondaryApp);
        }
      }
      
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const resetForm = () => {
    setFormData({
      displayName: '',
      email: '',
      password: '',
      role: 'professor',
      turno: 'integral',
      workload: 160,
      startTime: '07:00',
      endTime: '17:00',
      numeroAulas: 20,
      matricula: '',
      cpf: '',
      permissions: {
        viewLogs: false,
        editLogs: false,
        manageUsers: false,
        viewReports: false,
        exportReports: false
      }
    });
    setEditingUser(null);
  };

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    setUpdatingRoleId(uid);
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleEdit = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      displayName: user.displayName,
      email: user.email,
      password: '',
      role: user.role,
      turno: user.turno ?? 'integral',
      workload: user.workload,
      startTime: user.startTime || '07:00',
      endTime: user.endTime || '17:00',
      numeroAulas: user.numeroAulas ?? 20,
      matricula: user.matricula ?? '',
      cpf: user.cpf ?? '',
      permissions: user.permissions || {
        viewLogs: false,
        editLogs: false,
        manageUsers: false,
        viewReports: false,
        exportReports: false
      }
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (uid: string) => {
    if (window.confirm("Tem certeza que deseja excluir este usuário?")) {
      try {
        await deleteDoc(doc(db, 'users', uid));
      } catch (error) {
        console.error("Delete error:", error);
      }
    }
  };

  const filteredUsers = users.filter(user => 
    user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const paginatedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when search changes
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Gestão de Usuários</h1>
          <p className="text-slate-500 dark:text-slate-400">Cadastre e gerencie professores e funcionários.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            className="gap-2 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            onClick={() => setViewMode('table')}
          >
            <List size={18} />
            <span>Exibir Tabela de Usuários</span>
          </Button>
          
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mr-2">
            <Button 
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
              size="sm" 
              className={cn("h-8 w-8 p-0", viewMode === 'grid' && "bg-white dark:bg-slate-700 shadow-sm")}
              onClick={() => setViewMode('grid')}
              title="Visualização em Grade"
            >
              <LayoutGrid size={16} />
            </Button>
            <Button 
              variant={viewMode === 'table' ? 'secondary' : 'ghost'} 
              size="sm" 
              className={cn("h-8 w-8 p-0", viewMode === 'table' && "bg-white dark:bg-slate-700 shadow-sm")}
              onClick={() => setViewMode('table')}
              title="Visualização em Tabela"
            >
              <List size={16} />
            </Button>
          </div>
          <Button className="gap-2" onClick={() => { resetForm(); setIsModalOpen(true); }}>
            <UserPlus size={18} />
            <span>Novo Usuário</span>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" size={18} />
            <Input 
              placeholder="Buscar por nome ou e-mail..." 
              className="pl-10"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className={cn("p-0", viewMode === 'grid' && "p-6")}>
          {loading ? (
            <div className="py-12 text-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto"></div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              Nenhum usuário encontrado.
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nome</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">E-mail</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cargo</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Carga Horária</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nº Aulas/sem</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                 {paginatedUsers.map((user) => (
                    <tr key={user.uid} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold text-xs">
                            {user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.displayName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        {user.email}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <select 
                            className={cn(
                              "text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border-none outline-none cursor-pointer appearance-none",
                              user.role === 'admin' ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                              user.role === 'professor' ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                              "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400"
                            )}
                            value={user.role}
                            disabled={updatingRoleId === user.uid}
                            onChange={(e) => handleRoleChange(user.uid, e.target.value as UserRole)}
                          >
                            <option value="professor">Professor</option>
                            <option value="staff">Funcionário</option>
                            <option value="admin">Administrador</option>
                          </select>
                          {updatingRoleId === user.uid && (
                            <div className="h-3 w-3 animate-spin rounded-full border border-blue-600 border-t-transparent"></div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        <div className="flex flex-col gap-0.5">
                          <span>{user.workload}h / mês</span>
                          {user.turno && (
                            <span className={cn(
                              "text-xs px-1.5 py-0.5 rounded-full font-medium w-fit",
                              user.turno === 'matutino'   ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                              user.turno === 'vespertino' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                              user.turno === 'noturno'    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' :
                              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            )}>
                              {{ matutino: 'Matutino', vespertino: 'Vespertino', noturno: 'Noturno', integral: 'Integral' }[user.turno]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {user.role === 'professor'
                          ? (user.numeroAulas != null ? `${user.numeroAulas} aulas` : '—')
                          : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-6 py-4 text-right space-x-1">
                        {user.role === 'professor' && (
                          <Button
                            variant="ghost" size="sm"
                            className="text-blue-500 dark:text-blue-400"
                            title="Ver formação de horário"
                            onClick={() => navigate(`/formacao-horarios?prof=${user.uid}`)}
                          >
                            <CalendarDays size={15} />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-blue-600 dark:text-blue-400" onClick={() => handleEdit(user)}>
                          <Edit2 size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 dark:text-red-400" onClick={() => handleDelete(user.uid)}>
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedUsers.map((user) => (
                <Card key={user.uid} className="overflow-hidden border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-900 transition-colors">
                  <div className="p-4 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{user.displayName}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-600 dark:text-blue-400" onClick={() => handleEdit(user)}>
                          <Edit2 size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 dark:text-red-400" onClick={() => handleDelete(user.uid)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-md">
                        <p className="text-slate-400 dark:text-slate-500 uppercase font-bold mb-1">Cargo</p>
                        <select 
                          className={cn(
                            "font-bold uppercase w-full bg-transparent border-none outline-none cursor-pointer appearance-none",
                            user.role === 'admin' ? "text-red-700 dark:text-red-400" :
                            user.role === 'professor' ? "text-blue-700 dark:text-blue-400" :
                            "text-slate-700 dark:text-slate-400"
                          )}
                          value={user.role}
                          disabled={updatingRoleId === user.uid}
                          onChange={(e) => handleRoleChange(user.uid, e.target.value as UserRole)}
                        >
                          <option value="professor">Professor</option>
                          <option value="staff">Funcionário</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-md">
                        <p className="text-slate-400 dark:text-slate-500 uppercase font-bold mb-1">Carga Horária</p>
                        <p className="text-slate-900 dark:text-slate-100 font-bold">{user.workload}h / mês</p>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mostrando {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filteredUsers.length)} de {filteredUsers.length} usuários
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Anterior
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === 'number' && p - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 text-xs">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? 'primary' : 'outline'}
                      size="sm"
                      className="h-8 w-8 p-0 text-xs"
                      onClick={() => setPage(p as number)}
                    >
                      {p}
                    </Button>
                  )
                )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Próxima →
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal User Form */}
      {/* ── Side Drawer ─────────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />
          {/* Drawer panel */}
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingUser ? `Editando ${editingUser.displayName}` : 'Preencha os dados do colaborador'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <form onSubmit={handleSubmit} id="user-form" className="space-y-5">

                {/* Row 1: Name + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nome Completo</label>
                    <Input
                      required
                      value={formData.displayName}
                      onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">E-mail</label>
                    <Input
                      type="email"
                      required
                      disabled={!!editingUser}
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                </div>

                {/* Row 1b: Matrícula + CPF (for kiosk terminal) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Matrícula
                      <span className="ml-1 text-xs font-normal text-slate-400">(terminal de ponto)</span>
                    </label>
                    <Input
                      placeholder="Ex: 12345"
                      value={formData.matricula}
                      onChange={(e) => setFormData({...formData, matricula: e.target.value.trim()})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      CPF
                      <span className="ml-1 text-xs font-normal text-slate-400">(somente números)</span>
                    </label>
                    <Input
                      placeholder="Ex: 12345678901"
                      maxLength={11}
                      value={formData.cpf}
                      onChange={(e) => setFormData({...formData, cpf: e.target.value.replace(/\D/g, '')})}
                    />
                  </div>
                </div>

                {/* Row 2: Password (only new) + Cargo + Carga */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {!editingUser ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Senha Inicial</label>
                      <Input
                        type="password"
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                      />
                    </div>
                  ) : <div />}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Cargo</label>
                    <select
                      className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.role}
                      onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})}
                    >
                      <option value="professor">Professor</option>
                      <option value="staff">Funcionário</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Carga Horária (h/mês)</label>
                    <Input
                      type="number"
                      required
                      value={formData.workload}
                      onChange={(e) => setFormData({...formData, workload: Number(e.target.value)})}
                    />
                  </div>
                </div>

                {/* Row 3: Turno presets + times */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Turno</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { value: 'matutino',   label: 'Matutino',   inicio: '07:00', fim: '12:00', color: 'yellow' },
                        { value: 'vespertino', label: 'Vespertino',  inicio: '13:00', fim: '18:00', color: 'orange' },
                        { value: 'noturno',    label: 'Noturno',     inicio: '18:30', fim: '22:30', color: 'indigo' },
                        { value: 'integral',   label: 'Integral',    inicio: '07:00', fim: '17:00', color: 'green'  },
                      ] as const
                    ).map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setFormData(f => ({ ...f, turno: t.value, startTime: t.inicio, endTime: t.fim }))}
                        className={cn(
                          "flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg border-2 text-xs font-bold transition-all",
                          formData.turno === t.value
                            ? t.color === 'yellow'  ? "border-yellow-400 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-600 dark:text-yellow-300"
                            : t.color === 'orange'  ? "border-orange-400 bg-orange-50 text-orange-800 dark:bg-orange-900/30 dark:border-orange-600 dark:text-orange-300"
                            : t.color === 'indigo'  ? "border-indigo-400 bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:border-indigo-600 dark:text-indigo-300"
                            : "border-green-400 bg-green-50 text-green-800 dark:bg-green-900/30 dark:border-green-600 dark:text-green-300"
                            : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500"
                        )}
                      >
                        <span className="uppercase tracking-wider">{t.label}</span>
                        <span className="font-normal opacity-70">{t.inicio}–{t.fim}</span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-1">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Início</label>
                      <Input
                        type="time"
                        required
                        value={formData.startTime}
                        onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Fim</label>
                      <Input
                        type="time"
                        required
                        value={formData.endTime}
                        onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* Professor-specific fields */}
                {formData.role === 'professor' && (
                  <div className="space-y-3 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={15} className="text-blue-600 dark:text-blue-400" />
                        <h4 className="text-sm font-bold text-blue-800 dark:text-blue-200 uppercase tracking-tight">
                          Quadro de Horários
                        </h4>
                      </div>
                      {editingUser && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsModalOpen(false);
                            navigate(`/formacao-horarios?prof=${editingUser.uid}`);
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <CalendarDays size={12} /> Ver horário deste professor
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Nº de Aulas Semanais
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={formData.numeroAulas}
                        onChange={(e) => setFormData({ ...formData, numeroAulas: Number(e.target.value) })}
                      />
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Total de períodos de 50 min por semana para este professor.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield size={16} className="text-blue-600 dark:text-blue-400" />
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">Permissões de Acesso</h4>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-3 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                        checked={formData.permissions.viewLogs}
                        onChange={(e) => setFormData({
                          ...formData, 
                          permissions: { ...formData.permissions, viewLogs: e.target.checked }
                        })}
                      />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-blue-400">Ver Logs</span>
                    </label>

                    <label className="flex items-center gap-3 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                        checked={formData.permissions.editLogs}
                        onChange={(e) => setFormData({
                          ...formData, 
                          permissions: { ...formData.permissions, editLogs: e.target.checked }
                        })}
                      />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-blue-400">Editar Registros</span>
                    </label>

                    <label className="flex items-center gap-3 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                        checked={formData.permissions.manageUsers}
                        onChange={(e) => setFormData({
                          ...formData, 
                          permissions: { ...formData.permissions, manageUsers: e.target.checked }
                        })}
                      />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-blue-400">Gerir Usuários</span>
                    </label>

                    <label className="flex items-center gap-3 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                        checked={formData.permissions.viewReports}
                        onChange={(e) => setFormData({
                          ...formData, 
                          permissions: { ...formData.permissions, viewReports: e.target.checked }
                        })}
                      />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-blue-400">Ver Relatórios</span>
                    </label>

                    <label className="flex items-center gap-3 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                        checked={formData.permissions.exportReports}
                        onChange={(e) => setFormData({
                          ...formData, 
                          permissions: { ...formData.permissions, exportReports: e.target.checked }
                        })}
                      />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-blue-400">Exportar Relatórios</span>
                    </label>
                  </div>

                  {formData.role === 'admin' && (
                    <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                      <CheckCircle2 size={10} />
                      Administradores têm acesso total por padrão.
                    </p>
                  )}
                </div>

              </form>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0 flex gap-3 bg-slate-50 dark:bg-slate-800/50">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="user-form" className="flex-1">
                {editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
              </Button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
