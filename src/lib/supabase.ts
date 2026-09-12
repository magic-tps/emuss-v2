import { createClient } from '@supabase/supabase-js';
import type { Json } from '../types/domain';
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isConfigured = Boolean(url && key);
export const supabase = createClient(url || 'http://127.0.0.1:54321', key || 'unconfigured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
export async function rpc<T>(name: string, args: Record<string, Json | undefined> = {}): Promise<T> {
  if (!isConfigured) throw new Error('NOT_CONFIGURED');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
