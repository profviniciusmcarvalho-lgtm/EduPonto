import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  MapPin, 
  Smartphone, 
  Monitor, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  PartyPopper,
  X,
  CloudRain,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  doc,
  getDoc,
  Timestamp
} from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Button } from '@/src/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { TimeLog, School } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { MASCOT_STICKER_URL } from '@/src/constants';
import { Logo } from '@/src/components/Logo';

/** Haversine formula — returns distance in metres between two GPS points */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function TimeClock() {
  const { profile } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastLog, setLastLog] = useState<TimeLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [geoStatus, setGeoStatus] = useState<'unknown' | 'inside' | 'outside'>('unknown');
  const [geoDistance, setGeoDistance] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load school geolocation config
  useEffect(() => {
    if (!profile?.schoolId) return;
    getDoc(doc(db, 'schools', profile.schoolId)).then((snap) => {
      if (snap.exists()) setSchool({ id: snap.id, ...snap.data() } as School);
    }).catch(() => {});
  }, [profile?.schoolId]);

  useEffect(() => {
    if (!profile) return;

    const q = query(
      collection(db, 'timeLogs'),
      where('userId', '==', profile.uid),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setLastLog({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as TimeLog);
      } else {
        setLastLog(null);
      }
    }, (error) => {
      console.error("Snapshot error for logs:", error);
      setTimeout(() => {
        handleFirestoreError(error, OperationType.GET, 'timeLogs');
      }, 0);
    });

    // Get location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          setLocation(coords);
          // Compute geofence status
          if (school?.location) {
            const dist = haversineDistance(
              coords.latitude, coords.longitude,
              school.location.latitude, school.location.longitude,
            );
            setGeoDistance(Math.round(dist));
            setGeoStatus(dist <= (school.geoRadius ?? 500) ? 'inside' : 'outside');
          }
        },
        (error) => {
          console.warn("Location error:", error);
        }
      );
    }

    return () => unsubscribe();
  }, [profile]);

  // Re-check geofence if school loads after location is already available
  useEffect(() => {
    if (!school?.location || !location) return;
    const dist = haversineDistance(
      location.latitude, location.longitude,
      school.location.latitude, school.location.longitude,
    );
    setGeoDistance(Math.round(dist));
    setGeoStatus(dist <= (school.geoRadius ?? 500) ? 'inside' : 'outside');
  }, [school, location]);

  const handlePunch = async (type: 'in' | 'out') => {
    if (!profile) return;

    // Block punch if the school has geofence configured and the user is outside
    if (school?.location && geoStatus === 'outside') {
      setStatus({
        type: 'error',
        message: `Você está a ${geoDistance ?? '?'} m da escola — fora do raio permitido (${school.geoRadius ?? 500} m). Aproxime-se da escola para registrar o ponto.`,
      });
      return;
    }
    
    setLoading(true);
    setStatus(null);

    try {
      const device = /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';
      
      const newLog: Omit<TimeLog, 'id'> = {
        userId: profile.uid,
        userName: profile.displayName,
        schoolId: profile.schoolId,
        type,
        timestamp: new Date().toISOString(),
        device,
        location: location || undefined
      };

      await addDoc(collection(db, 'timeLogs'), newLog);
      
      setStatus({
        type: 'success',
        message: `Ponto de ${type === 'in' ? 'entrada' : 'saída'} registrado com sucesso!`
      });

      // Confetti effect
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2563eb', '#10b981', '#ffffff']
      });

      // Clear status after 8 seconds
      setTimeout(() => setStatus(null), 8000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'timeLogs');
      setStatus({
        type: 'error',
        message: "Erro ao registrar ponto. Tente novamente."
      });
    } finally {
      setLoading(false);
    }
  };

  const isNextIn = !lastLog || lastLog.type === 'out';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="text-center space-y-4">
        <div className="flex justify-center">
          <Logo size="md" showText={false} />
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Registrar Ponto</h1>
          <p className="text-slate-500 dark:text-slate-400">Confirme seu horário de trabalho atual.</p>
        </div>
      </header>

      <Card className="overflow-hidden border-none shadow-xl">
        <div className="bg-blue-600 p-8 text-white text-center space-y-2">
          <p className="text-blue-100 font-medium uppercase tracking-wider text-sm">
            {format(currentTime, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
          <h2 className="text-6xl font-bold tracking-tighter">
            {format(currentTime, "HH:mm:ss")}
          </h2>
        </div>
        
        <CardContent className="p-8 space-y-8">
          <AnimatePresence>
            {status && (
              <motion.div 
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  "p-8 rounded-3xl flex flex-col items-center text-center gap-6 border-4 shadow-2xl relative overflow-hidden",
                  status.type === 'success' 
                    ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800 text-green-900 dark:text-green-100" 
                    : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-100"
                )}
              >
                {/* Close Button */}
                <button 
                  onClick={() => setStatus(null)}
                  className="absolute top-4 right-4 p-1 hover:bg-black/5 rounded-full transition-colors z-20"
                >
                  <X size={20} />
                </button>

                {/* Background Decoration */}
                <div className={cn(
                  "absolute -right-6 -top-6 opacity-10",
                  status.type === 'success' ? "text-green-600" : "text-red-600"
                )}>
                  {status.type === 'success' ? <PartyPopper size={160} /> : <CloudRain size={160} />}
                </div>

                <motion.div 
                  animate={status.type === 'success' ? {
                    y: [0, -15, 0],
                    rotate: [0, -8, 8, 0],
                    scale: [1, 1.1, 1]
                  } : {
                    x: [-4, 4, -4, 4, 0],
                    y: [0, 2, 0, 2, 0],
                    filter: ["grayscale(0.5) contrast(1.2)", "grayscale(0.8) contrast(1.4)", "grayscale(0.5) contrast(1.2)"]
                  }}
                  transition={{ 
                    duration: status.type === 'success' ? 1.5 : 0.3, 
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="relative z-10"
                >
                  <img 
                    src={MASCOT_STICKER_URL} 
                    alt="Mascote EduPonto" 
                    className={cn(
                      "h-40 w-40 object-contain drop-shadow-2xl transition-all duration-300",
                      status.type === 'error' && "brightness-75"
                    )}
                  />
                  {status.type === 'error' && (
                    <motion.div 
                      animate={{ y: [-2, 2, -2] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="absolute -top-4 -right-4 text-red-500"
                    >
                      <CloudRain size={32} />
                    </motion.div>
                  )}
                </motion.div>

                <div className="relative z-10 space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    {status.type === 'success' ? (
                      <div className="bg-green-600 text-white p-1 rounded-full">
                        <CheckCircle2 size={24} />
                      </div>
                    ) : (
                      <div className="bg-red-600 text-white p-1 rounded-full">
                        <AlertCircle size={24} />
                      </div>
                    )}
                    <h3 className="text-2xl font-black uppercase tracking-tighter">
                      {status.type === 'success' ? 'Ponto Confirmado!' : 'Ops! Houve um Erro'}
                    </h3>
                  </div>
                  <p className="text-xl font-bold leading-tight max-w-sm mx-auto">
                    {status.message}
                  </p>
                  <p className="text-sm opacity-70 font-medium">
                    {status.type === 'success' ? 'Bom trabalho hoje!' : 'Tente novamente ou contate o suporte.'}
                  </p>
                </div>

                {status.type === 'success' && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    className="absolute -bottom-2 -left-2 bg-blue-600 text-white p-3 rounded-full shadow-lg"
                  >
                    <PartyPopper size={24} />
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-2 gap-4">
            <Button 
              size="lg" 
              className={cn(
                "h-32 flex-col gap-3 text-xl",
                (!isNextIn || geoStatus === 'outside') && "opacity-50 grayscale"
              )}
              onClick={() => handlePunch('in')}
              disabled={loading || !isNextIn || geoStatus === 'outside'}
              title={geoStatus === 'outside' ? 'Fora do raio da escola' : undefined}
            >
              <ArrowRight size={32} />
              <span>Entrada</span>
            </Button>
            
            <Button 
              size="lg" 
              variant="secondary"
              className={cn(
                "h-32 flex-col gap-3 text-xl border-2 border-slate-200 dark:border-slate-800",
                (isNextIn || geoStatus === 'outside') && "opacity-50 grayscale"
              )}
              onClick={() => handlePunch('out')}
              disabled={loading || isNextIn || geoStatus === 'outside'}
              title={geoStatus === 'outside' ? 'Fora do raio da escola' : undefined}
            >
              <ArrowLeft size={32} />
              <span>Saída</span>
            </Button>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            {profile?.startTime && profile?.endTime && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Clock size={16} />
                  <span>Turno Programado:</span>
                </div>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {profile.startTime} - {profile.endTime}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <MapPin size={16} />
                <span>Localização:</span>
              </div>
              <span className={cn(
                "font-medium",
                location ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
              )}>
                {location ? (
                  <a 
                    href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline flex items-center gap-1"
                  >
                    Identificada <ArrowRight size={12} />
                  </a>
                ) : "Não disponível"}
              </span>
            </div>

            {/* Geofence status */}
            {school?.location && location && (
              <div className="flex items-center justify-between text-sm">
                <div className={cn(
                  "flex items-center gap-2",
                  geoStatus === 'inside' ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                )}>
                  {geoStatus === 'inside'
                    ? <ShieldCheck size={16} />
                    : <ShieldAlert size={16} />}
                  <span className="font-medium">
                    {geoStatus === 'inside' ? 'Dentro do raio da escola' : 'Fora do raio da escola'}
                  </span>
                </div>
                <span className="text-slate-500 dark:text-slate-400 text-xs">
                  {geoDistance !== null ? `${geoDistance} m / máx ${school.geoRadius ?? 500} m` : ''}
                </span>
              </div>
            )}
            
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                {/Mobi|Android/i.test(navigator.userAgent) ? <Smartphone size={16} /> : <Monitor size={16} />}
                <span>Dispositivo:</span>
              </div>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {/Mobi|Android/i.test(navigator.userAgent) ? 'Celular' : 'Computador'}
              </span>
            </div>
 
            {lastLog && (
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold mb-1">Último Registro</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {lastLog.type === 'in' ? 'Entrada' : 'Saída'}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {format(new Date(lastLog.timestamp), "HH:mm 'em' dd/MM", { locale: ptBR })}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-slate-400 px-8">
        Ao registrar o ponto, sua localização e horário são capturados automaticamente para fins de auditoria e conformidade.
      </p>
    </div>
  );
}
