import type { BudgetContext } from './types';
import type { SavingsGoal } from './goalStorage';

function formatCents(amount: number): string {
  return '$' + (Math.abs(amount) / 100).toFixed(2);
}

export type GoalProgress = {
  goal: SavingsGoal;
  currentSaved: number;
  targetAmount: number;
  remainingAmount: number;
  monthsRemaining: number;
  requiredMonthlySavings: number;
  actualMonthlySavings: number;
  onTrack: boolean;
  projectedCompletion: string | null;
};

export type MonthlyProjection = {
  month: string;
  dayOfMonth: number;
  daysInMonth: number;
  spentSoFar: number;
  dailyAverage: number;
  projectedTotal: number;
  budgetedTotal: number;
  projectedOverUnder: number;
  assumption: string;
};

export type CategoryForecast = {
  categoryName: string;
  budgeted: number;
  spentSoFar: number;
  dailyAverage: number;
  projectedTotal: number;
  projectedOverUnder: number;
  status: 'under' | 'on-track' | 'over';
};

export type DebtPayoff = {
  accountName: string;
  balance: number;
  averageMonthlyPayment: number;
  monthsToPayoff: number;
  payoffDate: string;
  acceleratedPayments: Array<{
    extraAmount: number;
    monthsToPayoff: number;
    payoffDate: string;
    interestSaved: string;
  }>;
};

