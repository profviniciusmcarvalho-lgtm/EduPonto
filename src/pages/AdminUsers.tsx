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
    workload: 160,
    startTime: '08:00',
    endTime: '17:00',
    numeroAulas: 20,
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
          workload: Number(formData.workload),
          startTime: formData.startTime,
          endTime: formData.endTime,
          numeroAulas: formData.role === 'professor' ? Number(formData.numeroAulas) : null,
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
            schoolId: adminProfile.schoolId,
            workload: Number(formData.workload),
            startTime: formData.startTime,
            endTime: formData.endTime,
            ...(formData.role === 'professor' ? { numeroAulas: Number(formData.numeroAulas) } : {}),
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
      workload: 160,
      startTime: '08:00',
      endTime: '17:00',
      numeroAulas: 20,
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
      password: '', // Don't show password
      role: user.role,
      workload: user.workload,
      startTime: user.startTime || '08:00',
      endTime: user.endTime || '17:00',
      numeroAulas: user.numeroAulas ?? 20,
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
              onChange={(e) => setSearchTerm(e.target.value)}
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
                  {filteredUsers.map((user) => (
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
                        {user.workload}h / mês
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
              {filteredUsers.map((user) => (
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
      </Card>

      {/* Modal User Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</CardTitle>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={24} />
              </button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
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

                {!editingUser && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Senha Inicial</label>
                    <Input 
                      type="password" 
                      required 
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
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
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Carga Horária (h)</label>
                    <Input 
                      type="number" 
                      required 
                      value={formData.workload}
                      onChange={(e) => setFormData({...formData, workload: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Início Turno</label>
                    <Input 
                      type="time" 
                      required 
                      value={formData.startTime}
                      onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fim Turno</label>
                    <Input 
                      type="time" 
                      required 
                      value={formData.endTime}
                      onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                    />
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

                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1">
                    {editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
