import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, getDoc, runTransaction, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/src/components/ui/Card';
import { Mail, Lock, AlertCircle, Chrome } from 'lucide-react';
import { MASCOT_FULL_URL } from '@/src/constants';
import { Logo } from '@/src/components/Logo';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Check for lockout
      const lockoutRef = doc(db, 'lockouts', email.toLowerCase());
      const lockoutSnap = await getDoc(lockoutRef);
      
      if (lockoutSnap.exists()) {
        const data = lockoutSnap.data();
        if (data.lockedUntil) {
          const lockedUntil = new Date(data.lockedUntil);
          if (lockedUntil > new Date()) {
            const minutesLeft = Math.ceil((lockedUntil.getTime() - new Date().getTime()) / 60000);
            setError(`Conta bloqueada temporariamente. Tente novamente em ${minutesLeft} minutos.`);
            setLoading(false);
            return;
          }
        }
      }

      await signInWithEmailAndPassword(auth, email, password);
      
      // 2. Reset lockout on success
      if (lockoutSnap.exists()) {
        await deleteDoc(lockoutRef);
      }
      
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error(err);
      
      // 3. Atomically increment failed attempts — prevents race conditions
      //    where two concurrent failed logins could reset each other's counters.
      try {
        const lockoutRef = doc(db, 'lockouts', email.toLowerCase());
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(lockoutRef);
          const current = snap.exists() ? (snap.data().failedAttempts || 0) : 0;
          const newAttempts = current + 1;
          const payload: Record<string, unknown> = {
            email: email.toLowerCase(),
            failedAttempts: newAttempts,
            lastAttempt: new Date().toISOString(),
          };
          if (newAttempts >= MAX_ATTEMPTS) {
            const lockedUntil = new Date();
            lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCKOUT_MINUTES);
            payload.lockedUntil = lockedUntil.toISOString();
          } else {
            // Remove stale lockout if any (e.g. expired timer)
            payload.lockedUntil = null;
          }
          tx.set(lockoutRef, payload);
        });
      } catch (txErr) {
        console.error('Lockout transaction failed:', txErr);
      }

      if (err?.code === 'auth/configuration-not-found' || err?.code === 'auth/operation-not-allowed') {
        setError('⚠️ Firebase Authentication não está ativado neste projeto. Acesse o Firebase Console → Authentication → Ativar Email/Senha.');
      } else {
        setError('E-mail ou senha incorretos. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      
      // Reset lockout on success
      if (result.user.email) {
        const lockoutRef = doc(db, 'lockouts', result.user.email.toLowerCase());
        await deleteDoc(lockoutRef);
      }
      
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error(err);
      if (err?.code === 'auth/configuration-not-found' || err?.code === 'auth/operation-not-allowed') {
        setError('⚠️ Firebase Authentication não está ativado neste projeto. Acesse o Firebase Console → Authentication → Ativar Email/Senha.');
      } else {
        setError('Erro ao entrar com Google. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Por favor, insira seu e-mail para recuperar a senha.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao enviar e-mail de recuperação. Verifique o endereço digitado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
      {/* Background Mascot Decoration */}
      <div className="absolute -bottom-10 -left-10 opacity-10 hidden lg:block pointer-events-none">
        <img src={MASCOT_FULL_URL} alt="" className="h-96 w-auto grayscale dark:invert" />
      </div>
      <div className="absolute -top-10 -right-10 opacity-10 hidden lg:block pointer-events-none">
        <img src={MASCOT_FULL_URL} alt="" className="h-96 w-auto grayscale rotate-12 dark:invert" />
      </div>

      <Card className="w-full max-w-md relative z-10 shadow-2xl border-none">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-6">
            <Logo size="xl" showText={false} />
          </div>
          <CardTitle className="text-3xl font-black text-blue-600 dark:text-blue-400">EduPonto</CardTitle>
          <p className="text-slate-500 dark:text-slate-400 font-medium tracking-tight">Gestão de Ponto Escolar</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md flex items-start gap-2 text-sm border border-red-100 dark:border-red-900/30">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            
            {resetSent && (
              <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-md flex items-start gap-2 text-sm border border-green-100 dark:border-green-900/30">
                <span>E-mail de recuperação enviado com sucesso! Verifique sua caixa de entrada.</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="email">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-slate-400 dark:text-slate-500" size={18} />
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="seu@email.com" 
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">Senha</label>
                <button 
                  type="button" 
                  onClick={handleForgotPassword}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-400 dark:text-slate-500" size={18} />
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-6 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-slate-900 px-2 text-slate-400 dark:text-slate-500">Ou continue com</span>
            </div>
          </div>

          <div className="mt-6">
            <Button 
              variant="outline" 
              className="w-full gap-2 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800" 
              onClick={handleGoogleLogin}
              disabled={loading}
              type="button"
            >
              <Chrome size={18} className="text-blue-600 dark:text-blue-400" />
              Entrar com Google
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col text-center space-y-2">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Acesso restrito a funcionários autorizados.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
