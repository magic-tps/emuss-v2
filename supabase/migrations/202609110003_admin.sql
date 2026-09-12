create function private.require_staff(p_manage boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_user();
 if not exists(select 1 from public.user_roles where user_id=auth.uid() and active and (not p_manage or role<>'RECEPTIONIST')) then raise exception 'FORBIDDEN'; end if;
end $$;

create function public.admin_list(p_entity text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_staff();
 case p_entity
 when 'venues' then select jsonb_agg(v order by name) into result from public.venues v where private.can_access(v.id);
 when 'pools' then select jsonb_agg(p order by name) into result from public.pools p where private.can_access(p.venue_id);
 when 'lanes' then select jsonb_agg(l order by l.number) into result from public.lanes l join public.pools p on p.id=l.pool_id where private.can_access(p.venue_id);
 when 'schedule_templates' then select jsonb_agg(s order by day_of_week,open_time) into result from public.schedule_templates s join public.pools p on p.id=s.pool_id where private.can_access(p.venue_id,true);
 when 'holidays' then select jsonb_agg(h order by date) into result from public.holidays h where private.can_access(h.venue_id,true);
 when 'maintenance_blocks' then select jsonb_agg(x order by starts_at desc) into result from (select m.*,p.name pool_name,v.name venue_name from public.maintenance_blocks m join public.pools p on p.id=m.pool_id join public.venues v on v.id=m.venue_id where private.can_access(m.venue_id)) x;
 when 'settings' then
  if not private.is_super() then raise exception 'FORBIDDEN'; end if;
  select jsonb_agg(s) into result from public.settings s;
 when 'user_roles' then
  if not private.is_super() then raise exception 'FORBIDDEN'; end if;
  select jsonb_agg(x order by email) into result from (select r.*,p.first_name,p.last_name,p.email,v.name venue_name from public.user_roles r join public.profiles p on p.id=r.user_id left join public.venues v on v.id=r.venue_id) x;
 when 'audit_logs' then
  if not private.is_super() then raise exception 'FORBIDDEN'; end if;
  select jsonb_agg(x order by created_at desc) into result from (select a.*,concat_ws(' ',p.first_name,p.last_name) actor_name from public.audit_logs a left join public.profiles p on p.id=a.admin_id order by a.created_at desc limit 1000) x;
 when 'users' then
  perform private.require_staff(true);
  select jsonb_agg(x order by last_name,first_name) into result from (
   select p.id,p.first_name,p.last_name,p.email,coalesce('****'||right(p.dni,4),'') dni_masked,
   count(r.id) reservations,count(r.id) filter(where r.status in ('CHECKED_IN','COMPLETED')) attendances,
   count(r.id) filter(where r.status='CANCELLED') cancellations,count(r.id) filter(where r.status='NO_SHOW') no_shows,max(r.starts_at) last_reservation
   from public.profiles p left join public.reservations r on r.user_id=p.id and private.can_access(r.venue_id,true)
   where private.is_super() or exists(select 1 from public.reservations r2 where r2.user_id=p.id and private.can_access(r2.venue_id,true)) group by p.id
  ) x;
 else raise exception 'INVALID_INPUT'; end case;
 return coalesce(result,'[]'::jsonb);
end $$;

create function public.admin_reservations(p_from date,p_to date,p_venue_id uuid default null,p_pool_id uuid default null,p_lane_id uuid default null,p_status text default null,p_search text default '',p_limit integer default 50,p_offset integer default 0,p_user_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_staff();
 if p_from is null or p_to is null or p_to<p_from or (p_user_id is null and p_to-p_from>3660) or p_limit not between 1 and 500 or p_offset<0 then raise exception 'INVALID_INPUT'; end if;
 with matches as (
 select r.id,r.starts_at from public.reservations r join public.profiles p on p.id=r.user_id
 where private.can_access(r.venue_id) and (r.starts_at at time zone 'America/Lima')::date between p_from and p_to
 and (p_venue_id is null or r.venue_id=p_venue_id) and (p_pool_id is null or r.pool_id=p_pool_id) and (p_lane_id is null or r.lane_id=p_lane_id)
 and (p_status is null or r.status::text=p_status) and (p_user_id is null or r.user_id=p_user_id)
 and (coalesce(p_search,'')='' or concat_ws(' ',r.reservation_code,p.first_name,p.last_name,p.dni,p.email,p.phone) ilike '%'||p_search||'%')
 ), page as (select * from matches order by starts_at desc,id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from matches),'rows',coalesce((select jsonb_agg(private.reservation_json(id) order by starts_at desc,id) from page),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.create_maintenance(p_pool_id uuid,p_lane_ids uuid[],p_starts_at timestamptz,p_ends_at timestamptz,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_venue uuid; v_lane uuid; m public.maintenance_blocks; result jsonb:='[]';
begin
 perform private.require_user();
 perform pg_advisory_xact_lock(8701,1);
 select venue_id into v_venue from public.pools where id=p_pool_id;
 if v_venue is null or not private.can_access(v_venue,true) then raise exception 'FORBIDDEN'; end if;
 if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or coalesce(length(trim(p_reason)),0) not between 3 and 500 or cardinality(p_lane_ids)=0 then raise exception 'INVALID_INPUT'; end if;
 if p_lane_ids is not null and exists(select 1 from unnest(p_lane_ids) x where x is null or not exists(select 1 from public.lanes where id=x and pool_id=p_pool_id)) then raise exception 'INVALID_INPUT'; end if;
 if exists(select 1 from public.reservations r where r.pool_id=p_pool_id and r.status<>'CANCELLED' and (p_lane_ids is null or r.lane_id=any(p_lane_ids)) and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)'))
 or exists(select 1 from public.reservation_holds h join public.time_slots s on s.id=h.time_slot_id where h.pool_id=p_pool_id and h.expires_at>clock_timestamp() and (p_lane_ids is null or h.lane_id=any(p_lane_ids)) and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')) then raise exception 'MAINTENANCE_CONFLICT'; end if;
 foreach v_lane in array coalesce(p_lane_ids,array[null::uuid]) loop
  insert into public.maintenance_blocks(venue_id,pool_id,lane_id,starts_at,ends_at,reason,created_by) values(v_venue,p_pool_id,v_lane,p_starts_at,p_ends_at,trim(p_reason),auth.uid()) returning * into m;
  result:=result||jsonb_build_array(to_jsonb(m)); perform private.audit('MAINTENANCE_CREATED','maintenance_blocks',m.id,v_venue);
 end loop;
 return result;
end $$;
create function public.remove_maintenance(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.maintenance_blocks;
begin
 perform private.require_user(); perform pg_advisory_xact_lock(8701,1);
 select * into m from public.maintenance_blocks where id=p_id;
 if m.id is null or not private.can_access(m.venue_id,true) then raise exception 'FORBIDDEN'; end if;
 delete from public.maintenance_blocks where id=p_id; perform private.audit('MAINTENANCE_REMOVED','maintenance_blocks',p_id,m.venue_id);
end $$;

create function public.generate_time_slots(p_pool_id uuid,p_from date,p_to date) returns integer language plpgsql security definer set search_path='' as $$
declare v_venue uuid; d date; t public.schedule_templates; cursor_at timestamp; finish_at timestamp; n integer:=0; added integer;
begin
 perform private.require_user(); perform pg_advisory_xact_lock(8701,1);
 select venue_id into v_venue from public.pools where id=p_pool_id;
 if v_venue is null or not private.can_access(v_venue,true) then raise exception 'FORBIDDEN'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>180 then raise exception 'INVALID_INPUT'; end if;
 -- Regeneration preserves slots with bookings/holds and replaces only unoccupied future inventory.
 update public.time_slots s set active=false where pool_id=p_pool_id and date between p_from and p_to and starts_at>clock_timestamp()
 and not exists(select 1 from public.reservations r where r.time_slot_id=s.id and r.status<>'CANCELLED')
 and not exists(select 1 from public.reservation_holds h where h.time_slot_id=s.id and h.expires_at>clock_timestamp());
 for d in select x::date from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') x loop
  if exists(select 1 from public.holidays where venue_id=v_venue and date=d) then continue; end if;
  for t in select * from public.schedule_templates where pool_id=p_pool_id and day_of_week=extract(dow from d) and active order by open_time loop
   cursor_at:=d+t.open_time; finish_at:=d+t.close_time;
   while cursor_at+make_interval(mins=>t.slot_minutes)<=finish_at loop
    if cursor_at at time zone 'America/Lima'>clock_timestamp() and not exists(select 1 from public.time_slots s where s.pool_id=p_pool_id and s.active and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(cursor_at at time zone 'America/Lima',(cursor_at+make_interval(mins=>t.slot_minutes)) at time zone 'America/Lima','[)')) then
     insert into public.time_slots(pool_id,date,start_time,end_time,starts_at,ends_at,price) values(p_pool_id,d,cursor_at::time,(cursor_at+make_interval(mins=>t.slot_minutes))::time,cursor_at at time zone 'America/Lima',(cursor_at+make_interval(mins=>t.slot_minutes)) at time zone 'America/Lima',t.price)
     on conflict(pool_id,date,start_time) do update set end_time=excluded.end_time,ends_at=excluded.ends_at,price=excluded.price,active=true
     where not exists(select 1 from public.reservations r where r.time_slot_id=time_slots.id) and not exists(select 1 from public.reservation_holds h where h.time_slot_id=time_slots.id and h.expires_at>clock_timestamp());
     get diagnostics added=row_count; n:=n+added;
    end if;
    cursor_at:=cursor_at+make_interval(mins=>t.slot_minutes);
   end loop;
  end loop;
  insert into public.availability_events(pool_id,date) values(p_pool_id,d);
 end loop;
 perform private.audit('SLOTS_GENERATED','pools',p_pool_id,v_venue,jsonb_build_object('from',p_from,'to',p_to,'count',n));
 return n;
end $$;

create function public.set_staff_role(p_user_id uuid,p_role public.staff_role,p_venue_id uuid,p_active boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.user_roles;
begin
 perform private.require_user(); perform pg_advisory_xact_lock(8701,1);
 if not private.is_super() then raise exception 'FORBIDDEN'; end if;
 if p_role is null or p_active is null or (p_role='SUPER_ADMIN')<>(p_venue_id is null) then raise exception 'INVALID_INPUT'; end if;
 select * into r from public.user_roles where user_id=p_user_id;
 if r.role='SUPER_ADMIN' and r.active and (p_role<>'SUPER_ADMIN' or not p_active) and (select count(*) from public.user_roles where active and role='SUPER_ADMIN')<=1 then raise exception 'LAST_SUPER_ADMIN'; end if;
 insert into public.user_roles(user_id,role,venue_id,active) values(p_user_id,p_role,p_venue_id,p_active) on conflict(user_id) do update set role=excluded.role,venue_id=excluded.venue_id,active=excluded.active returning * into r;
 perform private.audit('STAFF_ROLE_CHANGED','user_roles',r.id,p_venue_id,jsonb_build_object('role',p_role,'active',p_active));
 return to_jsonb(r);
end $$;

grant execute on function public.admin_list(text),public.admin_reservations(date,date,uuid,uuid,uuid,text,text,integer,integer,uuid),public.create_maintenance(uuid,uuid[],timestamptz,timestamptz,text),public.remove_maintenance(uuid),public.generate_time_slots(uuid,date,date),public.set_staff_role(uuid,public.staff_role,uuid,boolean) to authenticated;
