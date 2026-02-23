import { describe, it, expect } from 'vitest';
import {
  calculateMaxPersonalExpense,
  calculateMaxTeamExpense,
  calculateTotalSpent,
  calculateRemaining,
  getWeekLabel,
  getCurrentWeekDates,
} from '@/lib/expense-calculations';
import type { Week, Expense } from '@/types/database';

function makeWeek(overrides: Partial<Week> = {}): Week {
  return {
    id: 'week-1',
    team_id: 'team-1',
    label: 'Week 1, 2025',
    start_date: '2025-01-06',
    end_date: '2025-01-12',
    total_kitty: 400,
    allocation_per_volunteer: 100,
    pooled_split_enabled: false,
    pooled_percentage: 80,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: `exp-${Math.random()}`,
    team_id: 'team-1',
    week_id: 'week-1',
    user_id: 'user-1',
    target_user_id: null,
    amount: 10,
    description: 'Test expense',
    receipt_url: null,
    type: 'personal',
    is_deleted: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('calculateMaxPersonalExpense', () => {
  it('returns full allocation when no expenses', () => {
    const week = makeWeek({ allocation_per_volunteer: 100 });
    expect(calculateMaxPersonalExpense(week, [])).toBe(100);
  });

  it('subtracts personal expenses from allocation', () => {
    const week = makeWeek({ allocation_per_volunteer: 100 });
    const expenses = [makeExpense({ amount: 30 }), makeExpense({ amount: 20 })];
    expect(calculateMaxPersonalExpense(week, expenses)).toBe(50);
  });

  it('ignores deleted expenses', () => {
    const week = makeWeek({ allocation_per_volunteer: 100 });
    const expenses = [
      makeExpense({ amount: 30 }),
      makeExpense({ amount: 20, is_deleted: true }),
    ];
    expect(calculateMaxPersonalExpense(week, expenses)).toBe(70);
  });

  it('ignores team expenses', () => {
    const week = makeWeek({ allocation_per_volunteer: 100 });
    const expenses = [
      makeExpense({ amount: 30 }),
      makeExpense({ amount: 50, type: 'team' }),
    ];
    expect(calculateMaxPersonalExpense(week, expenses)).toBe(70);
  });

  it('applies pooled split correctly', () => {
    // 100 allocation * 20% personal = 20 personal budget
    const week = makeWeek({
      allocation_per_volunteer: 100,
      pooled_split_enabled: true,
      pooled_percentage: 80,
    });
    expect(calculateMaxPersonalExpense(week, [])).toBe(20);
  });

  it('applies pooled split with existing expenses', () => {
    const week = makeWeek({
      allocation_per_volunteer: 100,
      pooled_split_enabled: true,
      pooled_percentage: 80,
    });
    const expenses = [makeExpense({ amount: 15 })];
    expect(calculateMaxPersonalExpense(week, expenses)).toBe(5);
  });

  it('never returns negative', () => {
    const week = makeWeek({ allocation_per_volunteer: 100 });
    const expenses = [makeExpense({ amount: 150 })];
    expect(calculateMaxPersonalExpense(week, expenses)).toBe(0);
  });
});

describe('calculateMaxTeamExpense', () => {
  it('returns total kitty when no pooled split and no expenses', () => {
    const week = makeWeek({ total_kitty: 400 });
    expect(calculateMaxTeamExpense(week, [], 4)).toBe(400);
  });

  it('subtracts team expenses from kitty', () => {
    const week = makeWeek({ total_kitty: 400 });
    const expenses = [makeExpense({ amount: 100, type: 'team' })];
    expect(calculateMaxTeamExpense(week, expenses, 4)).toBe(300);
  });

  it('calculates pooled team budget correctly (PRD example)', () => {
    // 4 members * 100 * 80% = 320 max team expense
    const week = makeWeek({
      allocation_per_volunteer: 100,
      pooled_split_enabled: true,
      pooled_percentage: 80,
    });
    expect(calculateMaxTeamExpense(week, [], 4)).toBe(320);
  });

  it('pooled team budget with existing expenses', () => {
    const week = makeWeek({
      allocation_per_volunteer: 100,
      pooled_split_enabled: true,
      pooled_percentage: 80,
    });
    const expenses = [makeExpense({ amount: 100, type: 'team' })];
    expect(calculateMaxTeamExpense(week, expenses, 4)).toBe(220);
  });

  it('ignores personal and deleted expenses for team calculation', () => {
    const week = makeWeek({ total_kitty: 400 });
    const expenses = [
      makeExpense({ amount: 50, type: 'team' }),
      makeExpense({ amount: 30, type: 'personal' }),
      makeExpense({ amount: 20, type: 'team', is_deleted: true }),
    ];
    expect(calculateMaxTeamExpense(week, expenses, 4)).toBe(350);
  });
});

describe('calculateTotalSpent', () => {
  it('returns 0 for empty expenses', () => {
    expect(calculateTotalSpent([])).toBe(0);
  });

  it('sums active expenses', () => {
    const expenses = [
      makeExpense({ amount: 10 }),
      makeExpense({ amount: 20 }),
      makeExpense({ amount: 30 }),
    ];
    expect(calculateTotalSpent(expenses)).toBe(60);
  });

  it('excludes deleted expenses', () => {
    const expenses = [
      makeExpense({ amount: 10 }),
      makeExpense({ amount: 20, is_deleted: true }),
    ];
    expect(calculateTotalSpent(expenses)).toBe(10);
  });
});

describe('calculateRemaining', () => {
  it('returns kitty minus spent', () => {
    const week = makeWeek({ total_kitty: 400 });
    const expenses = [makeExpense({ amount: 150 })];
    expect(calculateRemaining(week, expenses)).toBe(250);
  });

  it('can return negative when overspent', () => {
    const week = makeWeek({ total_kitty: 100 });
    const expenses = [makeExpense({ amount: 150 })];
    expect(calculateRemaining(week, expenses)).toBe(-50);
  });
});

describe('getWeekLabel', () => {
  it('returns a label with week number and year', () => {
    const label = getWeekLabel(new Date('2025-06-15'));
    expect(label).toMatch(/Week \d+, 2025/);
  });
});

describe('getCurrentWeekDates', () => {
  it('returns start (Monday) and end (Sunday)', () => {
    const { start, end } = getCurrentWeekDates();
    // start should be Monday (day 1)
    expect(start.getDay()).toBe(1);
    // end should be Sunday (day 0)
    expect(end.getDay()).toBe(0);
    // end date should be 6 days after start date
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const diffDays = (endDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(6);
  });
});
