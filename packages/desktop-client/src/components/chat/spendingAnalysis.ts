import type {
  HistoricalComparison,
  RecurringTransaction,
  SpendingAnomaly,
  SpendingTrend,
} from './types';

type AnalysisTransaction = {
  date: string;
  amount: number;
  payee_name?: string;
  category_name?: string;
  account_name?: string;
};

type ScheduleInfo = {
  name?: string;
  amount?: number;
};

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount / 100).toFixed(2);
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

function daysBetween(d1: string, d2: string): number {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  return Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
}

function inferFrequency(
  avgDays: number,
): RecurringTransaction['frequency'] | null {
  if (avgDays >= 5 && avgDays <= 10) return 'weekly';
  if (avgDays >= 11 && avgDays <= 18) return 'biweekly';
  if (avgDays >= 25 && avgDays <= 40) return 'monthly';
  if (avgDays >= 80 && avgDays <= 110) return 'quarterly';
  if (avgDays >= 340 && avgDays <= 395) return 'yearly';
  return null;
}

function stddev(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function normalizePayeeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc\.?|llc\.?|corp\.?|ltd\.?|co\.?|company)\b/gi, '')
    .replace(/\.(com|net|org|io|tv|app)\b/gi, '')
    .replace(/[*#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectRecurringTransactions(
  transactions: AnalysisTransaction[],
  schedules: ScheduleInfo[],
): RecurringTransaction[] {
  const normalizedGroups = new Map<
    string,
    {
      variants: Map<string, number>;
      txns: Array<{ date: string; amount: number }>;
      accounts: Map<string, number>;
    }
  >();

  for (const tx of transactions) {
    if (!tx.payee_name || tx.amount >= 0) continue;
    const normalizedKey = normalizePayeeName(tx.payee_name);
    if (!normalizedKey) continue;
    if (!normalizedGroups.has(normalizedKey)) {
      normalizedGroups.set(normalizedKey, { variants: new Map(), txns: [], accounts: new Map() });
    }
    const group = normalizedGroups.get(normalizedKey)!;
    group.variants.set(tx.payee_name, (group.variants.get(tx.payee_name) || 0) + 1);
    group.txns.push({ date: tx.date, amount: tx.amount });
    if (tx.account_name) {
      group.accounts.set(tx.account_name, (group.accounts.get(tx.account_name) || 0) + 1);
    }
  }

  const results: RecurringTransaction[] = [];

  for (const [, group] of Array.from(normalizedGroups.entries())) {
    const { variants, txns, accounts } = group;
    if (txns.length < 2) continue;

    let canonicalName = '';
    let maxCount = 0;
    for (const [name, count] of Array.from(variants.entries())) {
      if (count > maxCount) {
        maxCount = count;
        canonicalName = name;
      }
    }

    let primaryAccount: string | undefined;
    let maxAcctCount = 0;
    for (const [acctName, count] of Array.from(accounts.entries())) {
      if (count > maxAcctCount) {
        maxAcctCount = count;
        primaryAccount = acctName;
      }
    }

    const allVariants = Array.from(variants.keys());

    txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const amounts = txns.map(t => t.amount);
    const { mean: avgAmount, std: amountStd } = stddev(amounts);

    const amountConsistency =
      avgAmount !== 0 ? Math.abs(amountStd / avgAmount) : 1;
    if (amountConsistency > 0.3) continue;

    const intervals: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      intervals.push(daysBetween(txns[i].date, txns[i - 1].date));
    }

    const { mean: avgInterval, std: intervalStd } = stddev(intervals);
    const frequency = inferFrequency(avgInterval);
    if (!frequency) continue;

    const intervalConsistency =
      avgInterval !== 0 ? intervalStd / avgInterval : 1;

    let confidence: RecurringTransaction['confidence'] = 'low';
    if (
      txns.length >= 4 &&
      amountConsistency < 0.05 &&
      intervalConsistency < 0.2
    ) {
      confidence = 'high';
    } else if (
      txns.length >= 3 &&
      amountConsistency < 0.15 &&
      intervalConsistency < 0.3
    ) {
      confidence = 'medium';
    }

    const scheduleMatch = schedules.find(s => {
      if (!s.amount) return false;
      const amtDiff = Math.abs(s.amount - avgAmount);
      const amountClose = amtDiff / Math.abs(avgAmount) < 0.1;
      if (!amountClose) return false;
      if (s.name) {
        const schedName = s.name.toLowerCase();
        const payee = canonicalName.toLowerCase();
        return (
          schedName.includes(payee) ||
          payee.includes(schedName) ||
          schedName === payee
        );
      }
      return amountClose;
    });

    let typicalDueDay: number | undefined;
    if (frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly') {
      const days = txns.map(t => new Date(t.date).getUTCDate());
      days.sort((a, b) => a - b);
      typicalDueDay = days[Math.floor(days.length / 2)];
    }

    results.push({
      payee_name: canonicalName,
      amount: Math.round(avgAmount),
      frequency,
      confidence,
      lastDate: txns[txns.length - 1].date,
      occurrences: txns.length,
      matchesSchedule: !!scheduleMatch,
      scheduleName: scheduleMatch?.name,
      payeeVariants: allVariants.length > 1 ? allVariants : undefined,
      accountName: primaryAccount,
      typicalDueDay,
    });
  }

  results.sort((a, b) => a.amount - b.amount);
  return results;
}

