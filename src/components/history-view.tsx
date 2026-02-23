'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Week, Expense, Profile } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateTotalSpent } from '@/lib/expense-calculations';

interface HistoryViewProps {
  teamId: string | undefined;
}

interface WeekWithExpenses extends Week {
  expenses: (Expense & { profiles: Profile })[];
}

export function HistoryView({ teamId }: HistoryViewProps) {
  const [weeks, setWeeks] = useState<WeekWithExpenses[]>([]);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'year'>('week');
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

  async function exportCSV() {
    if (weeks.length === 0) return;

    const rows = [['Week', 'Date', 'User', 'Description', 'Type', 'Amount', 'Status']];

    for (const week of weeks) {
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
    return <p className="text-muted-foreground">Loading history...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">History</h2>
        <div className="flex gap-2">
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

      {weeks.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">
          No historical data yet.
        </p>
      ) : (
        <div className="space-y-4">
          {weeks.map((week) => {
            const totalSpent = calculateTotalSpent(week.expenses);
            const surplus = Number(week.total_kitty) - totalSpent;
            const isExpanded = expandedWeek === week.id;

            return (
              <Card key={week.id}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() =>
                    setExpandedWeek(isExpanded ? null : week.id)
                  }
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{week.label}</CardTitle>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        Spent: €{totalSpent.toFixed(2)}
                      </span>
                      <Badge variant={surplus >= 0 ? 'secondary' : 'destructive'}>
                        {surplus >= 0 ? '+' : ''}€{surplus.toFixed(2)}
                      </Badge>
                      <span className="text-muted-foreground">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent>
                    <div className="text-sm space-y-1 mb-4">
                      <p>Kitty: €{Number(week.total_kitty).toFixed(2)}</p>
                      <p>Per volunteer: €{Number(week.allocation_per_volunteer).toFixed(2)}</p>
                      {week.pooled_split_enabled && (
                        <p>
                          Pooled: {week.pooled_percentage}% team / {100 - week.pooled_percentage}% personal
                        </p>
                      )}
                    </div>
                    <Separator className="mb-4" />
                    {week.expenses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No expenses</p>
                    ) : (
                      <div className="space-y-2">
                        {week.expenses.map((expense) => (
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
                              €{Number(expense.amount).toFixed(2)}
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
