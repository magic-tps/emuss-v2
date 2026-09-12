create function public.admin_save(p_entity text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_venue uuid; v_pool uuid; result jsonb; existing jsonb; merged jsonb;
begin
 perform private.require_staff(true); perform pg_advisory_xact_lock(8701,1);
 if p_entity not in ('venues','pools','lanes','schedule_templates','holidays','settings') or p_data is null then raise exception 'INVALID_INPUT'; end if;
 if p_entity='settings' then
  if not private.is_super() then raise exception 'FORBIDDEN'; end if;
  update public.settings set cancellation_hours=coalesce((p_data->>'cancellation_hours')::integer,cancellation_hours),reschedule_enabled=coalesce((p_data->>'reschedule_enabled')::boolean,reschedule_enabled),booking_days=coalesce((p_data->>'booking_days')::integer,booking_days),checkin_early_minutes=coalesce((p_data->>'checkin_early_minutes')::integer,checkin_early_minutes) where id=1 returning to_jsonb(settings.*) into result;
  perform private.audit('SETTINGS_CHANGED','settings',null,null,p_data); return result;
 end if;
 v_id:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
 -- Only allowlisted table names reach this SQL; data values remain parameters.
 execute format('select to_jsonb(t) from public.%I t where id=$1',p_entity) into existing using v_id;
 merged:=coalesce(existing,'{}'::jsonb)||p_data;
 if p_entity='venues' then v_venue:=v_id;
 elsif p_entity in ('pools','holidays') then v_venue:=(merged->>'venue_id')::uuid;
 else v_pool:=(merged->>'pool_id')::uuid; select venue_id into v_venue from public.pools where id=v_pool; end if;
 if p_entity in ('venues','pools') then
  if not private.is_super() then raise exception 'FORBIDDEN'; end if;
 elsif v_venue is null or not private.can_access(v_venue,true) then raise exception 'FORBIDDEN'; end if;
 -- Parent relationships are immutable: moving infrastructure would invalidate booking snapshots.
 if existing is not null and ((existing ? 'venue_id' and existing->>'venue_id' is distinct from merged->>'venue_id') or (existing ? 'pool_id' and existing->>'pool_id' is distinct from merged->>'pool_id')) then raise exception 'INVALID_INPUT'; end if;
 if existing is not null and p_entity in ('venues','pools','lanes') and merged->>'active'='false' and (
 exists(select 1 from public.reservations r where r.ends_at>clock_timestamp() and r.status<>'CANCELLED' and (case p_entity when 'venues' then r.venue_id=v_id when 'pools' then r.pool_id=v_id else r.lane_id=v_id end))
 or exists(select 1 from public.reservation_holds h join public.pools p on p.id=h.pool_id where h.expires_at>clock_timestamp() and (case p_entity when 'venues' then p.venue_id=v_id when 'pools' then h.pool_id=v_id else h.lane_id=v_id end))) then raise exception 'MAINTENANCE_CONFLICT'; end if;
 case p_entity
 when 'venues' then insert into public.venues(id,name,address,latitude,longitude,active) values(v_id,merged->>'name',coalesce(merged->>'address',''),nullif(merged->>'latitude','')::numeric,nullif(merged->>'longitude','')::numeric,coalesce((merged->>'active')::boolean,true)) on conflict(id) do update set name=excluded.name,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,active=excluded.active returning to_jsonb(venues.*) into result;
 when 'pools' then insert into public.pools(id,venue_id,name,description,active) values(v_id,v_venue,merged->>'name',coalesce(merged->>'description',''),coalesce((merged->>'active')::boolean,true)) on conflict(id) do update set name=excluded.name,description=excluded.description,active=excluded.active returning to_jsonb(pools.*) into result;
 when 'lanes' then insert into public.lanes(id,pool_id,number,name,active) values(v_id,v_pool,(merged->>'number')::integer,coalesce(merged->>'name',''),coalesce((merged->>'active')::boolean,true)) on conflict(id) do update set number=excluded.number,name=excluded.name,active=excluded.active returning to_jsonb(lanes.*) into result;
 when 'schedule_templates' then
  if exists(select 1 from public.schedule_templates t where t.pool_id=v_pool and t.id<>v_id and t.active and coalesce((merged->>'active')::boolean,true) and t.day_of_week=(merged->>'day_of_week')::integer and t.open_time<(merged->>'close_time')::time and t.close_time>(merged->>'open_time')::time) then raise exception 'INVALID_INPUT'; end if;
  insert into public.schedule_templates(id,pool_id,day_of_week,open_time,close_time,slot_minutes,price,active) values(v_id,v_pool,(merged->>'day_of_week')::integer,(merged->>'open_time')::time,(merged->>'close_time')::time,(merged->>'slot_minutes')::integer,(merged->>'price')::numeric,coalesce((merged->>'active')::boolean,true)) on conflict(id) do update set day_of_week=excluded.day_of_week,open_time=excluded.open_time,close_time=excluded.close_time,slot_minutes=excluded.slot_minutes,price=excluded.price,active=excluded.active returning to_jsonb(schedule_templates.*) into result;
 when 'holidays' then
  if exists(select 1 from public.reservations r where r.venue_id=v_venue and r.status<>'CANCELLED' and (r.starts_at at time zone 'America/Lima')::date=(merged->>'date')::date)
  or exists(select 1 from public.reservation_holds h join public.time_slots s on s.id=h.time_slot_id join public.pools p on p.id=h.pool_id where p.venue_id=v_venue and s.date=(merged->>'date')::date and h.expires_at>clock_timestamp()) then raise exception 'MAINTENANCE_CONFLICT'; end if;
  insert into public.holidays(id,venue_id,date,reason) values(v_id,v_venue,(merged->>'date')::date,merged->>'reason') on conflict(id) do update set date=excluded.date,reason=excluded.reason returning to_jsonb(holidays.*) into result;
 end case;
 insert into public.availability_events(pool_id,date) select distinct s.pool_id,s.date from public.time_slots s join public.pools p on p.id=s.pool_id where p.venue_id=v_venue and s.ends_at>clock_timestamp();
 perform private.audit('CONFIGURATION_SAVED',p_entity,v_id,v_venue,p_data); return result;
exception when check_violation or not_null_violation or invalid_text_representation or unique_violation or foreign_key_violation then raise exception 'INVALID_INPUT';
end $$;

create function public.admin_delete(p_entity text,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_venue uuid;
begin
 perform private.require_staff(true); perform pg_advisory_xact_lock(8701,1);
 if p_entity='schedule_templates' then select p.venue_id into v_venue from public.schedule_templates t join public.pools p on p.id=t.pool_id where t.id=p_id;
 elsif p_entity='holidays' then select venue_id into v_venue from public.holidays where id=p_id;
 else raise exception 'INVALID_INPUT'; end if;
 if v_venue is null or not private.can_access(v_venue,true) then raise exception 'FORBIDDEN'; end if;
 execute format('delete from public.%I where id=$1',p_entity) using p_id;
 insert into public.availability_events(pool_id,date) select distinct s.pool_id,s.date from public.time_slots s join public.pools p on p.id=s.pool_id where p.venue_id=v_venue and s.ends_at>clock_timestamp();
 perform private.audit('CONFIGURATION_DELETED',p_entity,p_id,v_venue);
end $$;
grant execute on function public.admin_save(text,jsonb),public.admin_delete(text,uuid) to authenticated;

create function public.admin_dashboard(p_from date,p_to date,p_venue_id uuid default null,p_pool_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_staff(true);
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'INVALID_INPUT'; end if;
 with scoped as (select r.*,s.date,s.start_time from public.reservations r join public.time_slots s on s.id=r.time_slot_id where private.can_access(r.venue_id,true) and s.date between p_from and p_to and (p_venue_id is null or r.venue_id=p_venue_id) and (p_pool_id is null or r.pool_id=p_pool_id)),
 capacity as (select s.id,s.pool_id,p.venue_id,s.date,s.start_time,l.id lane_id from public.time_slots s join public.pools p on p.id=s.pool_id join public.venues v on v.id=p.venue_id join public.lanes l on l.pool_id=p.id where private.can_access(p.venue_id,true) and s.date between p_from and p_to and s.active and p.active and v.active and l.active and (p_venue_id is null or p.venue_id=p_venue_id) and (p_pool_id is null or p.id=p_pool_id)
 and not exists(select 1 from public.holidays h where h.venue_id=v.id and h.date=s.date)
 and not exists(select 1 from public.maintenance_blocks m where m.pool_id=p.id and (m.lane_id is null or m.lane_id=l.id) and tstzrange(m.starts_at,m.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)'))),
 days as (select d::date date,count(r.id) reservations,count(r.id) filter(where r.status in ('CHECKED_IN','COMPLETED')) check_ins,count(r.id) filter(where r.status='CANCELLED') cancellations,count(r.id) filter(where r.status='NO_SHOW') no_shows from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d left join scoped r on r.date=d::date group by d),
 weeks as (select date_trunc('week',date)::date date,sum(reservations) reservations,sum(check_ins) check_ins,sum(cancellations) cancellations,sum(no_shows) no_shows from days group by 1),
 months as (select date_trunc('month',date)::date date,sum(reservations) reservations,sum(check_ins) check_ins,sum(cancellations) cancellations,sum(no_shows) no_shows from days group by 1),
 venue_stats as (select v.name,(select count(*) from scoped r where r.venue_id=v.id and r.status<>'CANCELLED') reservations,(select count(*) from capacity c where c.venue_id=v.id) capacity from public.venues v where private.can_access(v.id,true) and (p_venue_id is null or v.id=p_venue_id) and (p_pool_id is null or exists(select 1 from public.pools p where p.id=p_pool_id and p.venue_id=v.id))),
 hour_stats as (select to_char(c.start_time,'HH24:MI') as "hour",count(*) capacity,(select count(*) from scoped r where r.start_time=c.start_time and r.status<>'CANCELLED') reservations from capacity c group by c.start_time),
 lane_stats as (select concat(v.name,' · ',p.name,' · C',l.number) name,count(*) reservations from scoped r join public.lanes l on l.id=r.lane_id join public.pools p on p.id=r.pool_id join public.venues v on v.id=r.venue_id where r.status<>'CANCELLED' group by v.name,p.name,l.number)
 select jsonb_build_object('kpis',jsonb_build_object(
 'today_reservations',(select count(*) from public.reservations r where private.can_access(r.venue_id,true) and (r.starts_at at time zone 'America/Lima')::date=(now() at time zone 'America/Lima')::date and r.status<>'CANCELLED' and (p_venue_id is null or r.venue_id=p_venue_id) and (p_pool_id is null or r.pool_id=p_pool_id)),
 'occupancy',coalesce(round(100.0*(select count(*) from scoped where status<>'CANCELLED')/nullif((select count(*) from capacity),0),1),0),
 'available_lanes',(select count(*) from jsonb_array_elements(public.get_availability((now() at time zone 'America/Lima')::date,p_pool_id)) x where x->>'status'='AVAILABLE' and (x->>'starts_at')::timestamptz>clock_timestamp() and private.can_access((x->>'venue_id')::uuid,true) and (p_venue_id is null or (x->>'venue_id')::uuid=p_venue_id)),
 'check_ins',(select count(*) from scoped where status in ('CHECKED_IN','COMPLETED')),
 'cancellations',(select count(*) from scoped where status='CANCELLED'),'no_shows',(select count(*) from scoped where status='NO_SHOW'),
 'new_users',(select count(*) from public.profiles p where (p.created_at at time zone 'America/Lima')::date between p_from and p_to and exists(select 1 from scoped r where r.user_id=p.id)),
 'future_reservations',(select count(*) from public.reservations r where r.starts_at>clock_timestamp() and r.status='CONFIRMED' and private.can_access(r.venue_id,true) and (p_venue_id is null or r.venue_id=p_venue_id) and (p_pool_id is null or r.pool_id=p_pool_id)),
 'returning_users',(select count(*) from (select user_id from scoped where status<>'CANCELLED' group by user_id having count(*)>1) x)),
 'daily',coalesce((select jsonb_agg(days order by date) from days),'[]'::jsonb),
 'weekly',coalesce((select jsonb_agg(weeks order by date) from weeks),'[]'::jsonb),
 'monthly',coalesce((select jsonb_agg(months order by date) from months),'[]'::jsonb),
 'venues',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('occupancy',coalesce(round(100.0*reservations/nullif(capacity,0),1),0))) from venue_stats v),'[]'::jsonb),
 'hours',coalesce((select jsonb_agg(h order by h.hour) from hour_stats h),'[]'::jsonb),
 'lanes',coalesce((select jsonb_agg(l order by reservations desc) from lane_stats l),'[]'::jsonb)) into result;
 return result;
end $$;
grant execute on function public.admin_dashboard(date,date,uuid,uuid) to authenticated;
