'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Week, Expense, Profile } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateTotalSpent } from '@/lib/expense-calculations';
import { HistorySkeleton } from '@/components/loading-skeletons';

/* ─── Pure SVG chart colours ─── */
const COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

/* ─── SVG Pie Chart (no dependencies) ─── */
function SvgPieChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 80;

  let cumulative = 0;
  const slices = data.map((d, i) => {
    const fraction = d.value / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += fraction;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;

    const largeArc = fraction > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    // Label position
    const midAngle = (startAngle + endAngle) / 2;
    const labelR = r + 22;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const pct = (fraction * 100).toFixed(0);

    const path =
      data.length === 1
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return { path, color: COLORS[i % COLORS.length], label: d.name, pct, lx, ly, value: d.value };
  });

  return (
    <div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth={2}>
            <title>{`${s.label}: €${s.value.toFixed(2)} (${s.pct}%)`}</title>
          </path>
        ))}
        {slices.map((s, i) => (
          <text
            key={`t-${i}`}
            x={s.lx}
            y={s.ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fill="currentColor"
          >
            {s.pct}%
          </text>
        ))}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1 text-xs">
            <span
              className="inline-block w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="truncate max-w-[120px]">{s.label}</span>
            <span className="text-muted-foreground">&euro;{s.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── SVG Horizontal Bar Chart (no dependencies) ─── */
function SvgBarChart({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value));
  const barH = 28;
  const gap = 6;
  const labelW = 90;
  const chartW = 300;
  const totalW = labelW + chartW + 60;
  const totalH = data.length * (barH + gap) + gap;

  return (
    <svg width="100%" viewBox={`0 0 ${totalW} ${totalH}`} className="max-w-full">
      {data.map((d, i) => {
        const y = gap + i * (barH + gap);
        const barWidth = maxValue > 0 ? (d.value / maxValue) * chartW : 0;
        return (
          <g key={i}>
            <text
              x={labelW - 6}
              y={y + barH / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="currentColor"
            >
              {d.name.length > 12 ? d.name.slice(0, 12) + '...' : d.name}
            </text>
            <rect
              x={labelW}
              y={y}
              width={barWidth}
              height={barH}
              rx={4}
              fill={COLORS[i % COLORS.length]}
            >
              <title>{`${d.name}: €${d.value.toFixed(2)}`}</title>
            </rect>
            <text
              x={labelW + barWidth + 6}
              y={y + barH / 2}
              dominantBaseline="middle"
              fontSize={11}
              fill="currentColor"
            >
              &euro;{d.value.toFixed(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── ExpenseCharts: pure SVG, zero dependencies ─── */
function ExpenseCharts({ expenses }: { expenses: (Expense & { profiles: Profile })[] }) {
  const active = useMemo(() => expenses.filter((e) => !e.is_deleted), [expenses]);

  const descData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of active) {
      const desc = e.description || 'Other';
      map[desc] = (map[desc] || 0) + Number(e.amount);
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [active]);

  const spenderData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of active) {
      const name = e.profiles?.full_name || 'Unknown';
      map[name] = (map[name] || 0) + Number(e.amount);
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [active]);

  const typeData = useMemo(() => {
    let personal = 0;
    let team = 0;
    for (const e of active) {
      if (e.type === 'team') team += Number(e.amount);
      else personal += Number(e.amount);
    }
    const d: { name: string; value: number }[] = [];
    if (personal > 0) d.push({ name: 'Personal', value: Math.round(personal * 100) / 100 });
    if (team > 0) d.push({ name: 'Team', value: Math.round(team * 100) / 100 });
    return d;
  }, [active]);

  if (active.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      {/* Cost Distribution by Item */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Cost Distribution by Item
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <SvgPieChart data={descData} />
        </CardContent>
      </Card>

      {/* Spending by Member */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Spending by Member
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SvgBarChart data={spenderData} />
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
          <CardContent className="flex flex-col items-center">
            <SvgPieChart data={typeData} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Grouping helpers ─── */
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

/* ─── Main HistoryView ─── */
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
