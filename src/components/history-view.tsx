'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Week, Expense, Profile } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateTotalSpent } from '@/lib/expense-calculations';
import { HistorySkeleton } from '@/components/loading-skeletons';
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import React from 'react';

class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 bg-red-50 text-red-700 rounded text-sm">
          Chart error: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

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
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)).map(([, v]) => v);
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
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)).map(([, v]) => v);
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(350);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(ref.current);
    if (ref.current.clientWidth > 0) setWidth(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function ExpenseCharts({ expenses }: { expenses: (Expense & { profiles: Profile })[] }) {
  const [mounted, setMounted] = useState(false);
  const { ref: containerRef, width: containerWidth } = useContainerWidth();

  useEffect(() => { setMounted(true); }, []);

  const active = useMemo(() => expenses.filter((e) => !e.is_deleted), [expenses]);

  const descData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of active) {
      const desc = e.description || 'Other';
      map[desc] = (map[desc] || 0) + Number(e.amount);
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [active]);

  const spenderData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of active) {
      const name = e.profiles?.full_name || 'Unknown';
      map[name] = (map[name] || 0) + Number(e.amount);
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [active]);

  const typeData = useMemo(() => {
    let personal = 0;
    let team = 0;
    for (const e of active) {
      if (e.type === 'team') team += Number(e.amount);
      else personal += Number(e.amount);
    }
    const d = [];
    if (personal > 0) d.push({ name: 'Personal', value: Math.round(personal * 100) / 100 });
    if (team > 0) d.push({ name: 'Team', value: Math.round(team * 100) / 100 });
    return d;
  }, [active]);

  if (active.length === 0) return null;

  // Compute chart size based on measured container
  const chartW = Math.min(containerWidth > 100 ? containerWidth : 350, 400);
  const chartH = 260;
  const pieR = Math.min(75, chartW / 5);

  return (
    <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      {mounted && (
        <>
          {/* Cost Distribution by Item */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Cost Distribution by Item
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <PieChart width={chartW} height={chartH}>
                <Pie
                  data={descData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={pieR}
                  label={(props) => {
                    const n = String(props.name || '');
                    const pct = (Number(props.percent || 0) * 100).toFixed(0);
                    return `${n.length > 12 ? n.slice(0, 12) + '...' : n} ${pct}%`;
                  }}
                  labelLine={false}
                >
                  {descData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `€${Number(value).toFixed(2)}`} />
              </PieChart>
            </CardContent>
          </Card>

          {/* Spending by Member */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Spending by Member
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <BarChart
                width={chartW}
                height={chartH}
                data={spenderData}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `€${v}`} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => `€${Number(value).toFixed(2)}`} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </CardContent>
          </Card>

          {/* Personal vs Team */}
          {typeData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Personal vs Team
                </CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                <PieChart width={chartW} height={chartH}>
                  <Pie
                    data={typeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={pieR}
                    label={(props) => `${props.name} ${(Number(props.percent || 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    <Cell fill="#3b82f6" />
                    <Cell fill="#f59e0b" />
                  </Pie>
                  <Tooltip formatter={(value) => `€${Number(value).toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
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

    if (!weeksData) { setLoading(false); return; }

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

      {/* Top-level charts */}
      <ChartErrorBoundary>
        <ExpenseCharts expenses={allVisibleExpenses} />
      </ChartErrorBoundary>

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
                  onClick={() => setExpandedId(isExpanded ? null : group.label)}
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

                    <ChartErrorBoundary>
                      <ExpenseCharts expenses={group.expenses} />
                    </ChartErrorBoundary>

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