export function detectAnomalies(
  transactions: AnalysisTransaction[],
): SpendingAnomaly[] {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const anomalies: SpendingAnomaly[] = [];

  const monthlyByCategory = new Map<
    string,
    Map<string, number>
  >();

  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const month = tx.date.substring(0, 7);
    const cat = tx.category_name || 'Uncategorized';

    if (!monthlyByCategory.has(cat)) monthlyByCategory.set(cat, new Map());
    const catMonths = monthlyByCategory.get(cat)!;
    catMonths.set(month, (catMonths.get(month) || 0) + Math.abs(tx.amount));
  }

  for (const [category, monthTotals] of Array.from(monthlyByCategory.entries())) {
    const historicalMonths: number[] = [];
    let currentTotal = 0;

    for (const [month, total] of Array.from(monthTotals.entries())) {
      if (month === currentMonth) {
        currentTotal = total;
      } else {
        historicalMonths.push(total);
      }
    }

    if (historicalMonths.length < 2 || currentTotal === 0) continue;

    const { mean, std } = stddev(historicalMonths);
    if (std === 0) continue;

    const deviations = (currentTotal - mean) / std;
    if (deviations >= 2) {
      anomalies.push({
        type: 'category',
        name: category,
        amount: currentTotal,
        average: Math.round(mean),
        stdDev: Math.round(std),
        deviations: Math.round(deviations * 10) / 10,
        period: currentMonth,
      });
    }
  }

  const payeeAvgs = new Map<string, { amounts: number[]; count: number }>();
  for (const tx of transactions) {
    if (tx.amount >= 0 || !tx.payee_name) continue;
    const month = tx.date.substring(0, 7);
    if (month === currentMonth) continue;
    const key = tx.payee_name;
    if (!payeeAvgs.has(key)) payeeAvgs.set(key, { amounts: [], count: 0 });
    const entry = payeeAvgs.get(key)!;
    entry.amounts.push(Math.abs(tx.amount));
    entry.count++;
  }

  const currentMonthTxns = transactions.filter(
    tx => tx.date.substring(0, 7) === currentMonth && tx.amount < 0,
  );

  for (const tx of currentMonthTxns) {
    if (!tx.payee_name) continue;
    const history = payeeAvgs.get(tx.payee_name);
    if (!history || history.amounts.length < 3) continue;

    const { mean, std } = stddev(history.amounts);
    if (std === 0) continue;

    const txAmount = Math.abs(tx.amount);
    const deviations = (txAmount - mean) / std;

    if (deviations >= 2) {
      anomalies.push({
        type: 'transaction',
        name: tx.payee_name,
        amount: txAmount,
        average: Math.round(mean),
        stdDev: Math.round(std),
        deviations: Math.round(deviations * 10) / 10,
        date: tx.date,
      });
    }
  }

  anomalies.sort((a, b) => b.deviations - a.deviations);
  return anomalies;
}

