create function public.process_reservation_jobs() returns jsonb language plpgsql security definer set search_path='' as $$
declare expired integer; finished integer;
begin
 perform pg_advisory_xact_lock(8701,1);
 delete from public.reservation_holds where expires_at<=clock_timestamp(); get diagnostics expired=row_count;
 update public.reservations set status=case when status='CHECKED_IN' then 'COMPLETED'::public.reservation_status else 'NO_SHOW'::public.reservation_status end where ends_at<=clock_timestamp() and status in ('CONFIRMED','CHECKED_IN'); get diagnostics finished=row_count;
 delete from public.availability_events where created_at<now()-interval '1 day';
 return jsonb_build_object('expired_holds',expired,'finished_reservations',finished);
end $$;
grant execute on function public.process_reservation_jobs() to service_role;

-- Claims use SKIP LOCKED and a lease token. Old workers cannot acknowledge a new claim.
alter table public.notifications add column claim_token uuid;
alter table public.notifications add column reservation_snapshot jsonb;
create function private.notification_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.reservation_snapshot:=private.reservation_json(new.reservation_id);
 return new;
end $$;
create trigger notification_snapshot before insert on public.notifications for each row execute function private.notification_snapshot();
update public.notifications set reservation_snapshot=private.reservation_json(reservation_id) where reservation_id is not null;
create function public.claim_notifications(p_limit integer default 25) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_limit not between 1 and 100 then raise exception 'INVALID_INPUT'; end if;
 with candidates as (select id from public.notifications where attempts<5 and available_at<=now() and status in ('PENDING','FAILED','PROCESSING') order by created_at for update skip locked limit p_limit),
 claimed as (update public.notifications n set status='PROCESSING',attempts=attempts+1,available_at=now()+interval '5 minutes',claim_token=gen_random_uuid() from candidates c where n.id=c.id returning n.*)
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('reservation',c.reservation_snapshot)),'[]'::jsonb) into result from claimed c;
 return result;
end $$;
create function public.finish_notification(p_id uuid,p_token uuid,p_success boolean,p_error text default null) returns void language sql security definer set search_path='' as $$
 update public.notifications set status=case when p_success then 'SENT' else 'FAILED' end,sent_at=case when p_success then now() else null end,last_error=left(p_error,500),available_at=now()+interval '10 minutes' where id=p_id and claim_token=p_token and status='PROCESSING'
$$;
grant execute on function public.claim_notifications(integer),public.finish_notification(uuid,uuid,boolean,text) to service_role;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.availability_events;
 end if;
end $$;
-- pg_cron is optional for portable PostgreSQL tests; installed automatically on Supabase.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron;
  perform cron.schedule('emuss-reservation-jobs','* * * * *','select public.process_reservation_jobs()');
 end if;
end $$;
