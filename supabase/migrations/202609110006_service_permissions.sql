-- Also repairs databases that applied the earlier migrations with Supabase's
-- inherited public-schema grants. These operations have no end-user entrypoint.
revoke execute on function public.process_reservation_jobs(),public.claim_notifications(integer),public.finish_notification(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.process_reservation_jobs(),public.claim_notifications(integer),public.finish_notification(uuid,uuid,boolean,text) to service_role;
alter default privileges revoke execute on functions from public,anon,authenticated;
alter default privileges in schema public revoke execute on functions from anon,authenticated;
alter default privileges in schema private revoke execute on functions from anon,authenticated;
