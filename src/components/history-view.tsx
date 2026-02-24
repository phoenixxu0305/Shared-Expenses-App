'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { Week, Expense, Profile } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateTotalSpent } from '@/lib/expense-calculations';
import { HistorySkeleton } from '@/components/loading-skeletons';

const ExpenseCharts = dynamic(() => import('@/components/expense-charts'), {
  ssr: false,
  loading: () => <div className="h-64 flex items-center justify-center text-muted-foreground">Loading charts...</div>,
});

interface HistoryViewProps {
  teamId: string | undefined;
  isAdmin?: boolean;
}

interface WeekWithExpenses extends Week {
  expenses: (Expense & { profiles: Profile })[];
}

interface GroupedData {
  label: string;
  key: string;
  totalKitty: number;
  totalSpent: number;
  surplus: number;
  expenses: (Expense & { profiles: Profile })[];
  weeks: WeekWithExpenses[];
}

function groupByMonth(weeks: WeekWithExpenses[]): GroupedData[] {
  const groups: Record<string, GroupedData> = {};

  for (const week of weeks) {
    const date = new Date(week.start_date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

    if (!groups[key]) {
      groups[key] = { label, key, totalKitty: 0, totalSpent: 0, surplus: 0, expenses: [], weeks: [] };
    }
    groups[key].totalKitty += Number(week.total_kitty);
    groups[key].expenses.push(...week.expenses);
    groups[key].weeks.push(week);
  }

  for (const group of Object.values(groups)) {
    group.totalSpent = calculateTotalSpent(group.expenses);
    group.surplus = group.totalKitty - group.totalSpent;
  }

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, v]) => v);
}

function groupByYear(weeks: WeekWithExpenses[]): GroupedData[] {
  const groups: Record<string, GroupedData> = {};

  for (const week of weeks) {
    const year = new Date(week.start_date).getFullYear().toString();

    if (!groups[year]) {
      groups[year] = { label: year, key: year, totalKitty: 0, totalSpent: 0, surplus: 0, expenses: [], weeks: [] };
    }
    groups[year].totalKitty += Number(week.total_kitty);
    groups[year].expenses.push(...week.expenses);
    groups[year].weeks.push(week);
  }

  for (const group of Object.values(groups)) {
    group.totalSpent = calculateTotalSpent(group.expenses);
    group.surplus = group.totalKitty - group.totalSpent;
  }

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, v]) => v);
}

