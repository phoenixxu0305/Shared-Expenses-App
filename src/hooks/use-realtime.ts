'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useRealtimeSubscription(
  table: string,
  teamId: string | undefined,
  onUpdate: () => void
) {
  useEffect(() => {
    if (!teamId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`${table}-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, teamId, onUpdate]);
}
