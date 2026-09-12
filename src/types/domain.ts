export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Role = 'SUPER_ADMIN' | 'VENUE_ADMIN' | 'RECEPTIONIST';
export type LaneStatus = 'AVAILABLE' | 'HELD' | 'RESERVED' | 'CHECKED_IN' | 'MAINTENANCE';
export type ReservationStatus = 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export interface Venue { id: string; name: string; address: string; latitude: number | null; longitude: number | null; active: boolean }
export interface Pool { id: string; venue_id: string; name: string; description: string; active: boolean }
export interface Lane { id: string; pool_id: string; number: number; name: string; active: boolean }
export interface UserRole { id: string; user_id: string; role: Role; venue_id: string | null; active: boolean }
export interface Profile { id: string; dni: string | null; first_name: string; last_name: string; phone: string; email: string; created_at: string; updated_at: string }
export interface BookingProfile { dni: string; first_name: string; last_name: string; phone: string; email: string }
export interface Settings { cancellation_hours: number; reschedule_enabled: boolean; booking_days: number; checkin_early_minutes: number }
export interface Catalog { venues: Venue[]; pools: Pool[]; lanes: Lane[]; settings: Settings }
export interface Availability { lane_id: string; number: number; pool_id: string; pool_name: string; venue_id: string; venue_name: string; time_slot_id: string; date: string; start_time: string; end_time: string; starts_at: string; ends_at: string; price: number; status: LaneStatus; hold_expires_at: string | null; is_mine: boolean }
export interface Hold { id: string; lane_id: string; time_slot_id: string; expires_at: string; server_now: string; date?: string; pool_id?: string }
export interface Reservation { id: string; reservation_code: string; user_id: string; venue_id: string; venue_name: string; pool_id: string; pool_name: string; lane_id: string; lane_number: number; time_slot_id: string; date: string; start_time: string; end_time: string; starts_at: string; ends_at: string; price: number; status: ReservationStatus; created_at: string; updated_at: string; cancelled_at: string | null; checked_in_at: string | null; first_name: string; last_name: string; dni_masked: string; phone: string; email: string }
export interface ReservationPage { rows: Reservation[]; total: number }
