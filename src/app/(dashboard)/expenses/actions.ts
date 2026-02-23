'use server';

import { createClient } from '@/lib/supabase/server';
import type { ExpenseType, DistributionType } from '@/types/database';
import { sendFundsAddedEmail, sendInviteApprovedEmail, sendNewInviteRequestEmail } from '@/lib/email';
import { createServiceClient } from '@/lib/supabase/server';

export async function addExpense(data: {
  teamId: string;
  weekId: string;
  userId: string;
  amount: number;
  description: string;
  type: ExpenseType;
  targetUserId?: string;
  receiptUrl?: string;
}) {
  const supabase = await createClient();

  // Verify the user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Verify membership
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', data.teamId)
    .eq('user_id', user.id)
    .single();

  if (!membership) return { error: 'Not a team member' };

  // Volunteers can only add personal expenses
  if (membership.role === 'volunteer' && data.type === 'team') {
    return { error: 'Volunteers cannot add team expenses' };
  }

  // Validate amount
  if (data.amount <= 0) return { error: 'Amount must be positive' };

  // Get week to validate budget
  const { data: week } = await supabase
    .from('weeks')
    .select('*')
    .eq('id', data.weekId)
    .single();

  if (!week) return { error: 'Week not found' };

  // Get existing expenses for validation
  const { data: existingExpenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('week_id', data.weekId)
    .eq('is_deleted', false);

  if (data.type === 'personal') {
    const userExpenses = (existingExpenses || []).filter(
      (e) => e.user_id === user.id && e.type === 'personal'
    );
    const spent = userExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    let maxAllocation = Number(week.allocation_per_volunteer);
    if (week.pooled_split_enabled) {
      maxAllocation = maxAllocation * ((100 - week.pooled_percentage) / 100);
    }
    if (spent + data.amount > maxAllocation) {
      return { error: `Exceeds personal allocation. Max remaining: €${(maxAllocation - spent).toFixed(2)}` };
    }
  }

  if (data.type === 'team') {
    const teamExpenses = (existingExpenses || []).filter(
      (e) => e.type === 'team'
    );
    const teamSpent = teamExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    if (week.pooled_split_enabled) {
      const { count: memberCount } = await supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', data.teamId);

      const pooledMax =
        (memberCount || 0) * Number(week.allocation_per_volunteer) * (week.pooled_percentage / 100);
      if (teamSpent + data.amount > pooledMax) {
        return { error: `Exceeds pooled team budget. Max remaining: €${(pooledMax - teamSpent).toFixed(2)}` };
      }
    } else {
      if (teamSpent + data.amount > Number(week.total_kitty)) {
        return { error: `Exceeds total kitty. Max remaining: €${(Number(week.total_kitty) - teamSpent).toFixed(2)}` };
      }
    }
  }

  const { error } = await supabase.from('expenses').insert({
    team_id: data.teamId,
    week_id: data.weekId,
    user_id: user.id,
    target_user_id: data.targetUserId || null,
    amount: data.amount,
    description: data.description,
    receipt_url: data.receiptUrl || null,
    type: data.type,
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteExpense(expenseId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('expenses')
    .update({ is_deleted: true })
    .eq('id', expenseId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function addFunds(data: {
  teamId: string;
  weekId: string;
  amount: number;
  distributionType: DistributionType;
  splitPercentage: number | null;
  description: string;
  addedBy: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Verify admin role
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', data.teamId)
    .eq('user_id', user.id)
    .single();

  if (!membership || membership.role !== 'admin') {
    return { error: 'Only admins can add funds' };
  }

  // Insert fund addition record
  const { error: fundError } = await supabase.from('fund_additions').insert({
    team_id: data.teamId,
    week_id: data.weekId,
    amount: data.amount,
    distribution_type: data.distributionType,
    split_percentage: data.splitPercentage,
    description: data.description,
    added_by: user.id,
  });

  if (fundError) return { error: fundError.message };

  // Update the week's total kitty
  const { data: week } = await supabase
    .from('weeks')
    .select('total_kitty')
    .eq('id', data.weekId)
    .single();

  if (week) {
    await supabase
      .from('weeks')
      .update({ total_kitty: Number(week.total_kitty) + data.amount })
      .eq('id', data.weekId);
  }

  // Notify team members about added funds
  const { data: members } = await supabase
    .from('team_members')
    .select('user_id, profiles(full_name)')
    .eq('team_id', data.teamId);

  if (members) {
    for (const member of members) {
      // Get email from auth (service role needed for this in production)
      // For now, log the notification
      const profiles = member.profiles as unknown as { full_name: string } | null;
      if (profiles) {
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(member.user_id);
          if (authUser?.user?.email) {
            await sendFundsAddedEmail(authUser.user.email, data.amount, data.description);
          }
        } catch {
          // Admin API may not be available with anon key — skip email silently
        }
      }
    }
  }

  return { success: true };
}

export async function approveInviteRequest(inviteId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Verify admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { error: 'Only admins can approve invites' };
  }

  const { data: invite, error } = await supabase
    .from('invite_requests')
    .update({ status: 'approved', reviewed_by: user.id })
    .eq('id', inviteId)
    .select()
    .single();

  if (error) return { error: error.message };

  // Send approval email
  if (invite?.email) {
    await sendInviteApprovedEmail(invite.email);
  }

  return { success: true };
}

export async function submitInviteRequest(data: { email: string; note: string | null }) {
  const serviceClient = await createServiceClient();

  // Insert the invite request
  const { error } = await serviceClient
    .from('invite_requests')
    .insert({ email: data.email, note: data.note });

  if (error) return { error: error.message };

  // Find all admin users and notify them
  const { data: admins } = await serviceClient
    .from('profiles')
    .select('id')
    .eq('role', 'admin');

  if (admins) {
    for (const admin of admins) {
      try {
        const { data: authUser } = await serviceClient.auth.admin.getUserById(admin.id);
        if (authUser?.user?.email) {
          await sendNewInviteRequestEmail(authUser.user.email, data.email, data.note);
        }
      } catch {
        // Skip if email fails
      }
    }
  }

  return { success: true };
}

export async function denyInviteRequest(inviteId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('invite_requests')
    .update({ status: 'denied', reviewed_by: user.id })
    .eq('id', inviteId);

  if (error) return { error: error.message };
  return { success: true };
}
