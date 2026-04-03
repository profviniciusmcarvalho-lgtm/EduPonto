import { useState, useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, auth, messaging } from '@/src/lib/firebase';

export function useNotifications() {
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    
    try {
      const status = await Notification.requestPermission();
      setPermission(status);
      
      if (status === 'granted') {
        const msg = await messaging();
        if (msg) {
          // VAPID key is usually needed here. If not provided, it might fail.
          // For AIS, we'll try without it first or use a placeholder if needed.
          const currentToken = await getToken(msg, {
            serviceWorkerRegistration: await navigator.serviceWorker.getRegistration()
          });
          
          if (currentToken) {
            setToken(currentToken);
            await saveTokenToFirestore(currentToken);
          }
        }
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  };

  const saveTokenToFirestore = async (fcmToken: string) => {
    if (!auth.currentUser) return;
    
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        fcmTokens: arrayUnion(fcmToken)
      });
    } catch (error) {
      console.error('Error saving FCM token to Firestore:', error);
    }
  };

  useEffect(() => {
    let unsubscribeForeground: (() => void) | null = null;

    const setupForegroundListener = async () => {
      const msg = await messaging();
      if (msg) {
        unsubscribeForeground = onMessage(msg, (payload) => {
          console.log('Foreground message received:', payload);
          // You can show a custom toast or notification here
          if (Notification.permission === 'granted') {
            new Notification(payload.notification?.title || 'Novo Alerta', {
              body: payload.notification?.body,
              icon: '/logo.png'
            });
          }
        });
      }
    };

    setupForegroundListener();

    return () => {
      if (unsubscribeForeground) unsubscribeForeground();
    };
  }, []);

  return { token, permission, requestPermission };
}
