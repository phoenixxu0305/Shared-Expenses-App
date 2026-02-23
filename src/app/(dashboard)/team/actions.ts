'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWeekDates, getWeekLabel } from '@/lib/expense-calculations';

export async function ensureCurrentWeek(teamId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const today = new Date().toISOString().split('T')[0];

  // Check if a week already exists for today
  const { data: existingWeek } = await supabase
    .from('weeks')
    .select('*')
    .eq('team_id', teamId)
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
    .single();

  if (existingWeek) return { week: existingWeek };

  // Get the most recent week to copy settings from
  const { data: lastWeek } = await supabase
    .from('weeks')
    .select('*')
    .eq('team_id', teamId)
    .order('end_date', { ascending: false })
    .limit(1)
    .single();

  // Get member count for total kitty calculation
  const { count: memberCount } = await supabase
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);

  const allocation = lastWeek?.allocation_per_volunteer ?? 100;
  const pooledEnabled = lastWeek?.pooled_split_enabled ?? false;
  const pooledPercentage = lastWeek?.pooled_percentage ?? 80;
  const totalKitty = (memberCount || 1) * allocation;

  const { start, end } = getCurrentWeekDates();

  const { data: newWeek, error } = await supabase
    .from('weeks')
    .insert({
      team_id: teamId,
      label: getWeekLabel(new Date()),
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
      total_kitty: totalKitty,
      allocation_per_volunteer: allocation,
      pooled_split_enabled: pooledEnabled,
      pooled_percentage: pooledPercentage,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { week: newWeek, created: true };
}
