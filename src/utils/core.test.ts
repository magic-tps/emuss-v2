import { describe, expect, it, vi } from 'vitest';
import { friendlyError } from './errors';
import { bookingDateLimit, alternatives } from '../features/booking/helpers';
import type { Availability } from '../types/domain';

describe('customer error boundaries', () => {
  it('never exposes raw database detail', () => { expect(friendlyError({ message: 'duplicate key violates reservations_user_slot_unique' })).not.toMatch(/duplicate|postgres|unique/i); });
  it('gives actionable expired hold message', () => expect(friendlyError(new Error('HOLD_EXPIRED'))).toContain('Selecciona nuevamente'));
});
describe('booking time and alternatives', () => {
  it('handles month/year boundaries without local timezone drift', () => expect(bookingDateLimit('2026-12-31', 30)).toBe('2027-01-30'));
  it('offers same slot before nearby time and excludes held lanes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-01T00:00:00Z'));
    const row: Availability = { lane_id: '1', number: 1, pool_id: 'p', pool_name: 'Piscina', venue_id: 'v', venue_name: 'Sede', time_slot_id: 's', date: '2026-09-02', start_time: '08:00', end_time: '09:00', starts_at: '2026-09-02T13:00:00Z', ends_at: '2026-09-02T14:00:00Z', price: 10, status: 'AVAILABLE', hold_expires_at: null, is_mine: false };
    expect(alternatives([{ ...row, lane_id: 'held', status: 'HELD' }, { ...row, lane_id: 'later', time_slot_id: 's2', starts_at: '2026-09-02T14:00:00Z' }, { ...row, lane_id: 'same', number: 2 }], row).map(r => r.lane_id)).toEqual(['same', 'later']);
    vi.restoreAllMocks();
  });
});
