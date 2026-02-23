'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentWeekDates, getWeekLabel } from '@/lib/expense-calculations';

export async function createTeam(data: {
  teamName: string;
  bgColor: string;
  selectedMembers: string[];
  allocationPerVolunteer: number;
  pooledEnabled: boolean;
  pooledPercentage: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Use service client to bypass RLS
  const serviceClient = await createServiceClient();

  // Verify user is admin
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') return { error: 'Only admins can create teams' };

  // Create team
  const { data: team, error: teamError } = await serviceClient
    .from('teams')
    .insert({
      name: data.teamName,
      background_color: data.bgColor,
      created_by: user.id,
    })
    .select()
    .single();

  if (teamError || !team) return { error: teamError?.message || 'Failed to create team' };

  // Add creator as admin member
  const { error: memberError } = await serviceClient.from('team_members').insert({
    team_id: team.id,
    user_id: user.id,
    role: 'admin',
  });

  if (memberError) return { error: 'Failed to add you as team member: ' + memberError.message };

  // Assign selected members' invites to this team
  if (data.selectedMembers.length > 0) {
    await serviceClient
      .from('invite_requests')
      .update({ assigned_team_id: team.id, assigned_role: 'volunteer' })
      .in('email', data.selectedMembers)
      .eq('status', 'approved');
  }

  // Create the initial week
  const totalKitty = (data.selectedMembers.length + 1) * data.allocationPerVolunteer;
  const { start, end } = getCurrentWeekDates();
  const { error: weekError } = await serviceClient.from('weeks').insert({
    team_id: team.id,
    label: getWeekLabel(new Date()),
    start_date: start.toISOString().split('T')[0],
    end_date: end.toISOString().split('T')[0],
    total_kitty: totalKitty,
    allocation_per_volunteer: data.allocationPerVolunteer,
    pooled_split_enabled: data.pooledEnabled,
    pooled_percentage: data.pooledPercentage,
  });

  if (weekError) return { error: 'Failed to create week: ' + weekError.message };

  return { success: true, teamId: team.id };
}

export async function addTeamMember(data: {
  teamId: string;
  userId: string;
  role: 'volunteer' | 'treasurer';
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const serviceClient = await createServiceClient();

  // Verify caller is admin
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') return { error: 'Only admins can add members' };

  const { error } = await serviceClient
    .from('team_members')
    .insert({ team_id: data.teamId, user_id: data.userId, role: data.role });

  if (error) return { error: error.message };
  return { success: true };
}

export async function ensureCurrentWeek(teamId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Use service client to bypass RLS for week creation
  const serviceClient = await createServiceClient();

  const today = new Date().toISOString().split('T')[0];

  // Check if a week already exists for today
  const { data: existingWeek } = await serviceClient
    .from('weeks')
    .select('*')
    .eq('team_id', teamId)
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
    .single();

  if (existingWeek) return { week: existingWeek };

  // Get the most recent week to copy settings from
  const { data: lastWeek } = await serviceClient
    .from('weeks')
    .select('*')
    .eq('team_id', teamId)
    .order('end_date', { ascending: false })
    .limit(1)
    .single();

  // Get member count for total kitty calculation
  const { count: memberCount } = await serviceClient
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);

  const allocation = lastWeek?.allocation_per_volunteer ?? 100;
  const pooledEnabled = lastWeek?.pooled_split_enabled ?? false;
  const pooledPercentage = lastWeek?.pooled_percentage ?? 80;
  const totalKitty = (memberCount || 1) * allocation;

  const { start, end } = getCurrentWeekDates();

  const { data: newWeek, error } = await serviceClient
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
