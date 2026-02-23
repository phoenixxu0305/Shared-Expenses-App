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
import { DashboardSkeleton } from '@/components/loading-skeletons';
import Link from 'next/link';

interface TeamDashboardProps {
  profile: Profile | null;
  membership: (TeamMember & { teams: Team }) | null;
}

export function TeamDashboard({ profile, membership }: TeamDashboardProps) {
  const [week, setWeek] = useState<Week | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);

  const role = membership?.role ?? profile?.role;

  const loadData = useCallback(async function loadDataFn() {
    if (!membership) return;
    const supabase = createClient();

    // Get current week
    const today = new Date().toISOString().split('T')[0];
    const { data: weekData } = await supabase
      .from('weeks')
      .select('*')
      .eq('team_id', membership.team_id)
      .lte('start_date', today)
      .gte('end_date', today)
      .limit(1)
      .single();

    if (weekData) {
      setWeek(weekData);

      // Get expenses for this week
      const { data: expenseData } = await supabase
        .from('expenses')
        .select('*')
        .eq('week_id', weekData.id)
        .order('created_at', { ascending: false });
      setExpenses(expenseData || []);
    }

    // Get member count
    const { count } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', membership.team_id);
    setMemberCount(count || 0);
  }, [membership]);

  useEffect(() => {
    if (!membership) return;
    loadData();
  }, [membership, loadData]);

  // Real-time updates for expenses and fund additions
  useRealtimeSubscription('expenses', membership?.team_id, loadData);
  useRealtimeSubscription('fund_additions', membership?.team_id, loadData);

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

  if (!membership) {
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
        <div className="flex gap-2 flex-wrap">
          {role === 'admin' && (
            <>
              <Button variant="ghost" size="icon" title="Team Settings" asChild>
                <Link href="/team/settings">&#9881;</Link>
              </Button>
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
            role={role!}
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
          role={role!}
          week={week}
          expenses={expenses}
          memberCount={memberCount}
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
