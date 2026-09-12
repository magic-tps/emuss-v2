-- EMUSS: PostgreSQL is the sole inventory authority. All times are stored as UTC instants.
set search_path=public,extensions;
create extension if not exists btree_gist with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.staff_role as enum ('SUPER_ADMIN','VENUE_ADMIN','RECEPTIONIST');
create type public.reservation_status as enum ('CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 dni text unique check (dni ~ '^[0-9]{8}$'), first_name text not null default '', last_name text not null default '',
 phone text not null default '', email text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.venues (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 100), address text not null default '',
 latitude numeric check(latitude between -90 and 90), longitude numeric check(longitude between -180 and 180), active boolean not null default true
);
create table public.pools (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id), name text not null check(length(trim(name)) between 2 and 100),
 description text not null default '', active boolean not null default true, unique(id,venue_id)
);
create table public.lanes (
 id uuid primary key default gen_random_uuid(), pool_id uuid not null references public.pools(id), number integer not null check(number between 1 and 100),
 name text not null default '', active boolean not null default true, unique(pool_id,number), unique(id,pool_id)
);
create table public.schedule_templates (
 id uuid primary key default gen_random_uuid(), pool_id uuid not null references public.pools(id), day_of_week integer not null check(day_of_week between 0 and 6),
 open_time time not null, close_time time not null, slot_minutes integer not null default 60 check(slot_minutes between 15 and 240),
 price numeric(10,2) not null default 0 check(price >= 0), active boolean not null default true, check(close_time > open_time),
 unique(pool_id,day_of_week,open_time)
);
create table public.holidays (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id), date date not null, reason text not null,
 unique(venue_id,date)
);
create table public.settings (
 id integer primary key default 1 check(id=1), cancellation_hours integer not null default 2 check(cancellation_hours between 0 and 168),
 reschedule_enabled boolean not null default true, booking_days integer not null default 30 check(booking_days between 1 and 180),
 checkin_early_minutes integer not null default 30 check(checkin_early_minutes between 0 and 120)
);
insert into public.settings(id) values(1);
create table public.time_slots (
 id uuid primary key default gen_random_uuid(), pool_id uuid not null references public.pools(id), date date not null,
 start_time time not null, end_time time not null, starts_at timestamptz not null, ends_at timestamptz not null,
 price numeric(10,2) not null check(price >= 0), active boolean not null default true,
 check(end_time > start_time), check(ends_at > starts_at),
 check(starts_at = (date + start_time) at time zone 'America/Lima'), check(ends_at = (date + end_time) at time zone 'America/Lima'),
 unique(pool_id,date,start_time), unique(id,pool_id),
 exclude using gist (pool_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where (active)
);
create table public.user_roles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id),
 role public.staff_role not null, venue_id uuid references public.venues(id), active boolean not null default true,
 check ((role='SUPER_ADMIN' and venue_id is null) or (role<>'SUPER_ADMIN' and venue_id is not null))
);
create table public.reservations (
 id uuid primary key default gen_random_uuid(), reservation_code text not null unique default ('EMUSS-' || upper(replace(gen_random_uuid()::text,'-',''))),
 user_id uuid not null references public.profiles(id), venue_id uuid not null references public.venues(id),
 pool_id uuid not null, lane_id uuid not null, time_slot_id uuid not null,
 starts_at timestamptz not null, ends_at timestamptz not null, price numeric(10,2) not null check(price>=0),
 status public.reservation_status not null default 'CONFIRMED', created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), cancelled_at timestamptz,
 foreign key(pool_id,venue_id) references public.pools(id,venue_id),
 foreign key(lane_id,pool_id) references public.lanes(id,pool_id),
 foreign key(time_slot_id,pool_id) references public.time_slots(id,pool_id), check(ends_at>starts_at),
 exclude using gist (user_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where (status<>'CANCELLED'),
 exclude using gist (lane_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where (status<>'CANCELLED')
);
create unique index reservations_lane_slot_unique on public.reservations(lane_id,time_slot_id) where status<>'CANCELLED';
create unique index reservations_user_slot_unique on public.reservations(user_id,time_slot_id) where status<>'CANCELLED';
create index reservations_venue_time on public.reservations(venue_id,starts_at);
create index reservations_user_time on public.reservations(user_id,starts_at desc);
create table public.reservation_holds (
 id uuid primary key default gen_random_uuid(), lane_id uuid not null, time_slot_id uuid not null, pool_id uuid not null,
 user_id uuid not null references public.profiles(id), expires_at timestamptz not null default (now()+interval '5 minutes'),
 created_at timestamptz not null default now(), unique(lane_id,time_slot_id),
 foreign key(lane_id,pool_id) references public.lanes(id,pool_id), foreign key(time_slot_id,pool_id) references public.time_slots(id,pool_id),
 check(expires_at<=created_at+interval '5 minutes')
);
create index holds_user on public.reservation_holds(user_id);
create index holds_expiry on public.reservation_holds(expires_at);
create table public.check_ins (
 id uuid primary key default gen_random_uuid(), reservation_id uuid not null unique references public.reservations(id),
 checked_in_by uuid not null references public.profiles(id), checked_in_at timestamptz not null default now()
);
create table public.maintenance_blocks (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id), pool_id uuid not null, lane_id uuid,
 starts_at timestamptz not null, ends_at timestamptz not null, reason text not null check(length(trim(reason)) between 3 and 500),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), check(ends_at>starts_at),
 foreign key(pool_id,venue_id) references public.pools(id,venue_id), foreign key(lane_id,pool_id) references public.lanes(id,pool_id)
);
create index maintenance_period on public.maintenance_blocks using gist(pool_id,tstzrange(starts_at,ends_at,'[)'));
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), admin_id uuid references public.profiles(id), action text not null, entity_type text not null,
 entity_id uuid, venue_id uuid references public.venues(id), metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_time on public.audit_logs(created_at desc);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), reservation_id uuid references public.reservations(id),
 channel text not null default 'EMAIL' check(channel in ('EMAIL','WHATSAPP')), kind text not null,
 status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','SENT','FAILED')), attempts integer not null default 0,
 available_at timestamptz not null default now(), sent_at timestamptz, last_error text, created_at timestamptz not null default now(),
 unique(reservation_id,kind,channel)
);
-- Public invalidation stream deliberately contains no reservation IDs, user IDs or PII.
create table public.availability_events (
 id uuid primary key default gen_random_uuid(), pool_id uuid not null references public.pools(id), date date not null, created_at timestamptz not null default now()
);
create index availability_event_time on public.availability_events(created_at);

