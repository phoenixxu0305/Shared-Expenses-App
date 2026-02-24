'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile, TeamMember, Team, Week, Expense } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExpenseForm } from '@/components/expense-form';
import { ExpenseList } from '@/components/expense-list';
import { AddFundsDialog } from '@/components/add-funds-dialog';
import { calculateTotalSpent, calculateRemaining } from '@/lib/expense-calculations';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';

interface TeamDashboardProps {
  profile: Profile | null;
  memberships: (TeamMember & { teams: Team })[];
}

interface TeamSectionData {
  week: Week | null;
  expenses: Expense[];
  memberCount: number;
  members: { id: string; full_name: string }[];
}

function TeamSection({
  membership,
  profile,
  data,
  loadData,
}: {
  membership: TeamMember & { teams: Team };
  profile: Profile;
  data: TeamSectionData;
  loadData: () => void;
}) {
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const role = membership.role;
  const { week, expenses, memberCount, members } = data;

  const totalSpent = week ? calculateTotalSpent(expenses) : 0;
  const remaining = week ? calculateRemaining(week, expenses) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{membership.teams.name}</h2>
          <p className="text-muted-foreground">
            {week?.label || 'No active week'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {role === 'admin' && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" title="Team Settings">
                    &#8942;
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/team/settings?team=${membership.team_id}&section=weekly`}>
                      Edit Weekly Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/team/settings?team=${membership.team_id}&section=members`}>
                      Edit Team Members
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/team/settings?team=${membership.team_id}&section=appearance`}>
                      Edit Team Appearance
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" onClick={() => setShowAddFunds(true)}>
                Add Funds
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => setShowExpenseForm(true)}>
            Add Expense
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Kitty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {week ? `€${Number(week.total_kitty).toFixed(2)}` : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">€{totalSpent.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${remaining < 0 ? 'text-destructive' : ''}`}>
              €{remaining.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{memberCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pooled split info */}
      {week?.pooled_split_enabled && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Pooled Split Active</Badge>
              <span className="text-sm text-muted-foreground">
                {week.pooled_percentage}% team / {100 - week.pooled_percentage}% personal
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expense list */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Recent Expenses</h3>
        {expenses.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No expenses yet this week.
          </p>
        ) : (
          <ExpenseList
            expenses={expenses}
            currentUserId={profile.id}
            role={role}
            onUpdate={loadData}
          />
        )}
      </div>

      {/* Expense form dialog */}
      {showExpenseForm && week && (
        <ExpenseForm
          open={showExpenseForm}
          onClose={() => setShowExpenseForm(false)}
          teamId={membership.team_id}
          weekId={week.id}
          userId={profile.id}
          role={role}
          week={week}
          expenses={expenses}
          memberCount={memberCount}
          members={members}
          onSuccess={loadData}
        />
      )}

      {/* Add funds dialog */}
      {showAddFunds && week && (
        <AddFundsDialog
          open={showAddFunds}
          onClose={() => setShowAddFunds(false)}
          teamId={membership.team_id}
          weekId={week.id}
          userId={profile.id}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}

export function TeamDashboard({ profile, memberships }: TeamDashboardProps) {
  const [teamData, setTeamData] = useState<Record<string, TeamSectionData>>({});

  const role = memberships.length > 0 ? memberships[0].role : profile?.role;

  const loadAllData = useCallback(async function loadAllDataFn() {
    if (memberships.length === 0) return;
    const supabase = createClient();
    const result: Record<string, TeamSectionData> = {};

    for (const m of memberships) {
      const today = new Date().toISOString().split('T')[0];
      const { data: weekData } = await supabase
        .from('weeks')
        .select('*')
        .eq('team_id', m.team_id)
        .lte('start_date', today)
        .gte('end_date', today)
        .limit(1)
        .single();

      let expenseData: Expense[] = [];
      if (weekData) {
        const { data: ed } = await supabase
          .from('expenses')
          .select('*')
          .eq('week_id', weekData.id)
          .order('created_at', { ascending: false });
        expenseData = ed || [];
      }

      const { count } = await supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', m.team_id);

      const { data: memberData } = await supabase
        .from('team_members')
        .select('user_id, profiles(full_name)')
        .eq('team_id', m.team_id);

      const mapped = (memberData || [])
        .filter((md) => md.user_id !== profile?.id)
        .map((md) => ({
          id: md.user_id,
          full_name: (md.profiles as unknown as { full_name: string } | null)?.full_name || 'Unknown',
        }));

      result[m.team_id] = {
        week: weekData,
        expenses: expenseData,
        memberCount: count || 0,
        members: mapped,
      };
    }

    setTeamData(result);
  }, [memberships, profile?.id]);

  useEffect(() => {
    if (memberships.length === 0) return;
    loadAllData();
  }, [memberships, loadAllData]);

  // Subscribe to realtime for each team
  const teamIds = memberships.map((m) => m.team_id);
  useRealtimeSubscription('expenses', teamIds[0], loadAllData);
  useRealtimeSubscription('fund_additions', teamIds[0], loadAllData);

  if (!profile) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 space-y-4">
        <h2 className="text-2xl font-bold">Welcome!</h2>
        <p className="text-muted-foreground">
          Setting up your profile. Please refresh the page.
        </p>
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 space-y-4">
        <h2 className="text-2xl font-bold">Welcome, {profile.full_name || 'User'}!</h2>
        <p className="text-muted-foreground">
          You are not part of any team yet.
        </p>
        {role === 'admin' ? (
          <Button asChild>
            <Link href="/team/create">Create a Team</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask your admin to add you to a team.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header with Create Team button */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        {role === 'admin' && (
          <Button asChild>
            <Link href="/team/create">Create Team</Link>
          </Button>
        )}
      </div>

      {/* Render each team section */}
      {memberships.map((m) => (
        <div key={m.team_id} className="border-b pb-8 last:border-b-0">
          <TeamSection
            membership={m}
            profile={profile}
            data={teamData[m.team_id] || { week: null, expenses: [], memberCount: 0, members: [] }}
            loadData={loadAllData}
          />
        </div>
      ))}
    </div>
  );
}
