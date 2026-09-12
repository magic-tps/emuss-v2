import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, response } from '../_shared/http.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return response({ error: 'INVALID_INPUT' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return response({ error: 'AUTH_REQUIRED' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: identity, error: authError } = await caller.auth.getUser();
  if (authError || !identity.user) return response({ error: 'AUTH_REQUIRED' }, 401);
  const { data: roles, error: roleError } = await caller.rpc('get_my_roles');
  if (roleError || !roles?.some((r: { role: string; active: boolean }) => r.role === 'SUPER_ADMIN' && r.active)) return response({ error: 'FORBIDDEN' }, 403);
  try {
    const body = await request.json();
    if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || !['SUPER_ADMIN', 'VENUE_ADMIN', 'RECEPTIONIST'].includes(body.role)
      || typeof body.first_name !== 'string' || body.first_name.trim().length < 2 || body.first_name.length > 80
      || typeof body.last_name !== 'string' || body.last_name.trim().length < 2 || body.last_name.length > 100
      || (body.role === 'SUPER_ADMIN' ? body.venue_id != null : typeof body.venue_id !== 'string')) return response({ error: 'INVALID_INPUT' }, 400);
    if (body.venue_id) {
      const { data: venues } = await caller.rpc('admin_list', { p_entity: 'venues' });
      if (!venues?.some((v: { id: string; active: boolean }) => v.id === body.venue_id && v.active)) return response({ error: 'INVALID_INPUT' }, 400);
    }
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const redirect = Deno.env.get('APP_URL');
    if (!redirect) return response({ error: 'NOT_CONFIGURED' }, 503);
    const { data, error } = await service.auth.admin.inviteUserByEmail(body.email.trim(), { data: { first_name: body.first_name.trim(), last_name: body.last_name.trim() }, redirectTo: `${redirect.replace(/\/$/, '')}/admin/set-password` });
    if (error || !data.user) return response({ error: 'INVITE_FAILED' }, 400);
    const { error: assignError } = await caller.rpc('set_staff_role', { p_user_id: data.user.id, p_role: body.role, p_venue_id: body.venue_id || null, p_active: true });
    // A failed role assignment leaves a normal account with no staff access.
    if (assignError) return response({ error: 'INVITE_ROLE_FAILED', user_id: data.user.id }, 409);
    return response({ user_id: data.user.id });
  } catch { return response({ error: 'INVALID_INPUT' }, 400); }
});
