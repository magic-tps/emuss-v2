import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isConfigured } from '../lib/supabase';
import { bookingService } from '../services/booking';

export function useCatalog() { return useQuery({ queryKey: ['catalog'], queryFn: bookingService.catalog, staleTime: 60_000 }); }
export function useAvailability(date: string, poolId?: string) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['availability', date, poolId || 'all'], queryFn: () => bookingService.availability(date, poolId), refetchInterval: 15_000, refetchOnWindowFocus: true });
  useEffect(() => {
    if (!isConfigured || !date) return;
    const channel = supabase.channel(`availability:${date}:${poolId || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'availability_events', filter: `date=eq.${date}` }, ({ new: event }) => {
        if (!poolId || event.pool_id === poolId) void client.invalidateQueries({ queryKey: ['availability', date] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [client, date, poolId]);
  return query;
}
