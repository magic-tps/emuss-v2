-- Local demonstration infrastructure only. No customers, passwords or production reservations.
insert into public.venues(id,name,address) values
 ('10000000-0000-0000-0000-000000000001','Chacarilla','Sede de demostración · Chacarilla'),
 ('10000000-0000-0000-0000-000000000002','San Borja','Sede de demostración · San Borja'),
 ('10000000-0000-0000-0000-000000000003','Surco','Sede de demostración · Surco');
insert into public.pools(id,venue_id,name,description) select ('20000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'Piscina principal','Nado libre · un carril por reserva' from generate_series(1,3) i;
insert into public.lanes(pool_id,number,name) select p.id,n,'Carril '||n from public.pools p cross join generate_series(1,8) n;
insert into public.schedule_templates(pool_id,day_of_week,open_time,close_time,slot_minutes,price) select p.id,d,'06:00','22:00',60,15 from public.pools p cross join generate_series(0,6) d;
insert into public.time_slots(pool_id,date,start_time,end_time,starts_at,ends_at,price)
select p.id,d::date,make_time(h,0,0),make_time(h+1,0,0),(d::date+make_time(h,0,0)) at time zone 'America/Lima',(d::date+make_time(h+1,0,0)) at time zone 'America/Lima',15
from public.pools p cross join generate_series((now() at time zone 'America/Lima')::date::timestamp,((now() at time zone 'America/Lima')::date+30)::timestamp,interval '1 day') d cross join generate_series(6,21) h;
