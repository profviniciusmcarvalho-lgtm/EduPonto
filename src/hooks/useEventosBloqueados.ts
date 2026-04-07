import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '@/src/lib/firebase';
import { EventoEscolar } from '@/src/types';

export function useEventosBloqueados(schoolId: string | undefined) {
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedEvent, setBlockedEvent] = useState<EventoEscolar | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    const today = format(new Date(), 'yyyy-MM-dd');
    // Query events that start on or before today and have bloqueiaRegistro=true
    const q = query(
      collection(db, 'eventosEscolares'),
      where('schoolId', '==', schoolId),
      where('bloqueiaRegistro', '==', true),
      where('data', '<=', today),
    );
    getDocs(q)
      .then(snap => {
        const events = snap.docs.map(d => ({ id: d.id, ...d.data() } as EventoEscolar));
        const blocked = events.find(evt => {
          // Multi-day events: data <= today <= dataFim
          if (evt.dataFim) return evt.data <= today && evt.dataFim >= today;
          // Single-day: exact match
          return evt.data === today;
        });
        setIsBlocked(!!blocked);
        setBlockedEvent(blocked ?? null);
        setLoading(false);
      })
      .catch(() => {
        setIsBlocked(false);
        setBlockedEvent(null);
        setLoading(false);
      });
  }, [schoolId]);

  return { isBlocked, blockedEvent, loading };
}
