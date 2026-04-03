import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signOut,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { UserProfile } from '@/src/types';

const BOOTSTRAP_ADMIN_EMAIL = "profviniciusmcarvalho@gmail.com";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous profile listener if it exists
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setUser(firebaseUser);
      
      if (firebaseUser) {
        const profileRef = doc(db, 'users', firebaseUser.uid);
        
        const startSnapshot = () => {
          unsubProfile = onSnapshot(profileRef, async (docSnap) => {
            if (docSnap.exists()) {
              setProfile(docSnap.data() as UserProfile);
              setLoading(false);
            } else {
              // Bootstrap admin if needed
              if (firebaseUser.email === BOOTSTRAP_ADMIN_EMAIL) {
                const newProfile: UserProfile = {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || '',
                  displayName: firebaseUser.displayName || 'Administrador',
                  role: 'admin',
                  schoolId: 'default-school',
                  workload: 160,
                  startTime: '08:00',
                  endTime: '17:00',
                  createdAt: new Date().toISOString(),
                  permissions: {
                    viewLogs: true,
                    editLogs: true,
                    manageUsers: true,
                    viewReports: true,
                    exportReports: true
                  }
                };
                
                try {
                  await setDoc(profileRef, newProfile);
                } catch (err) {
                  console.error("Error bootstrapping admin:", err);
                }
              } else {
                setProfile(null);
                setLoading(false);
              }
            }
          }, (error) => {
            console.error("Snapshot error for user profile:", error);
            
            if (error.code === 'permission-denied') {
              getDocFromServer(profileRef).then((snap) => {
                if (snap.exists()) {
                  setProfile(snap.data() as UserProfile);
                } else {
                  setProfile(null);
                }
                setLoading(false);
              }).catch(() => {
                setProfile(null);
                setLoading(false);
              });
            } else {
              setLoading(false);
            }
          });
        };

        startSnapshot();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
