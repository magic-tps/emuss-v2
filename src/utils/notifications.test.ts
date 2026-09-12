import { describe, expect, it, vi } from 'vitest';
import { acknowledgeNotification } from '../../supabase/functions/_shared/acknowledge';

describe('notification acknowledgement', () => {
  it('recovers a transient acknowledgement failure', async () => {
    const finish = vi.fn().mockResolvedValueOnce({ error: { code: 'CONNECTION_FAILED' } }).mockResolvedValue({ error: null });
    const result = await acknowledgeNotification(finish, async () => {});
    expect(result.error).toBeNull();
    expect(finish).toHaveBeenCalledTimes(2);
  });
  it('stops after three failures so the existing queue lease can recover', async () => {
    const finish = vi.fn().mockResolvedValue({ error: { code: 'UNAVAILABLE' } });
    const result = await acknowledgeNotification(finish, async () => {});
    expect(result.error).toEqual({ code: 'UNAVAILABLE' });
    expect(finish).toHaveBeenCalledTimes(3);
  });
});