create function private.is_super() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_roles where user_id=auth.uid() and active and role='SUPER_ADMIN')
$$;
create function private.can_access(p_venue uuid,p_manage boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_roles where user_id=auth.uid() and active and
 (role='SUPER_ADMIN' or (venue_id=p_venue and (not p_manage or role='VENUE_ADMIN'))))
$$;
create function private.require_user() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'AUTH_REQUIRED'; end if;
 return auth.uid();
end $$;
create function private.audit(p_action text,p_entity text,p_id uuid,p_venue uuid,p_metadata jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.audit_logs(admin_id,action,entity_type,entity_id,venue_id,metadata) values(auth.uid(),p_action,p_entity,p_id,p_venue,p_metadata)
$$;
create function private.sync_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,email,first_name,last_name) values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'first_name',''),coalesce(new.raw_user_meta_data->>'last_name',''))
 on conflict(id) do update set email=excluded.email,updated_at=now();
 return new;
end $$;
create trigger on_auth_user_created after insert or update of email on auth.users for each row execute function private.sync_profile();

create function private.inventory_event() returns trigger language plpgsql security definer set search_path='' as $$
declare v_pool uuid; v_date date;
begin
 if TG_TABLE_NAME='maintenance_blocks' then
  if TG_OP='DELETE' then v_pool:=old.pool_id; else v_pool:=new.pool_id; end if;
  insert into public.availability_events(pool_id,date) select v_pool,s.date from public.time_slots s where s.pool_id=v_pool and s.ends_at>now() group by s.date;
 else
  if TG_OP='DELETE' then select pool_id,date into v_pool,v_date from public.time_slots where id=old.time_slot_id;
  else select pool_id,date into v_pool,v_date from public.time_slots where id=new.time_slot_id; end if;
  if v_pool is not null then insert into public.availability_events(pool_id,date) values(v_pool,v_date); end if;
  if TG_OP='UPDATE' and old.time_slot_id<>new.time_slot_id then
   insert into public.availability_events(pool_id,date) select pool_id,date from public.time_slots where id=old.time_slot_id;
  end if;
 end if;
 return null;
