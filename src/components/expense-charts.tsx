'use client';

import { useMemo } from 'react';
import type { Expense, Profile } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

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

export interface ExpenseChartsProps {
  expenses: (Expense & { profiles: Profile })[];
}

export default function ExpenseCharts({ expenses }: ExpenseChartsProps) {
  const descData = useMemo(() => buildDescriptionPieData(expenses), [expenses]);
  const spenderData = useMemo(() => buildSpenderBarData(expenses), [expenses]);
  const typeData = useMemo(() => buildTypePieData(expenses), [expenses]);

  if (expenses.filter((e) => !e.is_deleted).length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      {/* Cost distribution by item */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Cost Distribution by Item
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={descData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
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
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Spending by member */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Spending by Member
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spenderData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `€${v}`} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => `€${Number(value).toFixed(2)}`} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
          <CardContent>
            <div style={{ width: '100%', height: 256 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(props) => `${props.name} ${(Number(props.percent || 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    <Cell fill="#3b82f6" />
                    <Cell fill="#f59e0b" />
                  </Pie>
                  <Tooltip formatter={(value) => `€${Number(value).toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