export function analyzeSpendingTrend(
  transactions: AnalysisTransaction[],
  filterName?: string,
  filterType: 'category' | 'payee' = 'category',
): SpendingTrend[] {
  const monthlyTotals = new Map<string, Map<string, number>>();

  for (const tx of transactions) {
    if (tx.amount >= 0) continue;

    const name =
      filterType === 'category'
        ? tx.category_name || 'Uncategorized'
        : tx.payee_name || 'Unknown';

    if (filterName && !name.toLowerCase().includes(filterName.toLowerCase())) {
      continue;
    }

    const month = tx.date.substring(0, 7);
    if (!monthlyTotals.has(name)) monthlyTotals.set(name, new Map());
    const nameMonths = monthlyTotals.get(name)!;
    nameMonths.set(month, (nameMonths.get(month) || 0) + Math.abs(tx.amount));
  }

  const results: SpendingTrend[] = [];

  for (const [name, months] of Array.from(monthlyTotals.entries())) {
    const sorted = Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b));
    if (sorted.length < 2) continue;

    const recentMonths = sorted.slice(-3);
    const recentValues = recentMonths.map(([, v]) => v);

    let direction: SpendingTrend['direction'] = 'stable';
    let percentChange = 0;

    if (recentValues.length >= 2) {
      const first = recentValues[0];
      const last = recentValues[recentValues.length - 1];
      if (first !== 0) {
        percentChange = Math.round(((last - first) / first) * 100);
      }
      if (percentChange > 10) direction = 'increasing';
      else if (percentChange < -10) direction = 'decreasing';
    }

    const periodDesc =
      recentMonths.length >= 2
        ? `the last ${recentMonths.length} months`
        : 'recently';

    let narrative: string;
    if (direction === 'increasing') {
      narrative = `${name} spending has increased ${Math.abs(percentChange)}% over ${periodDesc}`;
    } else if (direction === 'decreasing') {
      narrative = `${name} spending has decreased ${Math.abs(percentChange)}% over ${periodDesc}`;
    } else {
      narrative = `${name} spending has been relatively stable over ${periodDesc}`;
    }

    results.push({
      name,
      direction,
      percentChange,
      monthlyTotals: sorted.map(([month, total]) => ({ month, total })),
      narrative,
    });
  }

  results.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));
  return filterName ? results : results.slice(0, 10);
}

export function compareToHistorical(
  transactions: AnalysisTransaction[],
  lookbackMonths: number = 3,
): HistoricalComparison {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthlyByCategory = new Map<string, Map<string, number>>();

  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const month = tx.date.substring(0, 7);
    const cat = tx.category_name || 'Uncategorized';

    if (!monthlyByCategory.has(cat)) monthlyByCategory.set(cat, new Map());
    const catMonths = monthlyByCategory.get(cat)!;
    catMonths.set(month, (catMonths.get(month) || 0) + Math.abs(tx.amount));
  }

  const categories: HistoricalComparison['categories'] = [];
  let totalCurrent = 0;
  let totalAverage = 0;

  for (const [category, monthTotals] of Array.from(monthlyByCategory.entries())) {
    const currentSpending = monthTotals.get(currentMonth) || 0;

    const sortedMonths = Array.from(monthTotals.entries())
      .filter(([month]) => month !== currentMonth)
      .sort(([a], [b]) => a.localeCompare(b));

    const recentHistorical = sortedMonths
      .slice(-lookbackMonths)
      .map(([, total]) => total);
    if (recentHistorical.length === 0) continue;

    const historicalAverage =
      Math.round(
        recentHistorical.reduce((s, v) => s + v, 0) / recentHistorical.length,
      );

    const difference = currentSpending - historicalAverage;
    const percentDifference =
      historicalAverage !== 0
        ? Math.round((difference / historicalAverage) * 100)
        : currentSpending > 0
          ? 100
          : 0;

    let status: HistoricalComparison['categories'][0]['status'] = 'normal';
    if (percentDifference > 50) status = 'significantly-over';
    else if (percentDifference > 20) status = 'over';
    else if (percentDifference < -50) status = 'significantly-under';
    else if (percentDifference < -20) status = 'under';

    totalCurrent += currentSpending;
    totalAverage += historicalAverage;

    categories.push({
      name: category,
      currentSpending,
      historicalAverage,
      difference,
      percentDifference,
      status,
    });
  }

  categories.sort(
    (a, b) => Math.abs(b.percentDifference) - Math.abs(a.percentDifference),
  );

  const periodLabel = `${lookbackMonths}-month average`;

  return {
    currentMonth,
    comparisonPeriod: periodLabel,
    categories,
    totalCurrent,
    totalAverage,
  };
}

