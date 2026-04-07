import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, limit, getDocs,
  doc, getDoc, updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { db, storage } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { UserProfile, TimeLog, QuadroHorario } from '@/src/types';
import {
  User, Mail, Clock, BookOpen, Camera, ArrowLeft, Save, GraduationCap,
  ArrowDownRight, ArrowUpRight, AlertCircle,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador', professor: 'Professor', staff: 'Funcionário', superadmin: 'Superadmin',
};
const TURNO_LABELS: Record<string, string> = {
  matutino: 'Matutino', vespertino: 'Vespertino', noturno: 'Noturno', integral: 'Integral',
};

export function PerfilProfessor() {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { profile: currentProfile } = useAuth();

  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [quadros, setQuadros] = useState<QuadroHorario[]>([]);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = currentProfile?.uid === uid;
  const canEdit = currentProfile?.role === 'admin' || currentProfile?.role === 'superadmin' || isOwnProfile;

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then(snap => {
        if (snap.exists()) {
          const data = { uid: snap.id, ...snap.data() } as UserProfile;
          setTargetProfile(data);
          setDisplayName(data.displayName);
        }
        setLoadingProfile(false);
      })
      .catch(() => setLoadingProfile(false));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    getDocs(query(
      collection(db, 'timeLogs'),
      where('userId', '==', uid),
      orderBy('timestamp', 'desc'),
      limit(10),
    )).then(snap => {
      setTimeLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as TimeLog)));
    }).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!uid || !targetProfile) return;
    getDocs(query(
      collection(db, 'quadroHorarios'),
      where('schoolId', '==', targetProfile.schoolId),
    )).then(snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as QuadroHorario));
      setQuadros(all.filter(q => q.periodos.some(p => p.professorId === uid)));
    }).catch(() => {});
  }, [uid, targetProfile]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async () => {
    if (!photoFile || !uid) return;
    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `profilePhotos/${uid}`);
      await uploadBytes(storageRef, photoFile);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'users', uid), { photoUrl: url });
      setTargetProfile(p => p ? { ...p, photoUrl: url } : p);
      setPhotoPreview(null);
      setPhotoFile(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!uid || !displayName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), { displayName: displayName.trim() });
      setTargetProfile(p => p ? { ...p, displayName: displayName.trim() } : p);
      setEditing(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
    } finally {
      setSaving(false);
    }
  };

  // Group quadros by turma
  const turmaMap = React.useMemo(() => {
    const map = new Map<string, { turmaNome: string; disciplinas: string[] }>();
    quadros.forEach(q => {
      const periodos = q.periodos.filter(p => p.professorId === uid);
      if (!map.has(q.turmaId)) {
        map.set(q.turmaId, { turmaNome: q.turmaNome, disciplinas: [] });
      }
      periodos.forEach(p => {
        const entry = map.get(q.turmaId)!;
        if (!entry.disciplinas.includes(p.disciplinaNome)) {
          entry.disciplinas.push(p.disciplinaNome);
        }
      });
    });
    return map;
  }, [quadros, uid]);

  if (loadingProfile) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!targetProfile) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-500">Perfil não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  const photoUrl = photoPreview ?? targetProfile.photoUrl;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Perfil</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Informações do funcionário</p>
        </div>
      </div>

      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar / Photo */}
            <div className="relative shrink-0">
              <div className={cn(
                "h-24 w-24 rounded-full overflow-hidden border-4 border-white dark:border-slate-800 shadow-lg",
                "bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center",
              )}>
                {photoUrl ? (
                  <img src={photoUrl} alt="Foto" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {targetProfile.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              {canEdit && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow hover:bg-blue-700 transition-colors"
                  title="Alterar foto"
                >
                  <Camera size={14} />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handlePhotoSelect}
              />
            </div>

            {/* Info */}
            <div className="flex-1 space-y-2">
              {editing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="text-xl font-bold max-w-xs"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaveProfile} disabled={saving}>
                    <Save size={14} className="mr-1" />
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(false); setDisplayName(targetProfile.displayName); }}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{targetProfile.displayName}</h2>
                  {canEdit && (
                    <button onClick={() => setEditing(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Editar</button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <Mail size={14} />
                <span>{targetProfile.email}</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                  {ROLE_LABELS[targetProfile.role] ?? targetProfile.role}
                </span>
                {targetProfile.turno && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {TURNO_LABELS[targetProfile.turno]}
                  </span>
                )}
              </div>
              {/* Photo upload action */}
              {photoFile && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-500">Nova foto selecionada</span>
                  <Button size="sm" onClick={handlePhotoUpload} disabled={uploadingPhoto}>
                    {uploadingPhoto ? 'Enviando...' : 'Salvar Foto'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User size={16} /> Informações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Carga Horária</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">{targetProfile.workload}h/mês</span>
            </div>
            {targetProfile.startTime && targetProfile.endTime && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Horário</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {targetProfile.startTime} – {targetProfile.endTime}
                </span>
              </div>
            )}
            {targetProfile.numeroAulas != null && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Aulas/semana</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{targetProfile.numeroAulas}</span>
              </div>
            )}
            {targetProfile.matricula && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Matrícula</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 font-mono">{targetProfile.matricula}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Membro desde</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {format(new Date(targetProfile.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Disciplinas e Turmas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap size={16} /> Disciplinas e Turmas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {turmaMap.size === 0 ? (
              <div className="text-center py-6">
                <BookOpen size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs text-slate-400">Nenhuma turma vinculada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {Array.from(turmaMap.entries()).map(([turmaId, { turmaNome, disciplinas }]) => (
                  <div key={turmaId} className="flex items-start gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <GraduationCap size={14} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{turmaNome}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{disciplinas.join(', ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Time Log History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock size={16} /> Histórico de Ponto (últimos 10)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeLogs.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">Nenhum registro encontrado.</p>
          ) : (
            <div className="space-y-2">
              {timeLogs.map(log => (
                <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                    log.type === 'in'
                      ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                      : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
                  )}>
                    {log.type === 'in' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {log.type === 'in' ? 'Entrada' : 'Saída'}
                      {log.edited && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">(editado)</span>}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{log.device}</p>
                  </div>
                  <span className="text-sm text-slate-600 dark:text-slate-400 font-mono">
                    {format(new Date(log.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
