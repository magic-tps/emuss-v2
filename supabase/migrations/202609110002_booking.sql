create function private.lock_booking(p_user uuid,p_pool uuid) returns void language plpgsql set search_path='' as $$
begin
 -- Configuration/maintenance take this lock exclusively; reservations take it shared.
 perform pg_advisory_xact_lock_shared(8701,1);
 perform pg_advisory_xact_lock(8702,hashtext(p_user::text));
 perform pg_advisory_xact_lock(8703,hashtext(p_pool::text));
end $$;
create function private.reservation_snapshot() returns trigger language plpgsql set search_path='' as $$
declare s public.time_slots; p public.pools;
begin
 select * into strict s from public.time_slots where id=new.time_slot_id;
 select * into strict p from public.pools where id=s.pool_id;
 new.starts_at:=s.starts_at; new.ends_at:=s.ends_at; new.pool_id:=s.pool_id; new.venue_id:=p.venue_id;
 if TG_OP='INSERT' then new.price:=s.price;
 elsif old.time_slot_id<>new.time_slot_id then new.price:=s.price; end if;
 new.updated_at:=clock_timestamp(); return new;
end $$;
create trigger reservation_snapshot before insert or update on public.reservations for each row execute function private.reservation_snapshot();

create function private.reservation_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(x) from (
 select r.*,v.name as venue_name,p.name as pool_name,l.number as lane_number,s.date,s.start_time,s.end_time,
 pr.first_name,pr.last_name,case when pr.dni is not null then '****'||right(pr.dni,4) else '' end as dni_masked,
 pr.phone,pr.email,c.checked_in_at
 from public.reservations r join public.venues v on v.id=r.venue_id join public.pools p on p.id=r.pool_id
 join public.lanes l on l.id=r.lane_id join public.time_slots s on s.id=r.time_slot_id join public.profiles pr on pr.id=r.user_id
 left join public.check_ins c on c.reservation_id=r.id where r.id=p_id) x
$$;
create function private.assert_slot(p_lane uuid,p_slot uuid,p_user uuid,p_ignore uuid default null) returns public.time_slots language plpgsql security definer set search_path='' as $$
declare s public.time_slots; v_venue uuid;
begin
 select ts.* into s from public.time_slots ts join public.lanes l on l.pool_id=ts.pool_id and l.id=p_lane
 join public.pools p on p.id=ts.pool_id join public.venues v on v.id=p.venue_id
 where ts.id=p_slot and ts.active and l.active and p.active and v.active;
 if s.id is null or s.starts_at<=clock_timestamp() or s.date>(clock_timestamp() at time zone 'America/Lima')::date+(select booking_days from public.settings where id=1) then raise exception 'INVALID_SLOT'; end if;
 select venue_id into v_venue from public.pools where id=s.pool_id;
 if exists(select 1 from public.holidays where venue_id=v_venue and date=s.date) then raise exception 'MAINTENANCE'; end if;
 if exists(select 1 from public.maintenance_blocks m where m.pool_id=s.pool_id and (m.lane_id is null or m.lane_id=p_lane)
 and tstzrange(m.starts_at,m.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')) then raise exception 'MAINTENANCE'; end if;
 if exists(select 1 from public.reservations r where r.lane_id=p_lane and r.status<>'CANCELLED' and (p_ignore is null or r.id<>p_ignore)
 and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')) then raise exception 'LANE_UNAVAILABLE'; end if;
 if exists(select 1 from public.reservations r where r.user_id=p_user and r.status<>'CANCELLED' and (p_ignore is null or r.id<>p_ignore)
 and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')) then raise exception 'USER_OVERLAP'; end if;
 return s;
end $$;

create function public.get_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'venues',coalesce((select jsonb_agg(v order by v.name) from public.venues v where v.active),'[]'::jsonb),
 'pools',coalesce((select jsonb_agg(p order by p.name) from public.pools p join public.venues v on v.id=p.venue_id where p.active and v.active),'[]'::jsonb),
 'lanes',coalesce((select jsonb_agg(l order by l.number) from public.lanes l join public.pools p on p.id=l.pool_id join public.venues v on v.id=p.venue_id where l.active and p.active and v.active),'[]'::jsonb),
 'settings',(select to_jsonb(s)-'id' from public.settings s where id=1))
$$;
create function public.get_availability(p_date date,p_pool_id uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by x.venue_name,x.pool_name,x.start_time,x.number),'[]'::jsonb) from (
 select l.id lane_id,l.number,p.id pool_id,p.name pool_name,v.id venue_id,v.name venue_name,s.id time_slot_id,
 s.date,s.start_time,s.end_time,s.starts_at,s.ends_at,s.price,
 case when exists(select 1 from public.holidays h where h.venue_id=v.id and h.date=s.date) or exists(
 select 1 from public.maintenance_blocks m where m.pool_id=p.id and (m.lane_id is null or m.lane_id=l.id)
 and tstzrange(m.starts_at,m.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')) then 'MAINTENANCE'
 when r.status='CHECKED_IN' then 'CHECKED_IN' when r.id is not null then 'RESERVED'
 when h.id is not null then 'HELD' else 'AVAILABLE' end status,
 h.expires_at hold_expires_at,coalesce(h.user_id=auth.uid(),false) is_mine
 from public.time_slots s join public.pools p on p.id=s.pool_id join public.venues v on v.id=p.venue_id
 join public.lanes l on l.pool_id=p.id
 left join public.reservations r on r.lane_id=l.id and r.time_slot_id=s.id and r.status<>'CANCELLED'
 left join public.reservation_holds h on h.lane_id=l.id and h.time_slot_id=s.id and h.expires_at>clock_timestamp()
 where s.date=p_date and s.active and l.active and p.active and v.active and (p_pool_id is null or p.id=p_pool_id)
 and (s.ends_at>clock_timestamp() or private.can_access(v.id)) and s.date<=(clock_timestamp() at time zone 'America/Lima')::date+(select booking_days from public.settings where id=1)
 ) x
$$;
create function public.get_my_roles() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(r),'[]'::jsonb) from public.user_roles r where user_id=auth.uid() and active
$$;
create function public.my_profile() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p) from public.profiles p where id=auth.uid()
$$;
create function public.my_holds() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'lane_id',h.lane_id,'time_slot_id',h.time_slot_id,'expires_at',h.expires_at,'server_now',clock_timestamp(),'date',s.date,'pool_id',h.pool_id)),'[]'::jsonb)
 from public.reservation_holds h join public.time_slots s on s.id=h.time_slot_id where h.user_id=auth.uid() and h.expires_at>clock_timestamp()
