'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentWeekDates, getWeekLabel } from '@/lib/expense-calculations';

export async function createTeam(data: {
  teamName: string;
  bgColor: string;
  selectedMembers: string[]; // emails from invite requests
  selectedUserIds?: string[]; // registered user IDs to add directly
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

  // Insert selected registered users directly as volunteers
  const directUserIds = data.selectedUserIds || [];
  if (directUserIds.length > 0) {
    const rows = directUserIds.map((uid) => ({
      team_id: team.id,
      user_id: uid,
      role: 'volunteer' as const,
    }));
    await serviceClient.from('team_members').insert(rows);
  }

  // Assign selected members' invites to this team
  if (data.selectedMembers.length > 0) {
    await serviceClient
      .from('invite_requests')
      .update({ assigned_team_id: team.id, assigned_role: 'volunteer' })
      .in('email', data.selectedMembers)
      .eq('status', 'approved');
  }

  // Create the initial week (admin has no budget — only count non-admin members)
  const nonAdminMembers = directUserIds.length + data.selectedMembers.length;
  const totalKitty = nonAdminMembers * data.allocationPerVolunteer;
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

export async function addMemberByEmail(data: {
  teamId: string;
  email: string;
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

  // Look up user by email via admin API
  const { data: { users }, error: listError } = await serviceClient.auth.admin.listUsers();
  if (listError) return { error: 'Failed to look up users: ' + listError.message };

  const matchedUser = users.find((u) => u.email === data.email);

  if (matchedUser) {
    // User exists — add directly to team
    const { error } = await serviceClient
      .from('team_members')
      .insert({ team_id: data.teamId, user_id: matchedUser.id, role: data.role });

    if (error) {
      if (error.code === '23505') return { error: 'This user is already on the team' };
      return { error: error.message };
    }
    return { success: true, added: true };
  } else {
    // User not registered — create an approved invite request
    const { error } = await serviceClient
      .from('invite_requests')
      .insert({
        email: data.email,
        status: 'approved',
        assigned_team_id: data.teamId,
        assigned_role: data.role,
      });

    if (error) return { error: error.message };
    return { success: true, invited: true };
  }
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

  // Get non-admin member count for total kitty (admin has no budget)
  const { count: memberCount } = await serviceClient
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .neq('role', 'admin');

  const allocation = lastWeek?.allocation_per_volunteer ?? 100;
  const pooledEnabled = lastWeek?.pooled_split_enabled ?? false;
  const pooledPercentage = lastWeek?.pooled_percentage ?? 80;
  const totalKitty = (memberCount || 0) * allocation;

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

export async function ensureMonthEndReview(teamId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const serviceClient = await createServiceClient();

  // Calculate previous month's key
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = prevMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Check if review already exists
  const { data: existing } = await serviceClient
    .from('month_end_reviews')
    .select('*')
    .eq('team_id', teamId)
    .eq('month_key', monthKey)
    .limit(1)
    .single();

  if (existing) return { review: existing };

  // Calculate previous month date range
  const monthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
  const monthEnd = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Get all weeks that started in the previous month
  const { data: weeks } = await serviceClient
    .from('weeks')
    .select('id, total_kitty')
    .eq('team_id', teamId)
    .gte('start_date', monthStart)
    .lte('start_date', monthEnd);

  if (!weeks || weeks.length === 0) return { review: null };

  const totalKitty = weeks.reduce((sum, w) => sum + Number(w.total_kitty), 0);
  const weekIds = weeks.map((w) => w.id);

  // Sum non-deleted expenses for those weeks
  const { data: expenseRows } = await serviceClient
    .from('expenses')
    .select('amount')
    .in('week_id', weekIds)
    .eq('is_deleted', false);

  const totalSpent = (expenseRows || []).reduce((sum, e) => sum + Number(e.amount), 0);
  const surplus = totalKitty - totalSpent;

  // If no surplus, auto-resolve as 'save'
  const decision = surplus > 0 ? 'pending' : 'save';

  const { data: review, error } = await serviceClient
    .from('month_end_reviews')
    .insert({
      team_id: teamId,
      month_key: monthKey,
      month_label: monthLabel,
      surplus_amount: surplus > 0 ? surplus : 0,
      decision,
      decided_at: surplus <= 0 ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { review };
}

export async function resolveMonthEndReview(data: {
  reviewId: string;
  decision: 'carry_over' | 'save';
  currentWeekId: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const serviceClient = await createServiceClient();

  // Verify admin role
  const { data: membership } = await serviceClient
    .from('team_members')
    .select('role, team_id')
    .eq('user_id', user.id)
    .limit(1);

  // Get the review to check team membership
  const { data: review } = await serviceClient
    .from('month_end_reviews')
    .select('*')
    .eq('id', data.reviewId)
    .single();

  if (!review) return { error: 'Review not found' };

  const adminMembership = (membership || []).find(
    (m) => m.team_id === review.team_id && m.role === 'admin'
  );
  if (!adminMembership) return { error: 'Only admins can resolve month-end reviews' };

  if (review.decision !== 'pending') return { error: 'Review already resolved' };

  if (data.decision === 'carry_over') {
    // Add surplus to current week's total_kitty
    const { data: currentWeek } = await serviceClient
      .from('weeks')
      .select('total_kitty')
      .eq('id', data.currentWeekId)
      .single();

    if (!currentWeek) return { error: 'Current week not found' };

    const newKitty = Number(currentWeek.total_kitty) + Number(review.surplus_amount);

    const { error: weekError } = await serviceClient
      .from('weeks')
      .update({ total_kitty: newKitty })
      .eq('id', data.currentWeekId);

    if (weekError) return { error: 'Failed to update week kitty: ' + weekError.message };

    // Insert fund_additions audit record
    const { error: fundError } = await serviceClient
      .from('fund_additions')
      .insert({
        team_id: review.team_id,
        week_id: data.currentWeekId,
        amount: review.surplus_amount,
        distribution_type: 'group',
        description: `Month-end carry over from ${review.month_label}`,
        added_by: user.id,
      });

    if (fundError) return { error: 'Failed to create fund addition record: ' + fundError.message };
  }

  // Update the review row
  const { error: updateError } = await serviceClient
    .from('month_end_reviews')
    .update({
      decision: data.decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      applied_to_week_id: data.decision === 'carry_over' ? data.currentWeekId : null,
    })
    .eq('id', data.reviewId);

  if (updateError) return { error: updateError.message };
  return { success: true };
}
