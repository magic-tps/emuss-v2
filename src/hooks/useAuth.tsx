import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { isConfigured, rpc, supabase } from '../lib/supabase';
import { queryClient } from '../lib/query';
import type { UserRole } from '../types/domain';

interface AuthValue { user: User | null; roles: UserRole[]; loading: boolean; rolesError: unknown; signOut: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true); const identity = useRef<string | null>(null);
  useEffect(() => {
    let mounted = true; let authEventReceived = false;
    const applyUser = (next: User | null) => {
      if (!mounted) return;
      if (identity.current !== (next?.id ?? null)) { queryClient.clear(); identity.current = next?.id ?? null; }
      setUser(next); setLoading(false);
    };
    if (!isConfigured) { setLoading(false); return; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { authEventReceived = true; applyUser(session?.user ?? null); });
    void supabase.auth.getSession().then(({ data }) => { if (!authEventReceived) applyUser(data.session?.user ?? null); }).catch(() => { if (!authEventReceived) applyUser(null); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  const roles = useQuery({ queryKey: ['roles', user?.id], queryFn: () => rpc<UserRole[]>('get_my_roles'), enabled: !!user, retry: 1 });
  const signOut = async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; queryClient.clear(); setUser(null); };
  return <AuthContext.Provider value={{ user, roles: roles.data ?? [], loading: loading || (!!user && roles.isPending), rolesError: roles.error, signOut }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('AuthProvider is required'); return context; }