export function formatSubscriptionList(
  subscriptions: RecurringTransaction[],
): string {
  if (subscriptions.length === 0) {
    return 'No recurring charges detected from your transaction history. This could mean you have very few transactions, or your subscriptions vary in amount.';
  }

  const lines: string[] = [];
  lines.push(`Detected ${subscriptions.length} recurring charge(s):\n`);

  const confirmed = subscriptions.filter(s => s.matchesSchedule);
  const detected = subscriptions.filter(s => !s.matchesSchedule);

  if (confirmed.length > 0) {
    lines.push('CONFIRMED (matches scheduled transactions):');
    for (const sub of confirmed) {
      lines.push(
        `  ✓ ${sub.payee_name}: ${formatCurrency(Math.abs(sub.amount))}/${sub.frequency}` +
          ` (${sub.occurrences} occurrences, last: ${sub.lastDate})` +
          (sub.scheduleName ? ` — schedule: ${sub.scheduleName}` : ''),
      );
    }
  }

  if (detected.length > 0) {
    if (confirmed.length > 0) lines.push('');
    lines.push('DETECTED FROM HISTORY:');
    for (const sub of detected) {
      const confidenceLabel =
        sub.confidence === 'high'
          ? '●●●'
          : sub.confidence === 'medium'
            ? '●●○'
            : '●○○';
      let line = `  ${confidenceLabel} ${sub.payee_name}: ${formatCurrency(Math.abs(sub.amount))}/${sub.frequency}` +
          ` (${sub.occurrences} occurrences, last: ${sub.lastDate}, confidence: ${sub.confidence})`;
      if (sub.accountName) {
        line += ` [account: ${sub.accountName}]`;
      }
      if (sub.typicalDueDay) {
        line += ` [typical due day: ${sub.typicalDueDay}]`;
      }
      if (sub.payeeVariants && sub.payeeVariants.length > 1) {
        line += `\n      ⚠ Name variants found: ${sub.payeeVariants.map(v => `"${v}"`).join(', ')} — consider creating a payee rename rule to normalize`;
      }
      lines.push(line);
    }
  }

  const totalMonthly = subscriptions
    .filter(s => s.frequency === 'monthly')
    .reduce((sum, s) => sum + Math.abs(s.amount), 0);
  if (totalMonthly > 0) {
    lines.push(`\nEstimated monthly recurring total: ${formatCurrency(totalMonthly)}`);
  }

  return lines.join('\n');
}

