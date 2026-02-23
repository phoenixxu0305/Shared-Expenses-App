import type { Week, Expense } from '@/types/database';

export function calculateMaxPersonalExpense(
  week: Week,
  userExpenses: Expense[]
): number {
  const activeExpenses = userExpenses.filter((e) => !e.is_deleted && e.type === 'personal');
  const spent = activeExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  if (week.pooled_split_enabled) {
    const personalAllocation =
      week.allocation_per_volunteer * ((100 - week.pooled_percentage) / 100);
    return Math.max(0, personalAllocation - spent);
  }

  return Math.max(0, Number(week.allocation_per_volunteer) - spent);
}

export function calculateMaxTeamExpense(
  week: Week,
  allTeamExpenses: Expense[],
  memberCount: number
): number {
  const activeTeamExpenses = allTeamExpenses.filter(
    (e) => !e.is_deleted && e.type === 'team'
  );
  const teamSpent = activeTeamExpenses.reduce(
    (sum, e) => sum + Number(e.amount),
    0
  );

  if (week.pooled_split_enabled) {
    const pooledTotal =
      memberCount * week.allocation_per_volunteer * (week.pooled_percentage / 100);
    return Math.max(0, pooledTotal - teamSpent);
  }

  // When pooled split is disabled, team expenses come from total kitty
  return Math.max(0, Number(week.total_kitty) - teamSpent);
}

export function calculateTotalSpent(expenses: Expense[]): number {
  return expenses
    .filter((e) => !e.is_deleted)
    .reduce((sum, e) => sum + Number(e.amount), 0);
}

export function calculateRemaining(week: Week, expenses: Expense[]): number {
  const totalSpent = calculateTotalSpent(expenses);
  return Number(week.total_kitty) - totalSpent;
}

export function getWeekLabel(date: Date): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  return `Week ${weekNumber}, ${date.getFullYear()}`;
}

export function getCurrentWeekDates(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}