export type WhatIfResult = {
  scenario: string;
  originalMonthlySpend: number;
  adjustedMonthlySpend: number;
  monthlySavings: number;
  annualSavings: number;
  impactOnGoals: Array<{
    goalName: string;
    originalMonths: number;
    newMonths: number;
    improvement: string;
  }>;
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function calculateGoalProgress(
  goal: SavingsGoal,
  context: BudgetContext,
  monthlyNetSavings: number,
): GoalProgress {
  let currentSaved = 0;
  if (goal.associatedAccountIds && goal.associatedAccountIds.length > 0) {
    for (const accId of goal.associatedAccountIds) {
      const acc = context.accounts.find(a => a.id === accId);
      if (acc) currentSaved += acc.balance;
    }
  } else {
    for (const acc of context.accounts) {
      if (acc.balance > 0) {
        currentSaved += acc.balance;
      }
    }
  }

  const targetAmount = goal.targetAmount;
  const remainingAmount = Math.max(0, targetAmount - currentSaved);
  const targetDate = new Date(goal.targetDate);
  const now = new Date();
  const monthsRemaining = Math.max(
    0,
    (targetDate.getFullYear() - now.getFullYear()) * 12 +
      (targetDate.getMonth() - now.getMonth()),
  );

  const requiredMonthlySavings =
    monthsRemaining > 0 ? remainingAmount / monthsRemaining : remainingAmount;

  const actualMonthlySavings = monthlyNetSavings;
  const onTrack =
    currentSaved >= targetAmount || actualMonthlySavings >= requiredMonthlySavings;

  let projectedCompletion: string | null = null;
  if (actualMonthlySavings > 0 && remainingAmount > 0) {
    const monthsNeeded = Math.ceil(remainingAmount / actualMonthlySavings);
    const projected = new Date(now);
    projected.setMonth(projected.getMonth() + monthsNeeded);
    projectedCompletion = `${projected.getFullYear()}-${String(projected.getMonth() + 1).padStart(2, '0')}`;
  }

  return {
    goal,
    currentSaved,
    targetAmount,
    remainingAmount,
    monthsRemaining,
    requiredMonthlySavings,
    actualMonthlySavings,
    onTrack,
    projectedCompletion,
  };
}

export function projectMonthlySpending(context: BudgetContext): MonthlyProjection | null {
  if (!context.budgetMonth) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dayOfMonth = now.getDate();
  const daysInMonth = getDaysInMonth(year, month);

  const spentSoFar = Math.abs(context.budgetMonth.totalSpent);
  const dailyAverage = dayOfMonth > 0 ? spentSoFar / dayOfMonth : 0;
  const remainingDays = daysInMonth - dayOfMonth;
  const projectedTotal = spentSoFar + dailyAverage * remainingDays;
  const budgetedTotal = context.budgetMonth.totalBudgeted;
  const projectedOverUnder = budgetedTotal - projectedTotal;

  return {
    month: context.currentMonth,
    dayOfMonth,
    daysInMonth,
    spentSoFar,
    dailyAverage,
    projectedTotal,
    budgetedTotal,
    projectedOverUnder,
    assumption: `Based on ${dayOfMonth} days of spending at ${formatCents(dailyAverage)}/day, projected over ${remainingDays} remaining days`,
  };
}

export function forecastByCategory(context: BudgetContext): CategoryForecast[] {
  if (!context.budgetMonth) return [];

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = getDaysInMonth(now.getFullYear(), now.getMonth() + 1);
  const remainingDays = daysInMonth - dayOfMonth;

  return context.budgetMonth.categoryBudgets
    .filter(cb => cb.budgeted !== 0 || cb.spent !== 0)
    .map(cb => {
      const spentSoFar = Math.abs(cb.spent);
      const dailyAverage = dayOfMonth > 0 ? spentSoFar / dayOfMonth : 0;
      const projectedTotal = spentSoFar + dailyAverage * remainingDays;
      const projectedOverUnder = cb.budgeted - projectedTotal;
      let status: 'under' | 'on-track' | 'over' = 'on-track';
      if (cb.budgeted <= 0 && spentSoFar > 0) {
        status = 'over';
      } else if (cb.budgeted > 0) {
        const percentUsed = (projectedTotal / cb.budgeted) * 100;
        if (percentUsed > 105) status = 'over';
        else if (percentUsed < 80) status = 'under';
      }

      return {
        categoryName: cb.name,
        budgeted: cb.budgeted,
        spentSoFar,
        dailyAverage,
        projectedTotal,
        projectedOverUnder,
        status,
      };
    });
}

export function calculateDebtPayoff(
  context: BudgetContext,
  averageMonthlyPayments: Map<string, number>,
): DebtPayoff[] {
  return context.accounts
    .filter(a => a.balance < 0)
    .map(account => {
      const balance = Math.abs(account.balance);
      const avgPayment = averageMonthlyPayments.get(account.id) || 0;

      const monthsToPayoff = avgPayment > 0 ? Math.ceil(balance / avgPayment) : Infinity;
      const now = new Date();
      const payoffDate =
        monthsToPayoff === Infinity
          ? 'Never (no payments detected)'
          : (() => {
              const d = new Date(now);
              d.setMonth(d.getMonth() + monthsToPayoff);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            })();

      const acceleratedPayments = [25, 50, 100].map(extra => {
        const extraCents = extra * 100;
        const newPayment = avgPayment + extraCents;
        const newMonths = newPayment > 0 ? Math.ceil(balance / newPayment) : Infinity;
        const d = new Date(now);
        if (newMonths !== Infinity) d.setMonth(d.getMonth() + newMonths);
        const monthsSaved =
          monthsToPayoff === Infinity || newMonths === Infinity
            ? 0
            : monthsToPayoff - newMonths;
        return {
          extraAmount: extraCents,
          monthsToPayoff: newMonths,
          payoffDate:
            newMonths === Infinity
              ? 'N/A'
              : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          interestSaved: `${monthsSaved} months sooner`,
        };
      });

      return {
        accountName: account.name,
        balance,
        averageMonthlyPayment: avgPayment,
        monthsToPayoff,
        payoffDate,
        acceleratedPayments,
      };
    });
}

export function whatIfScenario(
  categoryName: string,
  reductionPercent: number,
  context: BudgetContext,
  goals: GoalProgress[],
): WhatIfResult | null {
  if (!context.budgetMonth) return null;

  const category = context.budgetMonth.categoryBudgets.find(
    cb => cb.name.toLowerCase() === categoryName.toLowerCase(),
  );
  if (!category) return null;

  const originalMonthlySpend = Math.abs(category.spent);
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = getDaysInMonth(now.getFullYear(), now.getMonth() + 1);
  const fullMonthSpend =
    dayOfMonth > 0 ? (originalMonthlySpend / dayOfMonth) * daysInMonth : 0;
  const adjustedMonthlySpend = fullMonthSpend * (1 - reductionPercent / 100);
  const monthlySavings = fullMonthSpend - adjustedMonthlySpend;
  const annualSavings = monthlySavings * 12;

  const impactOnGoals = goals.map(gp => {
    const newMonthlySavings = gp.actualMonthlySavings + monthlySavings;
    const originalMonths =
      gp.actualMonthlySavings > 0
        ? Math.ceil(gp.remainingAmount / gp.actualMonthlySavings)
        : Infinity;
    const newMonths =
      newMonthlySavings > 0
        ? Math.ceil(gp.remainingAmount / newMonthlySavings)
        : Infinity;
    const monthsSaved =
      originalMonths === Infinity || newMonths === Infinity
        ? 0
        : originalMonths - newMonths;

    return {
      goalName: gp.goal.name,
      originalMonths,
      newMonths,
      improvement:
        monthsSaved > 0
          ? `Reach goal ${monthsSaved} month${monthsSaved !== 1 ? 's' : ''} sooner`
          : 'No significant change',
    };
  });

  return {
    scenario: `Reduce ${categoryName} spending by ${reductionPercent}%`,
    originalMonthlySpend: fullMonthSpend,
    adjustedMonthlySpend,
    monthlySavings,
    annualSavings,
    impactOnGoals,
  };
}

export function formatGoalProgressSummary(progress: GoalProgress): string {
  const lines: string[] = [];
  lines.push(`Goal: ${progress.goal.name}`);
  lines.push(`Target: ${formatCents(progress.targetAmount)} by ${progress.goal.targetDate}`);
  lines.push(`Current saved: ${formatCents(progress.currentSaved)}`);
  lines.push(`Remaining: ${formatCents(progress.remainingAmount)}`);
  lines.push(`Months remaining: ${progress.monthsRemaining}`);
  lines.push(`Required monthly savings: ${formatCents(progress.requiredMonthlySavings)}`);
  lines.push(`Actual monthly savings rate: ${formatCents(progress.actualMonthlySavings)}`);
  lines.push(`Status: ${progress.onTrack ? 'On Track' : 'Off Track'}`);
  if (progress.projectedCompletion) {
    lines.push(`Projected completion: ${progress.projectedCompletion}`);
  }
  return lines.join('\n');
}

export function formatProjectionSummary(projection: MonthlyProjection): string {
  const lines: string[] = [];
  lines.push(`Monthly Spending Projection for ${projection.month}:`);
  lines.push(`Day ${projection.dayOfMonth} of ${projection.daysInMonth}`);
  lines.push(`Spent so far: ${formatCents(projection.spentSoFar)}`);
  lines.push(`Daily average: ${formatCents(projection.dailyAverage)}`);
  lines.push(`Projected month total: ${formatCents(projection.projectedTotal)}`);
  lines.push(`Total budgeted: ${formatCents(projection.budgetedTotal)}`);
  if (projection.projectedOverUnder >= 0) {
    lines.push(`Projected under budget by: ${formatCents(projection.projectedOverUnder)}`);
  } else {
    lines.push(`Projected over budget by: ${formatCents(Math.abs(projection.projectedOverUnder))}`);
  }
  lines.push(`Assumption: ${projection.assumption}`);
  return lines.join('\n');
}