end $$;
create trigger reservations_changed after insert or update or delete on public.reservations for each row execute function private.inventory_event();
create trigger holds_changed after insert or update or delete on public.reservation_holds for each row execute function private.inventory_event();
create trigger maintenance_changed after insert or update or delete on public.maintenance_blocks for each row execute function private.inventory_event();

-- Revoke Supabase's default table and function grants, then explicitly open each API surface.
do $$ declare t text; begin
 foreach t in array array['profiles','venues','pools','lanes','schedule_templates','time_slots','reservations','reservation_holds','check_ins','maintenance_blocks','user_roles','audit_logs','notifications','settings','holidays','availability_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage on schema private to authenticated;
grant execute on function private.is_super(), private.can_access(uuid,boolean) to authenticated;
grant select on public.venues,public.pools,public.lanes,public.time_slots,public.availability_events to anon;
create policy venues_read on public.venues for select to anon,authenticated using(active or private.can_access(id));
create policy pools_read on public.pools for select to anon,authenticated using((active and exists(select 1 from public.venues v where v.id=venue_id and v.active)) or private.can_access(venue_id));
create policy lanes_read on public.lanes for select to anon,authenticated using(exists(select 1 from public.pools p join public.venues v on v.id=p.venue_id where p.id=pool_id and ((lanes.active and p.active and v.active) or private.can_access(v.id))));
create policy slots_read on public.time_slots for select to anon,authenticated using(exists(select 1 from public.pools p join public.venues v on v.id=p.venue_id where p.id=pool_id and ((time_slots.active and p.active and v.active) or private.can_access(v.id))));
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_super() or exists(select 1 from public.reservations r where r.user_id=profiles.id and private.can_access(r.venue_id)));
create policy roles_read on public.user_roles for select to authenticated using(user_id=auth.uid() or private.is_super());
create policy reservations_read on public.reservations for select to authenticated using(user_id=auth.uid() or private.can_access(venue_id));
create policy holds_read on public.reservation_holds for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.pools p where p.id=pool_id and private.can_access(p.venue_id)));
create policy checkins_read on public.check_ins for select to authenticated using(exists(select 1 from public.reservations r where r.id=reservation_id and (r.user_id=auth.uid() or private.can_access(r.venue_id))));
create policy maintenance_read on public.maintenance_blocks for select to authenticated using(private.can_access(venue_id));
create policy schedule_read on public.schedule_templates for select to authenticated using(exists(select 1 from public.pools p where p.id=pool_id and private.can_access(p.venue_id,true)));
create policy holidays_read on public.holidays for select to authenticated using(private.can_access(venue_id,true));
create policy audit_read on public.audit_logs for select to authenticated using(private.is_super());
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid());
create policy settings_read on public.settings for select to authenticated using(private.is_super());
create policy events_read on public.availability_events for select to anon,authenticated using(true);
-- anon policies call the same safe role predicate (auth.uid() is NULL, hence false).
grant usage on schema private to anon;
grant execute on function private.is_super(), private.can_access(uuid,boolean) to anon;
revoke execute on all functions in schema private from public;
-- A schema-level REVOKE does not remove PostgreSQL's global PUBLIC execute default.
alter default privileges revoke execute on functions from public;
-- Supabase also grants anon/authenticated EXECUTE at schema level by default.
alter default privileges revoke execute on functions from anon,authenticated;
alter default privileges in schema public revoke execute on functions from anon,authenticated;
alter default privileges in schema private revoke execute on functions from anon,authenticated;
