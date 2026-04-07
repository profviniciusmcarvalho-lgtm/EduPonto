import React, { useEffect, useState, useRef, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy, limit, addDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { UserProfile, TimeLog } from '@/src/types';
import { LogIn, LogOut, Delete, CheckCircle2, XCircle, Fingerprint, RefreshCw, AlertTriangle } from 'lucide-react';
import { useEventosBloqueados } from '@/src/hooks/useEventosBloqueados';

type Stage = 'input' | 'confirm' | 'punching' | 'success' | 'error';

function useNowClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const PAD_KEYS = ['1','2','3','4','5','6','7','8','9','del','0','ok'] as const;

export function TerminalPonto() {
  const { profile: adminProfile } = useAuth();
  const now = useNowClock();
  const { isBlocked, blockedEvent } = useEventosBloqueados(adminProfile?.schoolId);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [stage, setStage] = useState<Stage>('input');
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [suggestedType, setSuggestedType] = useState<'in' | 'out'>('in');
  const [punchedType, setPunchedType] = useState<'in' | 'out'>('in');
  const [countdown, setCountdown] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [recentLogs, setRecentLogs] = useState<TimeLog[]>([]);

  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all users for this school once
  useEffect(() => {
    if (!adminProfile) return;
    getDocs(
      query(collection(db, 'users'), where('schoolId', '==', adminProfile.schoolId))
    ).then(snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      setUsersLoaded(true);
    }).catch(console.error);
  }, [adminProfile]);

  const clearTimers = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  const resetTerminal = useCallback(() => {
    clearTimers();
    setInput('');
    setStage('input');
    setFoundUser(null);
    setCountdown(0);
    setErrorMsg('');
    setRecentLogs([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [clearTimers]);

  const startAutoReset = useCallback((seconds: number) => {
    clearTimers();
    setCountdown(seconds);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownIntervalRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
    resetTimerRef.current = setTimeout(resetTerminal, seconds * 1000);
  }, [clearTimers, resetTerminal]);

  const handleLookup = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !adminProfile) return;

    const match = users.find(u =>
      u.matricula === trimmed ||
      (u.cpf && u.cpf.replace(/\D/g, '').startsWith(trimmed))
    );

    if (!match) {
      setErrorMsg('Matrícula ou CPF não encontrado.');
      setStage('error');
      startAutoReset(4);
      return;
    }

    setFoundUser(match);

    // Determine suggested punch type from last log
    try {
      const snap = await getDocs(
        query(
          collection(db, 'timeLogs'),
          where('userId', '==', match.uid),
          orderBy('timestamp', 'desc'),
          limit(1)
        )
      );
      if (!snap.empty) {
        const last = snap.docs[0].data() as TimeLog;
        setSuggestedType(last.type === 'in' ? 'out' : 'in');
      } else {
        setSuggestedType('in');
      }
    } catch {
      setSuggestedType('in');
    }

    // Fetch recent logs for history display
    try {
      const histSnap = await getDocs(
        query(collection(db, 'timeLogs'), where('userId', '==', match.uid), orderBy('timestamp', 'desc'), limit(5))
      );
      setRecentLogs(histSnap.docs.map(d => ({ id: d.id, ...d.data() } as TimeLog)));
    } catch {
      setRecentLogs([]);
    }

    setStage('confirm');
    startAutoReset(15);
  }, [input, adminProfile, users, startAutoReset]);

  const handlePunch = useCallback(async (type: 'in' | 'out') => {
    if (!foundUser || !adminProfile) return;
    // Block if today is a restricted school event
    if (isBlocked) {
      setErrorMsg(`Registro bloqueado${blockedEvent ? `: ${blockedEvent.nome}` : ' por evento escolar'}.`);
      setStage('error');
      startAutoReset(4);
      return;
    }
    clearTimers();
    setStage('punching');

    try {
      await addDoc(collection(db, 'timeLogs'), {
        userId: foundUser.uid,
        userName: foundUser.displayName,
        schoolId: adminProfile.schoolId,
        type,
        timestamp: new Date().toISOString(),
        device: 'Terminal',
      });

      // Check if punch is late (only for 'in' type)
      if (type === 'in' && foundUser.startTime && adminProfile) {
        const now = new Date();
        const [sh, sm] = foundUser.startTime.split(':').map(Number);
        const scheduledMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm).getTime();
        const lateMinutes = Math.round((now.getTime() - scheduledMs) / 60000);
        if (lateMinutes > 10) {
          try {
            await addDoc(collection(db, 'notifications'), {
              schoolId: adminProfile.schoolId,
              title: 'Entrada com atraso',
              message: `${foundUser.displayName} registrou entrada às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (${lateMinutes} min de atraso)`,
              type: 'late_punch',
              read: false,
              relatedUserId: foundUser.uid,
              relatedUserName: foundUser.displayName,
              createdAt: new Date().toISOString(),
            });
          } catch { /* non-critical */ }
        }
      }

      setPunchedType(type);
      setStage('success');
      startAutoReset(5);
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao registrar ponto. Tente novamente.');
      setStage('error');
      startAutoReset(4);
    }
  }, [foundUser, adminProfile, clearTimers, startAutoReset]);

  const handleNumpad = useCallback((key: string) => {
    if (stage !== 'input') return;
    if (key === 'del') { setInput(p => p.slice(0, -1)); return; }
    if (key === 'ok') { handleLookup(); return; }
    setInput(p => (p.length < 11 ? p + key : p));
  }, [stage, handleLookup]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (stage !== 'input') return;
    if (e.key === 'Enter') { e.preventDefault(); handleLookup(); return; }
    if (e.key === 'Backspace') { setInput(p => p.slice(0, -1)); }
    else if (/^\d$/.test(e.key)) { setInput(p => (p.length < 11 ? p + e.key : p)); }
  }, [stage, handleLookup]);

  // Formatting helpers
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const dateCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  const initials = (name: string) =>
    name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();

  return (
    <div
      className="min-h-screen bg-slate-950 text-white flex flex-col select-none"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Hidden real input to capture keyboard */}
      <input
        ref={inputRef}
        className="sr-only"
        value={input}
        onChange={() => {}}
        onKeyDown={handleKeyDown}
        readOnly
        autoFocus
        tabIndex={0}
      />

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900/80 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
            <Fingerprint size={18} />
          </div>
          <span className="text-sm font-bold tracking-widest uppercase text-slate-300">
            Terminal de Ponto
          </span>
        </div>
        <div className="flex items-center gap-4">
          {isBlocked && (
            <div className="flex items-center gap-2 bg-amber-900/40 border border-amber-700 rounded-lg px-3 py-1.5">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="text-xs text-amber-300 font-medium">
                {blockedEvent ? blockedEvent.nome : 'Dia bloqueado'}
              </span>
            </div>
          )}
          <span className="text-xs text-slate-500">{adminProfile?.displayName} · {adminProfile?.schoolId}</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — clock + instructions */}
        <div className="hidden md:flex flex-col justify-between w-2/5 p-8 border-r border-slate-800">
          <div />
          <div className="space-y-4">
            {/* Big clock */}
            <div className="font-mono text-6xl font-black tracking-tight text-white leading-none">
              {timeStr}
            </div>
            <p className="text-slate-400 text-base">{dateCap}</p>

            {/* Separator */}
            <div className="w-16 h-1 bg-blue-600 rounded-full my-4" />

            {/* Instructions */}
            <div className="space-y-2 text-slate-400 text-sm leading-relaxed">
              <p className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 text-xs font-bold">1</span>
                Digite sua <strong className="text-slate-200">matrícula</strong>
              </p>
              <p className="flex items-center gap-2 pl-0.5">
                <span className="text-slate-600 text-xs font-bold ml-0.5">OU</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 text-xs font-bold">2</span>
                Os <strong className="text-slate-200">primeiros 5 dígitos</strong> do seu CPF
              </p>
              <p className="flex items-center gap-2 mt-4">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-600/20 text-green-400 text-xs font-bold">3</span>
                Confirme a entrada ou saída
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-700">Clique em qualquer lugar para digitar pelo teclado</p>
        </div>

        {/* Right panel — input + numpad */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 relative">

          {/* Mobile clock */}
          <div className="md:hidden text-center">
            <div className="font-mono text-4xl font-black tracking-tight text-white">{timeStr}</div>
            <p className="text-slate-500 text-xs mt-1">{dateCap}</p>
          </div>

          {/* --- Stage: INPUT --- */}
          {(stage === 'input') && (
            <>
              {/* Input display */}
              <div className="w-full max-w-xs">
                <div className="h-16 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-between px-5">
                  {input ? (
                    <span className="font-mono text-3xl font-bold tracking-widest text-white">
                      {'•'.repeat(input.length)}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-sm">
                      {usersLoaded ? 'Digite sua matrícula ou CPF…' : 'Carregando…'}
                    </span>
                  )}
                  {input && (
                    <span className="text-xs text-slate-500">{input.length} dígitos</span>
                  )}
                </div>
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
                {PAD_KEYS.map(k => (
                  <button
                    key={k}
                    onClick={() => handleNumpad(k)}
                    disabled={!usersLoaded}
                    className={
                      k === 'ok'
                        ? 'h-16 rounded-2xl font-bold text-lg flex items-center justify-center gap-1.5 transition-all bg-blue-600 hover:bg-blue-500 active:scale-95 text-white disabled:opacity-40'
                        : k === 'del'
                        ? 'h-16 rounded-2xl font-bold text-lg flex items-center justify-center transition-all bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 disabled:opacity-40'
                        : 'h-16 rounded-2xl font-bold text-2xl flex items-center justify-center transition-all bg-slate-800 hover:bg-slate-700 active:scale-95 text-white disabled:opacity-40'
                    }
                  >
                    {k === 'del' ? <Delete size={20} /> : k === 'ok' ? <><CheckCircle2 size={20} />OK</> : k}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* --- Stage: CONFIRM --- */}
          {stage === 'confirm' && foundUser && (
            <div className="w-full max-w-sm space-y-6 animate-in fade-in duration-300">
              {/* Employee card */}
              <div className="bg-slate-900 rounded-3xl border border-slate-700 p-6 text-center space-y-3">
                <div className="mx-auto h-20 w-20 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center text-3xl font-black text-blue-300">
                  {initials(foundUser.displayName)}
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{foundUser.displayName}</p>
                  <p className="text-sm text-slate-400 capitalize">{foundUser.role}</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                  <span>Confirmação expira em</span>
                  <span className="font-mono text-slate-400 font-bold">{countdown}s</span>
                </div>
              </div>

              {/* Recent punch history */}
              {recentLogs.length > 0 && (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 px-4 py-3">
                  <p className="text-[11px] text-slate-500 mb-2 uppercase tracking-widest">Últimos registros</p>
                  <div className="space-y-1.5">
                    {recentLogs.map(log => (
                      <div key={log.id} className="flex items-center justify-between text-xs">
                        <span className={`flex items-center gap-1.5 font-medium ${log.type === 'in' ? 'text-green-400' : 'text-orange-400'}`}>
                          {log.type === 'in' ? <LogIn size={11} /> : <LogOut size={11} />}
                          {log.type === 'in' ? 'Entrada' : 'Saída'}
                        </span>
                        <span className="text-slate-400 font-mono tabular-nums">
                          {new Date(log.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          {' '}
                          {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Punch buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handlePunch('in')}
                  className={`flex flex-col items-center justify-center gap-2 py-5 rounded-2xl font-bold text-base transition-all active:scale-95 ${
                    suggestedType === 'in'
                      ? 'bg-green-600 hover:bg-green-500 text-white ring-2 ring-green-400 ring-offset-2 ring-offset-slate-950'
                      : 'bg-slate-800 hover:bg-green-900/40 text-slate-300 hover:text-green-300 border border-slate-700'
                  }`}
                >
                  <LogIn size={26} />
                  <span>Entrada</span>
                  {suggestedType === 'in' && <span className="text-[10px] opacity-70 font-normal">sugerido</span>}
                </button>
                <button
                  onClick={() => handlePunch('out')}
                  className={`flex flex-col items-center justify-center gap-2 py-5 rounded-2xl font-bold text-base transition-all active:scale-95 ${
                    suggestedType === 'out'
                      ? 'bg-orange-600 hover:bg-orange-500 text-white ring-2 ring-orange-400 ring-offset-2 ring-offset-slate-950'
                      : 'bg-slate-800 hover:bg-orange-900/40 text-slate-300 hover:text-orange-300 border border-slate-700'
                  }`}
                >
                  <LogOut size={26} />
                  <span>Saída</span>
                  {suggestedType === 'out' && <span className="text-[10px] opacity-70 font-normal">sugerido</span>}
                </button>
              </div>

              <button
                onClick={resetTerminal}
                className="w-full text-xs text-slate-600 hover:text-slate-400 flex items-center justify-center gap-1.5 py-2 transition-colors"
              >
                <RefreshCw size={12} /> Cancelar / Digitar novamente
              </button>
            </div>
          )}

          {/* --- Stage: PUNCHING --- */}
          {stage === 'punching' && (
            <div className="flex flex-col items-center gap-4 animate-in fade-in duration-200">
              <div className="h-12 w-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
              <p className="text-slate-400 text-sm">Registrando ponto…</p>
            </div>
          )}

          {/* --- Stage: SUCCESS --- */}
          {stage === 'success' && foundUser && (
            <div className="w-full max-w-sm text-center space-y-5 animate-in fade-in zoom-in duration-300">
              <div className={`mx-auto h-24 w-24 rounded-full flex items-center justify-center ${punchedType === 'in' ? 'bg-green-600/20' : 'bg-orange-600/20'}`}>
                <CheckCircle2 size={52} className={punchedType === 'in' ? 'text-green-400' : 'text-orange-400'} />
              </div>
              <div>
                <p className={`text-3xl font-black ${punchedType === 'in' ? 'text-green-400' : 'text-orange-400'}`}>
                  {punchedType === 'in' ? 'Entrada Registrada!' : 'Saída Registrada!'}
                </p>
                <p className="text-slate-300 text-lg mt-1">{foundUser.displayName}</p>
                <p className="text-slate-500 text-sm mt-1 font-mono">{timeStr}</p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
                <RefreshCw size={12} className="animate-spin" />
                <span>Reiniciando em {countdown}s…</span>
              </div>
            </div>
          )}

          {/* --- Stage: ERROR --- */}
          {stage === 'error' && (
            <div className="w-full max-w-sm text-center space-y-5 animate-in fade-in zoom-in duration-300">
              <div className="mx-auto h-20 w-20 rounded-full bg-red-900/30 flex items-center justify-center">
                <XCircle size={44} className="text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-red-400">Não encontrado</p>
                <p className="text-slate-400 text-sm mt-2">{errorMsg}</p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
                <RefreshCw size={12} className="animate-spin" />
                <span>Reiniciando em {countdown}s…</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