export function HistoryView({ teamId, isAdmin = false }: HistoryViewProps) {
  const [weeks, setWeeks] = useState<WeekWithExpenses[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'year'>('week');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    loadHistory();
  }, [teamId]);

  async function loadHistory() {
    const supabase = createClient();

    const { data: weeksData } = await supabase
      .from('weeks')
      .select('*')
      .eq('team_id', teamId!)
      .order('start_date', { ascending: false });

    if (!weeksData) {
      setLoading(false);
      return;
    }

    const weeksWithExpenses: WeekWithExpenses[] = [];

    for (const week of weeksData) {
      const { data: expenses } = await supabase
        .from('expenses')
        .select('*, profiles(*)')
        .eq('week_id', week.id)
        .order('created_at', { ascending: false });

      weeksWithExpenses.push({
        ...week,
        expenses: (expenses || []) as (Expense & { profiles: Profile })[],
      });
    }

    setWeeks(weeksWithExpenses);
    setLoading(false);
  }

  // Build list of available months for the admin filter dropdown
  const availableMonths = useMemo(() => {
    const monthSet = new Map<string, string>();
    for (const week of weeks) {
      const date = new Date(week.start_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthSet.has(key)) {
        monthSet.set(key, date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }));
      }
    }
    return Array.from(monthSet.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, label]) => ({ key, label }));
  }, [weeks]);

  // Filter weeks by selected month (admin only)
  const filteredWeeks = useMemo(() => {
    if (!isAdmin || selectedMonth === 'all') return weeks;
    return weeks.filter((week) => {
      const date = new Date(week.start_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return key === selectedMonth;
    });
  }, [weeks, selectedMonth, isAdmin]);

  const groupedData = useMemo(() => {
    if (viewMode === 'month') return groupByMonth(filteredWeeks);
    if (viewMode === 'year') return groupByYear(filteredWeeks);
    return filteredWeeks.map((week) => ({
      label: week.label,
      key: week.id,
      totalKitty: Number(week.total_kitty),
      totalSpent: calculateTotalSpent(week.expenses),
      surplus: Number(week.total_kitty) - calculateTotalSpent(week.expenses),
      expenses: week.expenses,
      weeks: [week],
    }));
  }, [filteredWeeks, viewMode]);

  // Aggregate all visible expenses for the top-level charts
  const allVisibleExpenses = useMemo(() => {
    return filteredWeeks.flatMap((w) => w.expenses);
  }, [filteredWeeks]);

  async function exportCSV() {
    if (weeks.length === 0) return;

    const rows = [['Week', 'Date', 'User', 'Description', 'Type', 'Amount', 'Status']];

    for (const week of filteredWeeks) {
      for (const expense of week.expenses) {
        rows.push([
          week.label,
          new Date(expense.created_at).toLocaleDateString(),
          expense.profiles?.full_name || 'Unknown',
          expense.description,
          expense.type,
          Number(expense.amount).toFixed(2),
          expense.is_deleted ? 'Deleted' : 'Active',
        ]);
      }
    }

    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!teamId) {
    return <p className="text-muted-foreground">No team found.</p>;
  }

  if (loading) {
    return <HistorySkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">History</h2>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && availableMonths.length > 0 && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter by month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {availableMonths.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'week' | 'month' | 'year')}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">By Week</SelectItem>
              <SelectItem value="month">By Month</SelectItem>
              <SelectItem value="year">By Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCSV}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Charts section */}
      <ExpenseCharts expenses={allVisibleExpenses} />

      {groupedData.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">
          No historical data yet.
        </p>
      ) : (
        <div className="space-y-4">
          {groupedData.map((group) => {
            const isExpanded = expandedId === group.label;

            return (
              <Card key={group.key}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : group.label)
                  }
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{group.label}</CardTitle>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        Spent: &euro;{group.totalSpent.toFixed(2)}
                      </span>
                      <Badge variant={group.surplus >= 0 ? 'secondary' : 'destructive'}>
                        {group.surplus >= 0 ? '+' : ''}&euro;{group.surplus.toFixed(2)}
                      </Badge>
                      <span className="text-muted-foreground">
                        {isExpanded ? '\u25B2' : '\u25BC'}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent>
                    <div className="text-sm space-y-1 mb-4">
                      <p>Total Kitty: &euro;{group.totalKitty.toFixed(2)}</p>
                      {viewMode !== 'week' && (
                        <p>{group.weeks.length} week{group.weeks.length !== 1 ? 's' : ''}</p>
                      )}
                      {viewMode === 'week' && group.weeks[0] && (
                        <>
                          <p>Per volunteer: &euro;{Number(group.weeks[0].allocation_per_volunteer).toFixed(2)}</p>
                          {group.weeks[0].pooled_split_enabled && (
                            <p>
                              Pooled: {group.weeks[0].pooled_percentage}% team / {100 - group.weeks[0].pooled_percentage}% personal
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Per-group charts when expanded */}
                    <ExpenseCharts expenses={group.expenses} />

                    <Separator className="mb-4" />
                    {group.expenses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No expenses</p>
                    ) : (
                      <div className="space-y-2">
                        {group.expenses.map((expense) => (
                          <div
                            key={expense.id}
                            className={`flex items-center justify-between text-sm p-2 rounded ${
                              expense.is_deleted ? 'opacity-50 line-through' : ''
                            }`}
                          >
                            <div>
                              <span className="font-medium">
                                {expense.profiles?.full_name || 'Unknown'}
                              </span>
                              <span className="text-muted-foreground ml-2">
                                {expense.description}
                              </span>
                              {expense.type === 'team' && (
                                <Badge variant="outline" className="ml-2">Team</Badge>
                              )}
                            </div>
                            <span className="font-medium">
                              &euro;{Number(expense.amount).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
