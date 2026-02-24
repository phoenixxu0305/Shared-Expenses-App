'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import type { Expense, Profile } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

function buildDescriptionPieData(expenses: (Expense & { profiles: Profile })[]) {
  const active = expenses.filter((e) => !e.is_deleted);
  const map: Record<string, number> = {};
  for (const e of active) {
    const desc = e.description || 'Other';
    map[desc] = (map[desc] || 0) + Number(e.amount);
  }
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
}

function buildSpenderBarData(expenses: (Expense & { profiles: Profile })[]) {
  const active = expenses.filter((e) => !e.is_deleted);
  const map: Record<string, number> = {};
  for (const e of active) {
    const name = e.profiles?.full_name || 'Unknown';
    map[name] = (map[name] || 0) + Number(e.amount);
  }
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
}

function buildTypePieData(expenses: (Expense & { profiles: Profile })[]) {
  const active = expenses.filter((e) => !e.is_deleted);
  let personal = 0;
  let team = 0;
  for (const e of active) {
    if (e.type === 'team') team += Number(e.amount);
    else personal += Number(e.amount);
  }
  const data = [];
  if (personal > 0) data.push({ name: 'Personal', value: Math.round(personal * 100) / 100 });
  if (team > 0) data.push({ name: 'Team', value: Math.round(team * 100) / 100 });
  return data;
}

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(ref.current);
    setWidth(ref.current.clientWidth);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}

export interface ExpenseChartsProps {
  expenses: (Expense & { profiles: Profile })[];
}

export default function ExpenseCharts({ expenses }: ExpenseChartsProps) {
  const descData = useMemo(() => buildDescriptionPieData(expenses), [expenses]);
  const spenderData = useMemo(() => buildSpenderBarData(expenses), [expenses]);
  const typeData = useMemo(() => buildTypePieData(expenses), [expenses]);

  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  const activeExpenses = expenses.filter((e) => !e.is_deleted);

  if (activeExpenses.length === 0) return null;

  // Calculate chart width based on container and grid columns
  // On lg: 3 cols, md: 2 cols, sm: 1 col. Approximate with gap.
  const chartWidth = containerWidth > 0 ? Math.min(containerWidth, 400) : 350;
  const chartHeight = 250;
  const pieRadius = Math.min(70, chartWidth / 5);

  return (
    <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      {/* Cost distribution by item */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Cost Distribution by Item
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center overflow-x-auto">
          <PieChart width={chartWidth} height={chartHeight}>
            <Pie
              data={descData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={pieRadius}
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

      {/* Spending by member */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Spending by Member
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center overflow-x-auto">
          <BarChart
            width={chartWidth}
            height={chartHeight}
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
          <CardContent className="flex justify-center overflow-x-auto">
            <PieChart width={chartWidth} height={chartHeight}>
              <Pie
                data={typeData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={pieRadius}
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
    </div>
  );
}