$$;
create function public.acquire_hold(p_lane_id uuid,p_time_slot_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); s public.time_slots; h public.reservation_holds; v_pool uuid; v_now timestamptz;
begin
 select pool_id into v_pool from public.time_slots where id=p_time_slot_id;
 if v_pool is null then raise exception 'INVALID_SLOT'; end if;
 perform private.lock_booking(u,v_pool);
 s:=private.assert_slot(p_lane_id,p_time_slot_id,u);
 delete from public.reservation_holds where expires_at<=clock_timestamp() and (user_id=u or pool_id=v_pool);
 select * into h from public.reservation_holds where lane_id=p_lane_id and time_slot_id=p_time_slot_id;
 if h.id is not null then
  if h.user_id<>u then raise exception 'HOLD_TAKEN'; end if;
  return jsonb_build_object('id',h.id,'lane_id',h.lane_id,'time_slot_id',h.time_slot_id,'expires_at',h.expires_at,'server_now',clock_timestamp());
 end if;
 if exists(select 1 from public.reservation_holds rh join public.time_slots ts on ts.id=rh.time_slot_id where rh.user_id=u
 and rh.expires_at>clock_timestamp() and tstzrange(ts.starts_at,ts.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')) then raise exception 'USER_OVERLAP'; end if;
 if (select count(*) from public.reservation_holds where user_id=u and expires_at>clock_timestamp())>=3 then raise exception 'USER_OVERLAP'; end if;
 v_now:=clock_timestamp();
 insert into public.reservation_holds(lane_id,time_slot_id,pool_id,user_id,created_at,expires_at)
 values(p_lane_id,p_time_slot_id,v_pool,u,v_now,v_now+interval '5 minutes') returning * into h;
 return jsonb_build_object('id',h.id,'lane_id',h.lane_id,'time_slot_id',h.time_slot_id,'expires_at',h.expires_at,'server_now',clock_timestamp());
end $$;
create function public.release_hold(p_hold_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); h public.reservation_holds;
begin
 select * into h from public.reservation_holds where id=p_hold_id and user_id=u;
 if h.id is null then return; end if;
 perform private.lock_booking(u,h.pool_id);
 delete from public.reservation_holds where id=p_hold_id and user_id=u;
end $$;
create function private.save_profile(p_user uuid,p_profile jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_dni text; v_email text;
begin
 select email into v_email from auth.users where id=p_user;
 if p_profile is null or coalesce(p_profile->>'dni','') !~ '^[0-9]{8}$'
 or length(trim(coalesce(p_profile->>'first_name',''))) not between 2 and 80
 or length(trim(coalesce(p_profile->>'last_name',''))) not between 2 and 100
 or coalesce(p_profile->>'phone','') !~ '^\+?[0-9 ()-]{9,20}$'
 or lower(trim(coalesce(p_profile->>'email','')))<>lower(v_email) then raise exception 'INVALID_PROFILE'; end if;
 select dni into v_dni from public.profiles where id=p_user for update;
 if v_dni is not null and v_dni<>p_profile->>'dni' then raise exception 'DNI_IMMUTABLE'; end if;
 update public.profiles set dni=p_profile->>'dni',first_name=trim(p_profile->>'first_name'),last_name=trim(p_profile->>'last_name'),phone=trim(p_profile->>'phone'),email=v_email,updated_at=clock_timestamp() where id=p_user;
exception when unique_violation then raise exception 'DNI_IN_USE';
end $$;
create function public.confirm_reservation(p_hold_id uuid,p_profile jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); h public.reservation_holds; s public.time_slots; r public.reservations;
begin
 select * into h from public.reservation_holds where id=p_hold_id;
 if h.id is null then raise exception 'HOLD_EXPIRED'; end if;
 if h.user_id<>u then raise exception 'HOLD_NOT_OWNED'; end if;
 perform private.lock_booking(u,h.pool_id);
 select * into h from public.reservation_holds where id=p_hold_id for update;
 if h.id is null or h.expires_at<=clock_timestamp() then raise exception 'HOLD_EXPIRED'; end if;
 s:=private.assert_slot(h.lane_id,h.time_slot_id,u);
 perform private.save_profile(u,p_profile);
 insert into public.reservations(user_id,lane_id,time_slot_id) values(u,h.lane_id,h.time_slot_id) returning * into r;
 delete from public.reservation_holds where id=h.id;
 insert into public.notifications(user_id,reservation_id,kind) values(u,r.id,'CONFIRMED');
 perform private.audit('RESERVATION_CONFIRMED','reservations',r.id,r.venue_id);
 return private.reservation_json(r.id);
exception when exclusion_violation then raise exception 'USER_OVERLAP'; when unique_violation then raise exception 'LANE_UNAVAILABLE';
end $$;
create function public.my_reservations() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(private.reservation_json(id) order by starts_at desc),'[]'::jsonb) from public.reservations where user_id=auth.uid()
$$;
create function public.cancel_reservation(p_reservation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); r public.reservations;
begin
 select * into r from public.reservations where id=p_reservation_id;
 if r.id is null or (r.user_id<>u and not private.can_access(r.venue_id,true)) then raise exception 'NOT_FOUND'; end if;
 perform private.lock_booking(r.user_id,r.pool_id);
 select * into r from public.reservations where id=p_reservation_id for update;
 if r.status='CANCELLED' then return private.reservation_json(r.id); end if;
 if r.status<>'CONFIRMED' then raise exception 'INVALID_STATUS'; end if;
 if not private.can_access(r.venue_id,true) and r.starts_at<clock_timestamp()+make_interval(hours=>(select cancellation_hours from public.settings where id=1)) then raise exception 'TOO_LATE'; end if;
 update public.reservations set status='CANCELLED',cancelled_at=clock_timestamp() where id=r.id;
 insert into public.notifications(user_id,reservation_id,kind) values(r.user_id,r.id,'CANCELLED') on conflict do nothing;
 perform private.audit('RESERVATION_CANCELLED','reservations',r.id,r.venue_id);
 return private.reservation_json(r.id);
end $$;
create function public.reschedule_reservation(p_reservation_id uuid,p_lane_id uuid,p_time_slot_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); r public.reservations; s public.time_slots; v_pool uuid; v_venue uuid; v_lock uuid;
begin
 select * into r from public.reservations where id=p_reservation_id;
 if r.id is null or (r.user_id<>u and not private.can_access(r.venue_id,true)) then raise exception 'NOT_FOUND'; end if;
 select pool_id into v_pool from public.time_slots where id=p_time_slot_id;
 if v_pool is null then raise exception 'INVALID_SLOT'; end if;
 select venue_id into v_venue from public.pools where id=v_pool;
 if r.user_id<>u and not private.can_access(v_venue,true) then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock_shared(8701,1);
 perform pg_advisory_xact_lock(8702,hashtext(r.user_id::text));
 for v_lock in select distinct x from unnest(array[r.pool_id,v_pool]) x order by x loop perform pg_advisory_xact_lock(8703,hashtext(v_lock::text)); end loop;
 select * into r from public.reservations where id=p_reservation_id for update;
 if r.status<>'CONFIRMED' then raise exception 'INVALID_STATUS'; end if;
 if not (select reschedule_enabled from public.settings where id=1) then raise exception 'RESCHEDULE_DISABLED'; end if;
 if not private.can_access(r.venue_id,true) and r.starts_at<clock_timestamp()+make_interval(hours=>(select cancellation_hours from public.settings where id=1)) then raise exception 'TOO_LATE'; end if;
 s:=private.assert_slot(p_lane_id,p_time_slot_id,r.user_id,r.id);
 if exists(select 1 from public.reservation_holds h join public.time_slots ts on ts.id=h.time_slot_id where h.expires_at>clock_timestamp()
 and ((h.lane_id=p_lane_id and h.time_slot_id=p_time_slot_id and h.user_id<>r.user_id) or (h.user_id=r.user_id and h.time_slot_id<>p_time_slot_id and tstzrange(ts.starts_at,ts.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')))) then raise exception 'HOLD_TAKEN'; end if;
 update public.reservations set lane_id=p_lane_id,time_slot_id=p_time_slot_id where id=r.id;
 delete from public.reservation_holds where user_id=r.user_id and time_slot_id=p_time_slot_id;
 insert into public.notifications(user_id,reservation_id,kind) values(r.user_id,r.id,'RESCHEDULED-'||gen_random_uuid()::text);
 perform private.audit('RESERVATION_RESCHEDULED','reservations',r.id,r.venue_id,jsonb_build_object('previous_lane',r.lane_id,'previous_slot',r.time_slot_id,'lane_id',p_lane_id,'time_slot_id',p_time_slot_id));
 return private.reservation_json(r.id);
end $$;
create function public.lookup_reservation(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.reservations;
begin
 perform private.require_user();
 select * into r from public.reservations where reservation_code=upper(trim(p_code));
 if r.id is null or not private.can_access(r.venue_id) then raise exception 'NOT_FOUND'; end if;
 return private.reservation_json(r.id);
end $$;
create function public.check_in_reservation(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); r public.reservations;
begin
 select * into r from public.reservations where reservation_code=upper(trim(p_code));
 if r.id is null or not private.can_access(r.venue_id) then raise exception 'NOT_FOUND'; end if;
 perform private.lock_booking(r.user_id,r.pool_id);
 select * into r from public.reservations where id=r.id for update;
 if r.status='CHECKED_IN' then return private.reservation_json(r.id); end if;
 if r.status<>'CONFIRMED' then raise exception 'INVALID_STATUS'; end if;
 if clock_timestamp()<r.starts_at-make_interval(mins=>(select checkin_early_minutes from public.settings where id=1)) or clock_timestamp()>=r.ends_at then raise exception 'CHECKIN_WINDOW'; end if;
 insert into public.check_ins(reservation_id,checked_in_by) values(r.id,u);
 update public.reservations set status='CHECKED_IN' where id=r.id;
 perform private.audit('CHECK_IN','reservations',r.id,r.venue_id);
 return private.reservation_json(r.id);
end $$;
create function public.admin_create_reservation(p_user_id uuid,p_lane_id uuid,p_time_slot_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.time_slots; r public.reservations; v_venue uuid; v_pool uuid;
begin
 perform private.require_user();
 select ts.pool_id,p.venue_id into v_pool,v_venue from public.time_slots ts join public.pools p on p.id=ts.pool_id where ts.id=p_time_slot_id;
 if v_venue is null or not private.can_access(v_venue,true) then raise exception 'FORBIDDEN'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and dni is not null) then raise exception 'INVALID_PROFILE'; end if;
 perform private.lock_booking(p_user_id,v_pool);
 s:=private.assert_slot(p_lane_id,p_time_slot_id,p_user_id);
 if exists(select 1 from public.reservation_holds h join public.time_slots ts on ts.id=h.time_slot_id where h.expires_at>clock_timestamp()
 and ((h.lane_id=p_lane_id and h.time_slot_id=p_time_slot_id) or (h.user_id=p_user_id and tstzrange(ts.starts_at,ts.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')))) then raise exception 'HOLD_TAKEN'; end if;
 insert into public.reservations(user_id,lane_id,time_slot_id) values(p_user_id,p_lane_id,p_time_slot_id) returning * into r;
 insert into public.notifications(user_id,reservation_id,kind) values(p_user_id,r.id,'CONFIRMED');
 perform private.audit('MANUAL_RESERVATION','reservations',r.id,r.venue_id);
 return private.reservation_json(r.id);
end $$;

grant execute on function public.get_catalog(),public.get_availability(date,uuid) to anon,authenticated;
grant execute on function public.get_my_roles(),public.my_profile(),public.my_holds(),public.my_reservations(),public.acquire_hold(uuid,uuid),public.release_hold(uuid),
 public.confirm_reservation(uuid,jsonb),public.cancel_reservation(uuid),public.reschedule_reservation(uuid,uuid,uuid),public.lookup_reservation(text),public.check_in_reservation(text),public.admin_create_reservation(uuid,uuid,uuid) to authenticated;
