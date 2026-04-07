import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, writeBatch, orderBy, limit } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { SystemNotification } from '@/src/types';

export function useSystemNotifications(schoolId: string | undefined) {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, 'notifications'),
      where('schoolId', '==', schoolId),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsub = onSnapshot(q, snap => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemNotification)));
      setLoading(false);
    }, err => console.error('Notifications error:', err));
    return () => unsub();
  }, [schoolId]);

  const markAsRead = useCallback(async (id: string) => {
    try { await updateDoc(doc(db, 'notifications', id), { read: true }); }
    catch (e) { console.error(e); }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db, 'notifications', n.id!), { read: true }));
    try { await batch.commit(); } catch (e) { console.error(e); }
  }, [notifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, loading, unreadCount, markAsRead, markAllAsRead };
}