export function formatAnomalyReport(anomalies: SpendingAnomaly[]): string {
  if (anomalies.length === 0) {
    return 'No unusual spending detected this month. Your spending patterns appear normal across all categories and payees.';
  }

  const lines: string[] = [];
  lines.push(`Found ${anomalies.length} unusual spending pattern(s):\n`);

  const categoryAnomalies = anomalies.filter(a => a.type === 'category');
  const txAnomalies = anomalies.filter(a => a.type === 'transaction');

  if (categoryAnomalies.length > 0) {
    lines.push('UNUSUAL CATEGORY SPENDING:');
    for (const a of categoryAnomalies) {
      lines.push(
        `  ⚠ ${a.name}: ${formatCurrency(a.amount)} this month vs ${formatCurrency(a.average)} average` +
          ` (${a.deviations}x standard deviations above normal)`,
      );
    }
  }

  if (txAnomalies.length > 0) {
    if (categoryAnomalies.length > 0) lines.push('');
    lines.push('UNUSUAL INDIVIDUAL TRANSACTIONS:');
    for (const a of txAnomalies) {
      lines.push(
        `  ⚠ ${a.name} on ${a.date}: ${formatCurrency(a.amount)} vs ${formatCurrency(a.average)} typical` +
          ` (${a.deviations}x standard deviations)`,
      );
    }
  }

  return lines.join('\n');
}

export function formatTrendAnalysis(trends: SpendingTrend[]): string {
  if (trends.length === 0) {
    return 'Not enough data to determine spending trends. Need at least 2 months of transactions.';
  }

  const lines: string[] = [];
  lines.push(`Spending trend analysis:\n`);

  for (const trend of trends) {
    const arrow =
      trend.direction === 'increasing'
        ? '↑'
        : trend.direction === 'decreasing'
          ? '↓'
          : '→';

    lines.push(`${arrow} ${trend.narrative}`);

    if (trend.monthlyTotals.length > 0) {
      const monthDetails = trend.monthlyTotals
        .slice(-6)
        .map(m => `${m.month}: ${formatCurrency(m.total)}`)
        .join(', ');
      lines.push(`    ${monthDetails}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function formatHistoricalComparison(
  comparison: HistoricalComparison,
): string {
  const lines: string[] = [];
  lines.push(
    `${comparison.currentMonth} spending vs ${comparison.comparisonPeriod}:\n`,
  );

  const overCategories = comparison.categories.filter(
    c => c.status === 'significantly-over' || c.status === 'over',
  );
  const underCategories = comparison.categories.filter(
    c => c.status === 'significantly-under' || c.status === 'under',
  );
  const normalCategories = comparison.categories.filter(
    c => c.status === 'normal',
  );

  if (overCategories.length > 0) {
    lines.push('SPENDING MORE THAN USUAL:');
    for (const c of overCategories) {
      lines.push(
        `  ▲ ${c.name}: ${formatCurrency(c.currentSpending)} vs ${formatCurrency(c.historicalAverage)} avg` +
          ` (+${c.percentDifference}%)`,
      );
    }
  }

  if (underCategories.length > 0) {
    if (overCategories.length > 0) lines.push('');
    lines.push('SPENDING LESS THAN USUAL:');
    for (const c of underCategories) {
      lines.push(
        `  ▼ ${c.name}: ${formatCurrency(c.currentSpending)} vs ${formatCurrency(c.historicalAverage)} avg` +
          ` (${c.percentDifference}%)`,
      );
    }
  }

  if (normalCategories.length > 0) {
    if (overCategories.length > 0 || underCategories.length > 0)
      lines.push('');
    lines.push('NORMAL RANGE:');
    for (const c of normalCategories) {
      lines.push(
        `  = ${c.name}: ${formatCurrency(c.currentSpending)} vs ${formatCurrency(c.historicalAverage)} avg`,
      );
    }
  }

  const totalDiff = comparison.totalCurrent - comparison.totalAverage;
  const totalPct =
    comparison.totalAverage !== 0
      ? Math.round((totalDiff / comparison.totalAverage) * 100)
      : 0;
  lines.push(
    `\nOverall: ${formatCurrency(comparison.totalCurrent)} this month vs ${formatCurrency(comparison.totalAverage)} average` +
      ` (${totalPct > 0 ? '+' : ''}${totalPct}%)`,
  );

  return lines.join('\n');
}
