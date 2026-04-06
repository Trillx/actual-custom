import { send } from 'loot-core/platform/client/connection';
import { q } from 'loot-core/shared/query';

import { createGoal, deleteGoal, updateGoal } from './goalStorage';
import {
  addMemory,
  deleteMemory as deleteMemoryById,
  getMemories,
} from './memoryStorage';
import type {
  BudgetAction,
  DisplayContext,
  FormattedActionResult,
} from './types';

function validateSetBudgetAmount(params: Record<string, unknown>): {
  month: string;
  categoryId: string;
  amount: number;
} {
  const { month, categoryId, amount } = params;
  if (typeof month !== 'string' || !month)
    throw new Error('Missing or invalid "month" parameter.');
  if (typeof categoryId !== 'string' || !categoryId)
    throw new Error('Missing or invalid "categoryId" parameter.');
  if (typeof amount !== 'number')
    throw new Error('Missing or invalid "amount" parameter.');
  return { month, categoryId, amount };
}

function validateAddTransaction(params: Record<string, unknown>): {
  accountId: string;
  date: string;
  amount: number;
  payee_name?: string;
  category_id?: string;
  notes?: string;
} {
  const { accountId, date, amount, payee_name, category_id, notes } = params;
  if (typeof accountId !== 'string' || !accountId)
    throw new Error('Missing or invalid "accountId" parameter.');
  if (typeof date !== 'string' || !date)
    throw new Error('Missing or invalid "date" parameter.');
  if (typeof amount !== 'number')
    throw new Error('Missing or invalid "amount" parameter.');
  return {
    accountId,
    date,
    amount,
    payee_name: typeof payee_name === 'string' ? payee_name : undefined,
    category_id: typeof category_id === 'string' ? category_id : undefined,
    notes: typeof notes === 'string' ? notes : undefined,
  };
}

function validateUpdateTransaction(params: Record<string, unknown>): {
  transactionId: string;
  date?: string;
  amount?: number;
  payee_name?: string;
  category_id?: string;
  notes?: string;
  accountId?: string;
} {
  const {
    transactionId,
    date,
    amount,
    payee_name,
    category_id,
    notes,
    accountId,
  } = params;
  if (typeof transactionId !== 'string' || !transactionId)
    throw new Error('Missing or invalid "transactionId" parameter.');
  return {
    transactionId,
    date: typeof date === 'string' ? date : undefined,
    amount: typeof amount === 'number' ? amount : undefined,
    payee_name: typeof payee_name === 'string' ? payee_name : undefined,
    category_id: typeof category_id === 'string' ? category_id : undefined,
    notes: typeof notes === 'string' ? notes : undefined,
    accountId: typeof accountId === 'string' ? accountId : undefined,
  };
}

function validateBulkUpdateTransactions(params: Record<string, unknown>): {
  updates: Array<{
    transactionId: string;
    category_id?: string;
    payee_name?: string;
    notes?: string;
    amount?: number;
    date?: string;
    accountId?: string;
  }>;
} {
  const { updates } = params;
  if (!Array.isArray(updates) || updates.length === 0)
    throw new Error('Missing or empty "updates" array.');
  const validated = updates.map((u, i) => {
    const entry = u as Record<string, unknown>;
    if (typeof entry.transactionId !== 'string' || !entry.transactionId)
      throw new Error(`Missing "transactionId" in update entry ${i}.`);
    return {
      transactionId: entry.transactionId as string,
      category_id:
        typeof entry.category_id === 'string' ? entry.category_id : undefined,
      payee_name:
        typeof entry.payee_name === 'string' ? entry.payee_name : undefined,
      notes: typeof entry.notes === 'string' ? entry.notes : undefined,
      amount: typeof entry.amount === 'number' ? entry.amount : undefined,
      date: typeof entry.date === 'string' ? entry.date : undefined,
      accountId:
        typeof entry.accountId === 'string' ? entry.accountId : undefined,
    };
  });
  return { updates: validated };
}

function validateDeleteTransaction(params: Record<string, unknown>): {
  transactionId: string;
} {
  const { transactionId } = params;
  if (typeof transactionId !== 'string' || !transactionId)
    throw new Error('Missing or invalid "transactionId" parameter.');
  return { transactionId };
}

function validateTransferBetweenAccounts(params: Record<string, unknown>): {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  notes?: string;
} {
  const { fromAccountId, toAccountId, amount, date, notes } = params;
  if (typeof fromAccountId !== 'string' || !fromAccountId)
    throw new Error('Missing or invalid "fromAccountId" parameter.');
  if (typeof toAccountId !== 'string' || !toAccountId)
    throw new Error('Missing or invalid "toAccountId" parameter.');
  if (typeof amount !== 'number')
    throw new Error('Missing or invalid "amount" parameter.');
  if (typeof date !== 'string' || !date)
    throw new Error('Missing or invalid "date" parameter.');
  if (fromAccountId === toAccountId)
    throw new Error('Source and destination accounts must be different.');
  return {
    fromAccountId,
    toAccountId,
    amount,
    date,
    notes: typeof notes === 'string' ? notes : undefined,
  };
}

function validateCreateCategory(params: Record<string, unknown>): {
  name: string;
  group_id: string;
} {
  const { name, group_id, group_name, groupId, groupName } = params;
  if (typeof name !== 'string' || !name)
    throw new Error('Missing or invalid "name" parameter.');
  const candidates = [group_id, groupId, group_name, groupName];
  const gid = candidates.find(
    c => typeof c === 'string' && c.trim().length > 0,
  );
  if (!gid)
    throw new Error(
      'Missing or invalid "group_id" parameter. Please specify which category group to add this category to.',
    );
  return { name, group_id: (gid as string).trim() };
}

function validateCreateAccount(params: Record<string, unknown>): {
  name: string;
  balance: number;
  offBudget: boolean;
} {
  const { name, balance, offBudget } = params;
  if (typeof name !== 'string' || !name)
    throw new Error('Missing or invalid "name" parameter.');
  return {
    name,
    balance: typeof balance === 'number' ? balance : 0,
    offBudget: typeof offBudget === 'boolean' ? offBudget : false,
  };
}

function validateCloseAccount(params: Record<string, unknown>): {
  accountId: string;
  transferAccountId?: string;
} {
  const { accountId, transferAccountId } = params;
  if (typeof accountId !== 'string' || !accountId)
    throw new Error('Missing or invalid "accountId" parameter.');
  return {
    accountId,
    transferAccountId:
      typeof transferAccountId === 'string' ? transferAccountId : undefined,
  };
}

function validateReopenAccount(params: Record<string, unknown>): {
  accountId: string;
} {
  const { accountId } = params;
  if (typeof accountId !== 'string' || !accountId)
    throw new Error('Missing or invalid "accountId" parameter.');
  return { accountId };
}

function validateRenameCategory(params: Record<string, unknown>): {
  categoryId: string;
  newName: string;
  oldName: string;
} {
  const { categoryId, newName, oldName } = params;
  if (typeof categoryId !== 'string' || !categoryId)
    throw new Error('Missing or invalid "categoryId" parameter.');
  if (typeof newName !== 'string' || !newName)
    throw new Error('Missing or invalid "newName" parameter.');
  return {
    categoryId,
    newName,
    oldName: typeof oldName === 'string' ? oldName : '',
  };
}

function validateDeleteCategory(params: Record<string, unknown>): {
  categoryId: string;
  categoryName: string;
  transferCategoryId?: string;
  transactionCount: number;
} {
  const { categoryId, categoryName, transferCategoryId, transactionCount } =
    params;
  if (typeof categoryId !== 'string' || !categoryId)
    throw new Error('Missing or invalid "categoryId" parameter.');
  return {
    categoryId,
    categoryName: typeof categoryName === 'string' ? categoryName : '',
    transferCategoryId:
      typeof transferCategoryId === 'string' ? transferCategoryId : undefined,
    transactionCount:
      typeof transactionCount === 'number' ? transactionCount : 0,
  };
}

function validateCreateCategoryGroup(params: Record<string, unknown>): {
  name: string;
  categories?: Array<{ name: string }>;
} {
  const { name, categories } = params;
  if (typeof name !== 'string' || !name)
    throw new Error('Missing or invalid "name" parameter.');
  const cats = Array.isArray(categories)
    ? categories.filter(
        (c): c is { name: string } =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as Record<string, unknown>).name === 'string',
      )
    : undefined;
  return { name, categories: cats };
}

function validateMoveCategory(params: Record<string, unknown>): {
  categoryId: string;
  categoryName: string;
  groupId: string;
  groupName: string;
} {
  const { categoryId, categoryName, groupId, groupName } = params;
  if (typeof categoryId !== 'string' || !categoryId)
    throw new Error('Missing or invalid "categoryId" parameter.');
  if (typeof groupId !== 'string' || !groupId)
    throw new Error('Missing or invalid "groupId" parameter.');
  return {
    categoryId,
    categoryName: typeof categoryName === 'string' ? categoryName : '',
    groupId,
    groupName: typeof groupName === 'string' ? groupName : '',
  };
}

function validateDeleteCategoryGroup(params: Record<string, unknown>): {
  groupId: string;
  groupName: string;
} {
  const { groupId, groupName } = params;
  if (typeof groupId !== 'string' || !groupId)
    throw new Error('Missing or invalid "groupId" parameter.');
  return {
    groupId,
    groupName: typeof groupName === 'string' ? groupName : '',
  };
}

function validateRenamePayee(params: Record<string, unknown>): {
  payeeId: string;
  newName: string;
  oldName: string;
} {
  const { payeeId, newName, oldName } = params;
  if (typeof payeeId !== 'string' || !payeeId)
    throw new Error('Missing or invalid "payeeId" parameter.');
  if (typeof newName !== 'string' || !newName)
    throw new Error('Missing or invalid "newName" parameter.');
  return {
    payeeId,
    newName,
    oldName: typeof oldName === 'string' ? oldName : '',
  };
}

function validateMergePayees(params: Record<string, unknown>): {
  targetId: string;
  targetName: string;
  mergeIds: string[];
  mergeNames: string[];
} {
  const { targetId, targetName, mergeIds, mergeNames } = params;
  if (typeof targetId !== 'string' || !targetId)
    throw new Error('Missing or invalid "targetId" parameter.');
  if (!Array.isArray(mergeIds))
    throw new Error('Missing or invalid "mergeIds" parameter.');
  const filteredIds = mergeIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  if (filteredIds.length === 0)
    throw new Error('"mergeIds" must contain at least one valid payee ID.');
  return {
    targetId,
    targetName: typeof targetName === 'string' ? targetName : '',
    mergeIds: filteredIds,
    mergeNames: Array.isArray(mergeNames)
      ? mergeNames.filter((n): n is string => typeof n === 'string')
      : [],
  };
}

function validateCopyPreviousMonth(params: Record<string, unknown>): {
  month: string;
} {
  const { month } = params;
  if (typeof month !== 'string' || !month)
    throw new Error('Missing or invalid "month" parameter.');
  return { month };
}

function validateSetBudgetAverage(params: Record<string, unknown>): {
  month: string;
  numMonths: number;
} {
  const { month, numMonths } = params;
  if (typeof month !== 'string' || !month)
    throw new Error('Missing or invalid "month" parameter.');
  const n = typeof numMonths === 'number' ? numMonths : 3;
  if (![3, 6, 12].includes(n))
    throw new Error('"numMonths" must be 3, 6, or 12.');
  return { month, numMonths: n };
}

function validateBulkSetBudget(params: Record<string, unknown>): {
  month: string;
  budgets: Array<{ categoryId: string; categoryName: string; amount: number }>;
} {
  const { month, budgets } = params;
  if (typeof month !== 'string' || !month)
    throw new Error('Missing or invalid "month" parameter.');
  if (!Array.isArray(budgets) || budgets.length === 0)
    throw new Error('Missing or invalid "budgets" parameter.');
  const validated = budgets.map((b, i) => {
    const entry = b as Record<string, unknown>;
    if (typeof entry.categoryId !== 'string' || !entry.categoryId)
      throw new Error(`Missing "categoryId" in budget entry ${i}.`);
    if (typeof entry.amount !== 'number')
      throw new Error(`Missing "amount" in budget entry ${i}.`);
    return {
      categoryId: entry.categoryId as string,
      categoryName:
        typeof entry.categoryName === 'string' ? entry.categoryName : '',
      amount: entry.amount as number,
    };
  });
  return { month, budgets: validated };
}

function validateTransferBudget(params: Record<string, unknown>): {
  month: string;
  amount: number;
  fromCategoryId: string;
  toCategoryId: string;
  fromCategoryName: string;
  toCategoryName: string;
} {
  const {
    month,
    amount,
    fromCategoryId,
    toCategoryId,
    fromCategoryName,
    toCategoryName,
  } = params;
  if (typeof month !== 'string' || !month)
    throw new Error('Missing or invalid "month" parameter.');
  if (typeof amount !== 'number')
    throw new Error('Missing or invalid "amount" parameter.');
  if (typeof fromCategoryId !== 'string' || !fromCategoryId)
    throw new Error('Missing or invalid "fromCategoryId" parameter.');
  if (typeof toCategoryId !== 'string' || !toCategoryId)
    throw new Error('Missing or invalid "toCategoryId" parameter.');
  return {
    month,
    amount,
    fromCategoryId,
    toCategoryId,
    fromCategoryName:
      typeof fromCategoryName === 'string' ? fromCategoryName : '',
    toCategoryName: typeof toCategoryName === 'string' ? toCategoryName : '',
  };
}

function validateDateString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date).getTime());
}

function validateCreateGoal(params: Record<string, unknown>): {
  name: string;
  targetAmount: number;
  targetDate: string;
  associatedAccountIds?: string[];
  associatedCategoryIds?: string[];
} {
  const {
    name,
    targetAmount,
    targetDate,
    associatedAccountIds,
    associatedCategoryIds,
  } = params;
  if (typeof name !== 'string' || !name)
    throw new Error('Missing or invalid "name" parameter.');
  if (
    typeof targetAmount !== 'number' ||
    !isFinite(targetAmount) ||
    targetAmount <= 0
  )
    throw new Error('"targetAmount" must be a positive number (in cents).');
  if (typeof targetDate !== 'string' || !validateDateString(targetDate))
    throw new Error('"targetDate" must be a valid date in YYYY-MM-DD format.');
  return {
    name,
    targetAmount: Math.round(targetAmount),
    targetDate,
    associatedAccountIds: Array.isArray(associatedAccountIds)
      ? associatedAccountIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : undefined,
    associatedCategoryIds: Array.isArray(associatedCategoryIds)
      ? associatedCategoryIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : undefined,
  };
}

function validateUpdateGoal(params: Record<string, unknown>): {
  goalId: string;
  name?: string;
  targetAmount?: number;
  targetDate?: string;
  associatedAccountIds?: string[];
  associatedCategoryIds?: string[];
} {
  const {
    goalId,
    name,
    targetAmount,
    targetDate,
    associatedAccountIds,
    associatedCategoryIds,
  } = params;
  if (typeof goalId !== 'string' || !goalId)
    throw new Error('Missing or invalid "goalId" parameter.');
  if (
    typeof targetAmount === 'number' &&
    (!isFinite(targetAmount) || targetAmount <= 0)
  )
    throw new Error('"targetAmount" must be a positive number (in cents).');
  if (typeof targetDate === 'string' && !validateDateString(targetDate))
    throw new Error('"targetDate" must be a valid date in YYYY-MM-DD format.');
  return {
    goalId,
    name: typeof name === 'string' && name ? name : undefined,
    targetAmount:
      typeof targetAmount === 'number' ? Math.round(targetAmount) : undefined,
    targetDate: typeof targetDate === 'string' ? targetDate : undefined,
    associatedAccountIds: Array.isArray(associatedAccountIds)
      ? associatedAccountIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : undefined,
    associatedCategoryIds: Array.isArray(associatedCategoryIds)
      ? associatedCategoryIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : undefined,
  };
}

function validateDeleteGoal(params: Record<string, unknown>): {
  goalId: string;
  goalName: string;
} {
  const { goalId, goalName } = params;
  if (typeof goalId !== 'string' || !goalId)
    throw new Error('Missing or invalid "goalId" parameter.');
  return {
    goalId,
    goalName: typeof goalName === 'string' ? goalName : '',
  };
}

function validateCreateSchedule(params: Record<string, unknown>): {
  name?: string;
  payee_name: string;
  accountId?: string;
  amount: number;
  amountOp: string;
  date: string;
  frequency: string;
  interval: number;
  posts_transaction: boolean;
} {
  const {
    name,
    payee_name,
    accountId,
    amount,
    amountOp,
    date,
    frequency,
    interval,
    posts_transaction,
  } = params;
  if (typeof payee_name !== 'string' || !payee_name)
    throw new Error('Missing or invalid "payee_name" parameter.');
  if (typeof amount !== 'number')
    throw new Error('Missing or invalid "amount" parameter.');
  if (
    typeof frequency !== 'string' ||
    !['weekly', 'monthly', 'yearly'].includes(frequency)
  )
    throw new Error('"frequency" must be "weekly", "monthly", or "yearly".');
  const validOps = ['is', 'isapprox', 'isbetween'];
  const op =
    typeof amountOp === 'string' && validOps.includes(amountOp)
      ? amountOp
      : 'isapprox';
  const today = new Date().toISOString().split('T')[0];
  return {
    name: typeof name === 'string' && name ? name : undefined,
    payee_name,
    accountId:
      typeof accountId === 'string' && accountId ? accountId : undefined,
    amount,
    amountOp: op,
    date: typeof date === 'string' && date ? date : today,
    frequency,
    interval: typeof interval === 'number' && interval > 0 ? interval : 1,
    posts_transaction:
      typeof posts_transaction === 'boolean' ? posts_transaction : false,
  };
}

function validateUpdateSchedule(params: Record<string, unknown>): {
  scheduleId: string;
  name?: string;
  payee_name?: string;
  accountId?: string;
  amount?: number;
  amountOp?: string;
  date?: string;
  frequency?: string;
  interval?: number;
  posts_transaction?: boolean;
} {
  const {
    scheduleId,
    name,
    payee_name,
    accountId,
    amount,
    amountOp,
    date,
    frequency,
    interval,
    posts_transaction,
  } = params;
  if (typeof scheduleId !== 'string' || !scheduleId)
    throw new Error('Missing or invalid "scheduleId" parameter.');
  const validOps = ['is', 'isapprox', 'isbetween'];
  return {
    scheduleId,
    name: typeof name === 'string' && name ? name : undefined,
    payee_name:
      typeof payee_name === 'string' && payee_name ? payee_name : undefined,
    accountId:
      typeof accountId === 'string' && accountId ? accountId : undefined,
    amount: typeof amount === 'number' ? amount : undefined,
    amountOp:
      typeof amountOp === 'string' && validOps.includes(amountOp)
        ? amountOp
        : undefined,
    date: typeof date === 'string' && date ? date : undefined,
    frequency:
      typeof frequency === 'string' &&
      ['weekly', 'monthly', 'yearly'].includes(frequency)
        ? frequency
        : undefined,
    interval:
      typeof interval === 'number' && interval > 0 ? interval : undefined,
    posts_transaction:
      typeof posts_transaction === 'boolean' ? posts_transaction : undefined,
  };
}

function validateDeleteSchedule(params: Record<string, unknown>): {
  scheduleId: string;
  scheduleName: string;
} {
  const { scheduleId, scheduleName } = params;
  if (typeof scheduleId !== 'string' || !scheduleId)
    throw new Error('Missing or invalid "scheduleId" parameter.');
  return {
    scheduleId,
    scheduleName: typeof scheduleName === 'string' ? scheduleName : '',
  };
}

function validateCreateSchedulesBatch(params: Record<string, unknown>): {
  schedules: Array<{
    name?: string;
    payee_name: string;
    accountId?: string;
    amount: number;
    amountOp: string;
    date: string;
    frequency: string;
    interval: number;
    posts_transaction: boolean;
  }>;
} {
  const { schedules } = params;
  if (!Array.isArray(schedules) || schedules.length === 0)
    throw new Error('Missing or empty "schedules" array.');
  const today = new Date().toISOString().split('T')[0];
  const validated = schedules.map((s, i) => {
    const entry = s as Record<string, unknown>;
    if (typeof entry.payee_name !== 'string' || !entry.payee_name)
      throw new Error(`Missing "payee_name" in schedule entry ${i}.`);
    if (typeof entry.amount !== 'number')
      throw new Error(`Missing "amount" in schedule entry ${i}.`);
    if (
      typeof entry.frequency !== 'string' ||
      !['weekly', 'monthly', 'yearly'].includes(entry.frequency as string)
    )
      throw new Error(`Invalid "frequency" in schedule entry ${i}.`);
    const validOps = ['is', 'isapprox', 'isbetween'];
    return {
      name:
        typeof entry.name === 'string' && entry.name ? entry.name : undefined,
      payee_name: entry.payee_name as string,
      accountId:
        typeof entry.accountId === 'string' && entry.accountId
          ? (entry.accountId as string)
          : undefined,
      amount: entry.amount as number,
      amountOp:
        typeof entry.amountOp === 'string' && validOps.includes(entry.amountOp)
          ? entry.amountOp
          : 'isapprox',
      date:
        typeof entry.date === 'string' && entry.date
          ? (entry.date as string)
          : today,
      frequency: entry.frequency as string,
      interval:
        typeof entry.interval === 'number' && (entry.interval as number) > 0
          ? (entry.interval as number)
          : 1,
      posts_transaction:
        typeof entry.posts_transaction === 'boolean'
          ? entry.posts_transaction
          : false,
    };
  });
  return { schedules: validated };
}

function buildScheduleDateValue(
  date: string,
  frequency: string,
  interval: number,
): { start: string; frequency: string; interval: number } {
  return {
    start: date,
    frequency,
    interval,
  };
}

function formatCents(amount: number): string {
  return '$' + (amount / 100).toFixed(2);
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (monthIdx < 0 || monthIdx > 11) return dateStr;
  return `${months[monthIdx]} ${day}`;
}

export function formatActionDetails(
  action: BudgetAction,
  ctx?: DisplayContext,
): FormattedActionResult {
  const lines: string[] = [];
  const p = action.params;

  const resolveCat = (id: unknown): string => {
    if (!id || typeof id !== 'string') return String(id);
    return ctx?.categoryMap.get(id) || id;
  };
  const resolveAcct = (id: unknown): string => {
    if (!id || typeof id !== 'string') return String(id);
    return ctx?.accountMap.get(id) || id;
  };
  const resolveTx = (id: unknown) => {
    if (!id || typeof id !== 'string') return undefined;
    return ctx?.transactionCache?.get(id);
  };

  switch (action.type) {
    case 'set-budget-amount':
      lines.push(`Type: Set Budget Amount`);
      if (p.month) lines.push(`Month: ${p.month}`);
      if (p.categoryId) lines.push(`Category: ${resolveCat(p.categoryId)}`);
      if (typeof p.amount === 'number')
        lines.push(`Amount: ${formatCents(p.amount as number)}`);
      break;
    case 'add-transaction':
      lines.push(`Type: Add Transaction`);
      if (p.accountId) lines.push(`Account: ${resolveAcct(p.accountId)}`);
      if (p.date) lines.push(`Date: ${formatDate(p.date as string)}`);
      if (typeof p.amount === 'number')
        lines.push(`Amount: ${formatCents(p.amount as number)}`);
      if (p.payee_name) lines.push(`Payee: ${p.payee_name}`);
      if (p.category_id) lines.push(`Category: ${resolveCat(p.category_id)}`);
      if (p.notes) lines.push(`Notes: ${p.notes}`);
      break;
    case 'update-transaction': {
      lines.push(`Type: Update Transaction`);
      const txInfo = resolveTx(p.transactionId);
      if (txInfo) {
        lines.push(
          `Transaction: ${txInfo.payee_name || 'Unknown'} | ${formatCents(txInfo.amount ?? 0)} | ${formatDate(txInfo.date)}`,
        );
      } else {
        lines.push(`Transaction: ${p.transactionId}`);
      }
      if (p.date) lines.push(`New Date: ${formatDate(p.date as string)}`);
      if (typeof p.amount === 'number')
        lines.push(`New Amount: ${formatCents(p.amount as number)}`);
      if (p.payee_name) lines.push(`New Payee: ${p.payee_name}`);
      if (p.category_id)
        lines.push(`New Category: ${resolveCat(p.category_id)}`);
      if (p.accountId)
        lines.push(`Move to Account: ${resolveAcct(p.accountId)}`);
      if (p.notes !== undefined)
        lines.push(`New Notes: ${p.notes || '(cleared)'}`);
      break;
    }
    case 'bulk-update-transactions': {
      const updates = Array.isArray(p.updates)
        ? (p.updates as Array<Record<string, unknown>>)
        : [];
      lines.push(`${updates.length} transactions`);

      const changeGroups = new Map<
        string,
        { count: number; payees: Set<string> }
      >();
      const detailLines: string[] = [];

      for (const u of updates) {
        const txInfo = resolveTx(u.transactionId);
        const payeeName = txInfo?.payee_name || 'Unknown';

        const changeParts: string[] = [];
        if (u.category_id === null || u.category_id === '') {
          changeParts.push('remove category');
        } else if (u.category_id) {
          changeParts.push(`category → ${resolveCat(u.category_id)}`);
        }
        if (u.payee_name) changeParts.push(`payee → ${u.payee_name}`);
        if (u.accountId)
          changeParts.push(`account → ${resolveAcct(u.accountId)}`);
        if (u.notes !== undefined)
          changeParts.push(`notes → ${u.notes || '(cleared)'}`);

        const changeKey = changeParts.join(', ') || 'update';

        const existing = changeGroups.get(changeKey);
        if (existing) {
          existing.count++;
          existing.payees.add(payeeName);
        } else {
          changeGroups.set(changeKey, {
            count: 1,
            payees: new Set([payeeName]),
          });
        }

        if (txInfo) {
          detailLines.push(
            `  ${payeeName} | ${formatCents(txInfo.amount ?? 0)} | ${formatDate(txInfo.date)} → ${changeParts.join(', ')}`,
          );
        } else {
          detailLines.push(
            `  ${String(u.transactionId).substring(0, 8)}... → ${changeParts.join(', ')}`,
          );
        }
      }

      if (updates.length >= 10) {
        for (const [change, group] of changeGroups) {
          const payeeList = Array.from(group.payees);
          const payeeSummary =
            payeeList.length <= 3
              ? payeeList.join(', ')
              : `${payeeList.slice(0, 3).join(', ')} +${payeeList.length - 3} more`;
          lines.push(`${group.count}x ${change} (${payeeSummary})`);
        }
        return { summaryLines: lines, detailLines, isGrouped: true };
      }
      lines.push(...detailLines);
      break;
    }
    case 'correct-transfer-direction': {
      lines.push(`Type: Reverse Transfer Direction`);
      const ctdTx = resolveTx(p.transactionId);
      if (ctdTx) {
        lines.push(
          `Transaction: ${ctdTx.payee_name || 'Unknown'} | ${formatCents(ctdTx.amount ?? 0)}`,
        );
      } else if (p.transactionId) {
        lines.push(`Transaction: ${p.transactionId}`);
      }
      break;
    }
    case 'delete-transaction': {
      lines.push(`Type: Delete Transaction`);
      const delTx = resolveTx(p.transactionId);
      if (delTx) {
        lines.push(
          `Transaction: ${delTx.payee_name || 'Unknown'} | ${formatCents(delTx.amount ?? 0)} | ${formatDate(delTx.date)}`,
        );
      } else {
        lines.push(`Transaction: ${p.transactionId}`);
      }
      break;
    }
    case 'transfer-between-accounts':
      lines.push(`Type: Transfer Between Accounts`);
      lines.push(`From: ${resolveAcct(p.fromAccountId)}`);
      lines.push(`To: ${resolveAcct(p.toAccountId)}`);
      if (typeof p.amount === 'number')
        lines.push(`Amount: ${formatCents(p.amount as number)}`);
      if (p.date) lines.push(`Date: ${formatDate(p.date as string)}`);
      if (p.notes) lines.push(`Notes: ${p.notes}`);
      break;
    case 'create-category':
      lines.push(`Type: Create Category`);
      if (p.name) lines.push(`Name: ${p.name}`);
      if (p.group_id) {
        const groupName = ctx?.categoryMap.get(p.group_id as string);
        lines.push(`Group: ${groupName || p.group_id}`);
      }
      break;
    case 'create-account':
      lines.push(`Type: Create Account`);
      if (p.name) lines.push(`Name: ${p.name}`);
      if (typeof p.balance === 'number')
        lines.push(`Balance: ${formatCents(p.balance as number)}`);
      if (typeof p.offBudget === 'boolean')
        lines.push(`Off Budget: ${p.offBudget ? 'Yes' : 'No'}`);
      break;
    case 'rename-category':
      lines.push(`Type: Rename Category`);
      if (p.oldName) lines.push(`From: ${p.oldName}`);
      if (p.newName) lines.push(`To: ${p.newName}`);
      break;
    case 'delete-category':
      lines.push(`Type: Delete Category`);
      if (p.categoryName) lines.push(`Category: ${p.categoryName}`);
      if (
        typeof p.transactionCount === 'number' &&
        (p.transactionCount as number) > 0
      ) {
        lines.push(
          `Warning: ${p.transactionCount} transaction(s) use this category`,
        );
      }
      if (p.transferCategoryId)
        lines.push(`Transfer to: ${resolveCat(p.transferCategoryId)}`);
      break;
    case 'create-category-group':
      lines.push(`Type: Create Category Group`);
      if (p.name) lines.push(`Name: ${p.name}`);
      break;
    case 'move-category':
      lines.push(`Type: Move Category`);
      if (p.categoryName) lines.push(`Category: ${p.categoryName}`);
      if (p.groupName) lines.push(`To Group: ${p.groupName}`);
      break;
    case 'delete-category-group':
      lines.push(`Type: Delete Category Group`);
      if (p.groupName) lines.push(`Group: ${p.groupName}`);
      break;
    case 'bulk-create-category-groups': {
      lines.push(`Type: Bulk Create Category Groups`);
      if (Array.isArray(p.groups)) {
        for (const g of p.groups as Array<{
          name: string;
          categories?: string[];
        }>) {
          const catList =
            Array.isArray(g.categories) && g.categories.length > 0
              ? `: ${g.categories.join(', ')}`
              : '';
          lines.push(`  ${g.name}${catList}`);
        }
      }
      break;
    }
    case 'reorganize-categories': {
      lines.push(`Type: Reorganize Categories`);
      const newGroupNames: string[] = [];
      const moveLines: string[] = [];
      if (Array.isArray(p.newGroups)) {
        for (const g of p.newGroups as Array<{
          name: string;
          categories?: string[];
        }>) {
          newGroupNames.push(g.name);
          if (Array.isArray(g.categories)) {
            for (const cat of g.categories) {
              moveLines.push(`  ${cat} → ${g.name}`);
            }
          }
        }
      }
      if (newGroupNames.length > 0) {
        lines.push(`Create groups: ${newGroupNames.join(', ')}`);
      }
      if (moveLines.length > 0) {
        lines.push(...moveLines);
      }
      if (
        Array.isArray(p.deleteOldGroups) &&
        (p.deleteOldGroups as string[]).length > 0
      ) {
        lines.push(
          `Delete old groups: ${(p.deleteOldGroups as string[]).join(', ')}`,
        );
      }
      break;
    }
    case 'rename-payee':
      lines.push(`Type: Rename Payee`);
      if (p.oldName) lines.push(`From: ${p.oldName}`);
      if (p.newName) lines.push(`To: ${p.newName}`);
      break;
    case 'merge-payees':
      lines.push(`Type: Merge Payees`);
      if (p.targetName) lines.push(`Target: ${p.targetName}`);
      if (Array.isArray(p.mergeNames))
        lines.push(`Merging: ${p.mergeNames.join(', ')}`);
      break;
    case 'copy-previous-month':
      lines.push(`Type: Copy Previous Month Budget`);
      if (p.month) lines.push(`Month: ${p.month}`);
      break;
    case 'set-budget-average':
      lines.push(`Type: Set Budget to Average`);
      if (p.month) lines.push(`Month: ${p.month}`);
      if (p.numMonths) lines.push(`Average: ${p.numMonths} months`);
      break;
    case 'bulk-set-budget':
      lines.push(`Type: Bulk Set Budget`);
      if (p.month) lines.push(`Month: ${p.month}`);
      if (Array.isArray(p.budgets))
        lines.push(`Categories: ${p.budgets.length}`);
      break;
    case 'transfer-budget':
      lines.push(`Type: Transfer Budget`);
      if (p.month) lines.push(`Month: ${p.month}`);
      if (p.fromCategoryName) lines.push(`From: ${p.fromCategoryName}`);
      if (p.toCategoryName) lines.push(`To: ${p.toCategoryName}`);
      if (typeof p.amount === 'number')
        lines.push(`Amount: ${formatCents(p.amount as number)}`);
      break;
    case 'query':
      lines.push(`Type: Data Query`);
      lines.push(`Query: ${action.description}`);
      break;
    case 'close-account':
      lines.push(`Type: Close Account`);
      lines.push(`Account: ${resolveAcct(p.accountId)}`);
      if (p.transferAccountId)
        lines.push(`Transfer Balance To: ${resolveAcct(p.transferAccountId)}`);
      break;
    case 'reopen-account':
      lines.push(`Type: Reopen Account`);
      lines.push(`Account: ${resolveAcct(p.accountId)}`);
      break;
    case 'create-goal':
      lines.push(`Type: Create Savings Goal`);
      if (p.name) lines.push(`Name: ${p.name}`);
      if (typeof p.targetAmount === 'number')
        lines.push(`Target: ${formatCents(p.targetAmount as number)}`);
      if (p.targetDate) lines.push(`Target Date: ${p.targetDate}`);
      break;
    case 'update-goal':
      lines.push(`Type: Update Savings Goal`);
      if (p.goalId) lines.push(`Goal ID: ${p.goalId}`);
      if (p.name) lines.push(`New Name: ${p.name}`);
      if (typeof p.targetAmount === 'number')
        lines.push(`New Target: ${formatCents(p.targetAmount as number)}`);
      if (p.targetDate) lines.push(`New Target Date: ${p.targetDate}`);
      break;
    case 'delete-goal':
      lines.push(`Type: Delete Savings Goal`);
      if (p.goalName) lines.push(`Goal: ${p.goalName}`);
      break;
    case 'save-memory':
      lines.push(`Type: Save Memory`);
      if (p.content) lines.push(`Content: ${p.content}`);
      if (p.category) lines.push(`Category: ${p.category}`);
      break;
    case 'delete-memory':
      lines.push(`Type: Delete Memory`);
      if (p.memoryId) lines.push(`Memory ID: ${p.memoryId}`);
      break;
    case 'list-memories':
      lines.push(`Type: List Memories`);
      break;
    case 'create-rule': {
      const hasAdvancedConditions = Array.isArray(p.conditions);
      if (hasAdvancedConditions) {
        lines.push(`Type: Create Rule`);
        for (const c of p.conditions as Array<Record<string, unknown>>) {
          lines.push(`  Condition: ${c.field} ${c.op} ${c.value}`);
        }
        if (Array.isArray(p.actions)) {
          for (const a of p.actions as Array<Record<string, unknown>>) {
            lines.push(`  Action: ${a.op} ${a.field} = ${a.value}`);
          }
        }
      } else {
        lines.push(`Type: Create Payee Rename Rule`);
        if (p.containsPattern)
          lines.push(
            `Match imported payees containing: "${p.containsPattern}"`,
          );
        if (Array.isArray(p.fromNames))
          lines.push(
            `Match imported payees exactly: ${(p.fromNames as string[]).join(', ')}`,
          );
        if (p.toPayee) lines.push(`Rename to: ${p.toPayee}`);
      }
      break;
    }
    case 'update-rule': {
      lines.push(`Type: Update Rule`);
      if (p.ruleId) lines.push(`Rule ID: ${p.ruleId}`);
      if (Array.isArray(p.conditions)) {
        for (const c of p.conditions as Array<Record<string, unknown>>) {
          lines.push(`  Condition: ${c.field} ${c.op} ${c.value}`);
        }
      }
      if (Array.isArray(p.actions)) {
        for (const a of p.actions as Array<Record<string, unknown>>) {
          lines.push(`  Action: ${a.op} ${a.field} = ${a.value}`);
        }
      }
      break;
    }
    case 'delete-rule':
      lines.push(`Type: Delete Rule`);
      if (p.ruleId) lines.push(`Rule ID: ${p.ruleId}`);
      break;
    case 'list-rules':
      lines.push(`Type: List Rules`);
      break;
    case 'create-schedule':
      lines.push(`Type: Create Schedule`);
      if (p.name) lines.push(`Name: ${p.name}`);
      if (p.payee_name) lines.push(`Payee: ${p.payee_name}`);
      if (typeof p.amount === 'number')
        lines.push(`Amount: ${formatCents(p.amount as number)}`);
      if (p.frequency)
        lines.push(
          `Frequency: ${p.interval && (p.interval as number) > 1 ? `every ${p.interval} ${p.frequency}` : p.frequency}`,
        );
      if (p.date) lines.push(`Starting: ${formatDate(p.date as string)}`);
      break;
    case 'update-schedule':
      lines.push(`Type: Update Schedule`);
      if (p.scheduleId) lines.push(`Schedule ID: ${p.scheduleId}`);
      if (p.name) lines.push(`New Name: ${p.name}`);
      if (p.payee_name) lines.push(`New Payee: ${p.payee_name}`);
      if (typeof p.amount === 'number')
        lines.push(`New Amount: ${formatCents(p.amount as number)}`);
      if (p.frequency) lines.push(`New Frequency: ${p.frequency}`);
      if (p.date) lines.push(`New Date: ${formatDate(p.date as string)}`);
      break;
    case 'delete-schedule':
      lines.push(`Type: Delete Schedule`);
      if (p.scheduleName) lines.push(`Schedule: ${p.scheduleName}`);
      break;
    case 'create-schedules-batch': {
      lines.push(`Type: Create Schedules (Batch)`);
      if (Array.isArray(p.schedules)) {
        for (const s of p.schedules as Array<{
          payee_name: string;
          amount: number;
          frequency: string;
          interval?: number;
        }>) {
          const freq =
            s.interval && s.interval > 1
              ? `every ${s.interval} ${s.frequency}`
              : s.frequency;
          lines.push(`  ${s.payee_name}: ${formatCents(s.amount)} / ${freq}`);
        }
      }
      break;
    }
  }

  return { summaryLines: lines, isGrouped: false };
}

async function resolveRuleConditions(
  conditions: Array<Record<string, unknown>>,
): Promise<Array<{ field: string; op: string; value: unknown }>> {
  const resolved: Array<{ field: string; op: string; value: unknown }> = [];
  const allPayees = (await send('payees-get')) as Array<{
    id: string;
    name: string;
  }>;
  const allCategories = (await send('api/categories-get')) as Array<{
    id: string;
    name: string;
  }>;
  const allAccounts = (await send('api/accounts-get')) as Array<{
    id: string;
    name: string;
  }>;
  for (const c of conditions) {
    const field = c.field as string;
    const op = c.op as string;
    let value = c.value;
    if (field === 'payee') {
      if (typeof value === 'string') {
        const match = allPayees.find(
          p => p.name.toLowerCase() === (value as string).toLowerCase(),
        );
        if (match) value = match.id;
      } else if (Array.isArray(value)) {
        value = (value as string[]).map(v => {
          if (typeof v !== 'string') return v;
          const match = allPayees.find(
            p => p.name.toLowerCase() === v.toLowerCase(),
          );
          return match ? match.id : v;
        });
      }
    }
    if (field === 'category') {
      if (typeof value === 'string') {
        const match = allCategories.find(
          cat => cat.name.toLowerCase() === (value as string).toLowerCase(),
        );
        if (match) value = match.id;
      } else if (Array.isArray(value)) {
        value = (value as string[]).map(v => {
          if (typeof v !== 'string') return v;
          const match = allCategories.find(
            cat => cat.name.toLowerCase() === v.toLowerCase(),
          );
          return match ? match.id : v;
        });
      }
    }
    if (field === 'account') {
      if (typeof value === 'string') {
        const match = allAccounts.find(
          a => a.name.toLowerCase() === (value as string).toLowerCase(),
        );
        if (match) value = match.id;
      } else if (Array.isArray(value)) {
        value = (value as string[]).map(v => {
          if (typeof v !== 'string') return v;
          const match = allAccounts.find(
            a => a.name.toLowerCase() === v.toLowerCase(),
          );
          return match ? match.id : v;
        });
      }
    }
    resolved.push({ field, op, value });
  }
  return resolved;
}

async function resolveRuleActions(
  actions: Array<Record<string, unknown>>,
): Promise<Array<{ op: string; field: string; value: unknown }>> {
  const resolved: Array<{ op: string; field: string; value: unknown }> = [];
  const allPayees = (await send('payees-get')) as Array<{
    id: string;
    name: string;
  }>;
  const allCategories = (await send('api/categories-get')) as Array<{
    id: string;
    name: string;
  }>;
  const allAccounts = (await send('api/accounts-get')) as Array<{
    id: string;
    name: string;
  }>;
  for (const a of actions) {
    const op = (a.op as string) || 'set';
    const field = a.field as string;
    let value = a.value;
    if (field === 'payee' && typeof value === 'string') {
      const match = allPayees.find(
        p => p.name.toLowerCase() === (value as string).toLowerCase(),
      );
      if (match) {
        value = match.id;
      } else {
        const newPayeeId = (await send('payee-create', {
          name: value as string,
        })) as string;
        value = newPayeeId;
      }
    }
    if (field === 'category' && typeof value === 'string') {
      const match = allCategories.find(
        cat => cat.name.toLowerCase() === (value as string).toLowerCase(),
      );
      if (match) value = match.id;
    }
    if (field === 'account' && typeof value === 'string') {
      const match = allAccounts.find(
        acc => acc.name.toLowerCase() === (value as string).toLowerCase(),
      );
      if (match) value = match.id;
    }
    resolved.push({ op, field, value });
  }
  return resolved;
}

export async function executeAction(action: BudgetAction): Promise<string> {
  switch (action.type) {
    case 'set-budget-amount': {
      const validated = validateSetBudgetAmount(action.params);
      await send('api/budget-set-amount', validated);
      return `Budget amount set successfully for ${validated.month}.`;
    }
    case 'add-transaction': {
      const validated = validateAddTransaction(action.params);
      await send('api/transactions-add', {
        accountId: validated.accountId,
        transactions: [
          {
            date: validated.date,
            amount: validated.amount,
            payee_name: validated.payee_name,
            category: validated.category_id,
            notes: validated.notes,
          },
        ],
      });
      return 'Transaction added successfully.';
    }
    case 'update-transaction': {
      const validated = validateUpdateTransaction(action.params);
      const updateFields: {
        id: string;
        date?: string;
        amount?: number;
        category?: string;
        notes?: string;
        payee?: string;
        account?: string;
      } = { id: validated.transactionId };
      if (validated.date !== undefined) updateFields.date = validated.date;
      if (validated.amount !== undefined)
        updateFields.amount = validated.amount;
      if (validated.category_id !== undefined)
        updateFields.category = validated.category_id;
      if (validated.notes !== undefined) updateFields.notes = validated.notes;
      if (validated.accountId !== undefined)
        updateFields.account = validated.accountId;
      if (validated.payee_name !== undefined) {
        const allPayees = (await send('payees-get')) as Array<{
          id: string;
          name: string;
        }>;
        const matchedPayee = allPayees.find(
          p => p.name.toLowerCase() === validated.payee_name!.toLowerCase(),
        );
        if (matchedPayee) {
          updateFields.payee = matchedPayee.id;
        } else {
          const newPayeeId = (await send('payee-create', {
            name: validated.payee_name,
          })) as string;
          updateFields.payee = newPayeeId;
        }
      }
      await send(
        'transaction-update',
        updateFields as Parameters<typeof send<'transaction-update'>>[1],
      );
      return 'Transaction updated successfully.';
    }
    case 'correct-transfer-direction': {
      const { transactionId } = action.params;
      if (typeof transactionId !== 'string' || !transactionId)
        throw new Error(
          'correct-transfer-direction requires a non-empty "transactionId".',
        );
      const txQuery = q('transactions')
        .filter({ id: transactionId })
        .select('*')
        .options({ splits: 'inline' });
      const { data: txResults } = (await send('api/query', {
        query: txQuery.serialize(),
      })) as {
        data: Array<{ id: string; amount: number; transfer_id?: string }>;
      };
      const sourceTx = txResults[0];
      if (!sourceTx) throw new Error(`Transaction not found: ${transactionId}`);
      if (!sourceTx.transfer_id)
        throw new Error(
          'This transaction is not a transfer. Use update-transaction with accountId to move a regular transaction.',
        );
      await send('transaction-update', {
        id: sourceTx.id,
        amount: -sourceTx.amount,
      } as Parameters<typeof send<'transaction-update'>>[1]);
      return 'Transfer direction corrected — the flow of money has been reversed between the two accounts.';
    }
    case 'bulk-update-transactions': {
      const validated = validateBulkUpdateTransactions(action.params);
      const allPayees = (await send('payees-get')) as Array<{
        id: string;
        name: string;
      }>;
      let successCount = 0;
      for (const entry of validated.updates) {
        const updateFields: {
          id: string;
          date?: string;
          amount?: number;
          category?: string;
          notes?: string;
          payee?: string;
          account?: string;
        } = { id: entry.transactionId };
        if (entry.date !== undefined) updateFields.date = entry.date;
        if (entry.amount !== undefined) updateFields.amount = entry.amount;
        if (entry.category_id !== undefined)
          updateFields.category = entry.category_id;
        if (entry.notes !== undefined) updateFields.notes = entry.notes;
        if (entry.accountId !== undefined)
          updateFields.account = entry.accountId;
        if (entry.payee_name !== undefined) {
          const matchedPayee = allPayees.find(
            p => p.name.toLowerCase() === entry.payee_name!.toLowerCase(),
          );
          if (matchedPayee) {
            updateFields.payee = matchedPayee.id;
          } else {
            const newPayeeId = (await send('payee-create', {
              name: entry.payee_name,
            })) as string;
            updateFields.payee = newPayeeId;
            allPayees.push({ id: newPayeeId, name: entry.payee_name });
          }
        }
        await send(
          'transaction-update',
          updateFields as Parameters<typeof send<'transaction-update'>>[1],
        );
        successCount++;
      }
      return `Successfully updated ${successCount} transaction${successCount !== 1 ? 's' : ''}.`;
    }
    case 'delete-transaction': {
      const validated = validateDeleteTransaction(action.params);
      await send('transaction-delete', { id: validated.transactionId });
      return 'Transaction deleted successfully.';
    }
    case 'transfer-between-accounts': {
      const validated = validateTransferBetweenAccounts(action.params);
      const allPayees = (await send('payees-get')) as Array<{
        id: string;
        transfer_acct?: string;
      }>;
      const transferPayee = allPayees.find(
        p => p.transfer_acct === validated.toAccountId,
      );
      if (!transferPayee)
        throw new Error(
          'Could not find transfer payee for the destination account.',
        );
      await send('api/transactions-add', {
        accountId: validated.fromAccountId,
        transactions: [
          {
            date: validated.date,
            amount: -Math.abs(validated.amount),
            payee: transferPayee.id,
            notes: validated.notes,
          },
        ],
        runTransfers: true,
      });
      return 'Transfer completed successfully.';
    }
    case 'create-category': {
      const validated = validateCreateCategory(action.params);
      let resolvedGroupId = validated.group_id;

      const allGroups = (await send('api/category-groups-get')) as Array<{
        id: string;
        name: string;
        is_income?: boolean;
        hidden?: boolean;
      }>;

      const groupExists = allGroups.some(g => g.id === resolvedGroupId);
      if (!groupExists) {
        const byName = allGroups.find(
          g => g.name.toLowerCase() === resolvedGroupId.toLowerCase(),
        );
        if (byName) {
          resolvedGroupId = byName.id;
        } else {
          const groupNames = allGroups.map(g => g.name).join(', ');
          throw new Error(
            `Could not find category group "${resolvedGroupId}". ` +
              (groupNames
                ? `Available groups: ${groupNames}. Please specify which group to add the category to.`
                : 'No category groups exist. Please create a category group first.'),
          );
        }
      }

      await send('api/category-create', {
        category: {
          name: validated.name,
          group_id: resolvedGroupId,
          hidden: false,
        },
      });
      const targetGroup = allGroups.find(g => g.id === resolvedGroupId);
      return `Category "${validated.name}" created successfully${targetGroup ? ` in group "${targetGroup.name}"` : ''}.`;
    }
    case 'create-account': {
      const validated = validateCreateAccount(action.params);
      await send('api/account-create', {
        account: {
          name: validated.name,
          offbudget: validated.offBudget,
        },
        initialBalance: validated.balance,
      });
      return `Account "${validated.name}" created successfully.`;
    }
    case 'close-account': {
      const validated = validateCloseAccount(action.params);
      await send('account-close', {
        id: validated.accountId,
        transferAccountId: validated.transferAccountId,
      });
      return 'Account closed successfully.';
    }
    case 'reopen-account': {
      const validated = validateReopenAccount(action.params);
      await send('account-reopen', { id: validated.accountId });
      return 'Account reopened successfully.';
    }
    case 'rename-category': {
      const validated = validateRenameCategory(action.params);
      await send('api/category-update', {
        id: validated.categoryId,
        fields: { name: validated.newName },
      });
      return `Category renamed from "${validated.oldName}" to "${validated.newName}" successfully.`;
    }
    case 'delete-category': {
      const validated = validateDeleteCategory(action.params);
      await send('api/category-delete', {
        id: validated.categoryId,
        transferCategoryId: validated.transferCategoryId,
      });
      return `Category "${validated.categoryName}" deleted successfully.`;
    }
    case 'create-category-group': {
      const validated = validateCreateCategoryGroup(action.params);
      const groupId = await send('api/category-group-create', {
        group: { name: validated.name },
      });
      if (validated.categories && validated.categories.length > 0) {
        for (const cat of validated.categories) {
          await send('api/category-create', {
            category: { name: cat.name, group_id: groupId, hidden: false },
          });
        }
        return `Category group "${validated.name}" created with ${validated.categories.length} categor${validated.categories.length === 1 ? 'y' : 'ies'}: ${validated.categories.map(c => c.name).join(', ')}.`;
      }
      return `Category group "${validated.name}" created successfully.`;
    }
    case 'move-category': {
      const validated = validateMoveCategory(action.params);
      await send('api/category-update', {
        id: validated.categoryId,
        fields: { group_id: validated.groupId },
      });
      return `Category "${validated.categoryName}" moved to group "${validated.groupName}" successfully.`;
    }
    case 'delete-category-group': {
      const validated = validateDeleteCategoryGroup(action.params);
      const allCategories = await send('api/categories-get', {
        grouped: false,
      });
      const remainingCategories = (
        allCategories as Array<{ group_id?: string }>
      ).filter(c => c.group_id === validated.groupId);
      if (remainingCategories.length > 0) {
        throw new Error(
          `Cannot delete group "${validated.groupName}" — it still contains ${remainingCategories.length} categor${remainingCategories.length === 1 ? 'y' : 'ies'}. Move all categories out first.`,
        );
      }
      await send('api/category-group-delete', {
        id: validated.groupId,
      });
      return `Category group "${validated.groupName}" deleted successfully.`;
    }
    case 'rename-payee': {
      const validated = validateRenamePayee(action.params);
      await send('payees-batch-change', {
        updated: [{ id: validated.payeeId, name: validated.newName }],
      });
      return `Payee renamed from "${validated.oldName}" to "${validated.newName}" successfully.`;
    }
    case 'merge-payees': {
      const validated = validateMergePayees(action.params);
      await send('payees-merge', {
        targetId: validated.targetId,
        mergeIds: validated.mergeIds,
      });
      return `Payees merged into "${validated.targetName}" successfully.`;
    }
    case 'copy-previous-month': {
      const validated = validateCopyPreviousMonth(action.params);
      await send('budget/copy-previous-month', { month: validated.month });
      return `Budget values copied from previous month to ${validated.month} successfully.`;
    }
    case 'set-budget-average': {
      const validated = validateSetBudgetAverage(action.params);
      const methodMap: Record<number, string> = {
        3: 'budget/set-3month-avg',
        6: 'budget/set-6month-avg',
        12: 'budget/set-12month-avg',
      };
      const method = methodMap[validated.numMonths];
      await send(method as 'budget/set-3month-avg', { month: validated.month });
      return `Budget amounts set to ${validated.numMonths}-month average for ${validated.month} successfully.`;
    }
    case 'bulk-set-budget': {
      const validated = validateBulkSetBudget(action.params);
      for (const entry of validated.budgets) {
        await send('api/budget-set-amount', {
          month: validated.month,
          categoryId: entry.categoryId,
          amount: entry.amount,
        });
      }
      return `Budget amounts set for ${validated.budgets.length} categor${validated.budgets.length === 1 ? 'y' : 'ies'} in ${validated.month} successfully.`;
    }
    case 'transfer-budget': {
      const validated = validateTransferBudget(action.params);
      await send('budget/transfer-category', {
        month: validated.month,
        amount: validated.amount,
        from: validated.fromCategoryId,
        to: validated.toCategoryId,
        currencyCode: 'USD',
      });
      return `Transferred ${formatCents(validated.amount)} from "${validated.fromCategoryName}" to "${validated.toCategoryName}" successfully.`;
    }
    case 'create-goal': {
      const validated = validateCreateGoal(action.params);
      const goal = await createGoal(validated);
      return `Savings goal "${goal.name}" created successfully. Target: ${formatCents(goal.targetAmount)} by ${goal.targetDate}.`;
    }
    case 'update-goal': {
      const validated = validateUpdateGoal(action.params);
      const updates: Record<string, unknown> = {};
      if (validated.name !== undefined) updates.name = validated.name;
      if (validated.targetAmount !== undefined)
        updates.targetAmount = validated.targetAmount;
      if (validated.targetDate !== undefined)
        updates.targetDate = validated.targetDate;
      if (validated.associatedAccountIds !== undefined)
        updates.associatedAccountIds = validated.associatedAccountIds;
      if (validated.associatedCategoryIds !== undefined)
        updates.associatedCategoryIds = validated.associatedCategoryIds;
      const updated = await updateGoal(validated.goalId, updates);
      if (!updated) throw new Error('Goal not found.');
      return `Savings goal "${updated.name}" updated successfully.`;
    }
    case 'delete-goal': {
      const validated = validateDeleteGoal(action.params);
      const deleted = await deleteGoal(validated.goalId);
      if (!deleted) throw new Error('Goal not found.');
      return `Savings goal "${validated.goalName}" deleted successfully.`;
    }
    case 'create-schedule': {
      const validated = validateCreateSchedule(action.params);
      let resolvedAccountId = validated.accountId;
      if (!resolvedAccountId) {
        const allAccounts = (await send('api/accounts-get')) as Array<{
          id: string;
          closed?: boolean;
        }>;
        const openAccounts = allAccounts.filter(a => !a.closed);
        if (openAccounts.length === 0)
          throw new Error(
            'No open accounts available to assign this schedule to.',
          );
        resolvedAccountId = openAccounts[0].id;
      }
      const allPayees = (await send('payees-get')) as Array<{
        id: string;
        name: string;
      }>;
      let payeeId: string;
      const matchedPayee = allPayees.find(
        p => p.name.toLowerCase() === validated.payee_name.toLowerCase(),
      );
      if (matchedPayee) {
        payeeId = matchedPayee.id;
      } else {
        payeeId = (await send('payee-create', {
          name: validated.payee_name,
        })) as string;
      }
      const dateValue = buildScheduleDateValue(
        validated.date,
        validated.frequency,
        validated.interval,
      );
      const scheduleName = validated.name || validated.payee_name;
      await send('api/schedule-create', {
        name: scheduleName,
        payee: payeeId,
        account: resolvedAccountId,
        amount: validated.amount,
        amountOp: validated.amountOp as 'is' | 'isapprox' | 'isbetween',
        date: dateValue as {
          start: string;
          frequency: 'weekly' | 'monthly' | 'yearly';
          interval: number;
        },
        posts_transaction: validated.posts_transaction,
      });
      const freqLabel =
        validated.interval > 1
          ? `every ${validated.interval} ${validated.frequency}`
          : validated.frequency;
      return `Schedule created for "${validated.payee_name}" — ${formatCents(Math.abs(validated.amount))} ${freqLabel}, starting ${validated.date}.`;
    }
    case 'update-schedule': {
      const validated = validateUpdateSchedule(action.params);
      const fields: Record<string, unknown> = {};
      if (validated.name !== undefined) fields.name = validated.name;
      if (validated.posts_transaction !== undefined)
        fields.posts_transaction = validated.posts_transaction;
      if (validated.payee_name !== undefined) {
        const allPayees = (await send('payees-get')) as Array<{
          id: string;
          name: string;
        }>;
        const matchedPayee = allPayees.find(
          p => p.name.toLowerCase() === validated.payee_name!.toLowerCase(),
        );
        if (matchedPayee) {
          fields.payee = matchedPayee.id;
        } else {
          const newPayeeId = (await send('payee-create', {
            name: validated.payee_name,
          })) as string;
          fields.payee = newPayeeId;
        }
      }
      if (validated.accountId !== undefined)
        fields.account = validated.accountId;
      if (validated.amount !== undefined) fields.amount = validated.amount;
      if (validated.amountOp !== undefined)
        fields.amountOp = validated.amountOp;
      const hasDateChange =
        validated.date !== undefined ||
        validated.frequency !== undefined ||
        validated.interval !== undefined;
      if (hasDateChange) {
        const existingSchedules = (await send('api/schedules-get')) as Array<{
          id: string;
          date?:
            | { start?: string; frequency?: string; interval?: number }
            | string;
        }>;
        const existing = existingSchedules.find(
          s => s.id === validated.scheduleId,
        );
        const existingDate =
          existing?.date && typeof existing.date === 'object'
            ? existing.date
            : undefined;
        const schedDate =
          validated.date ||
          existingDate?.start ||
          new Date().toISOString().split('T')[0];
        const schedFrequency =
          validated.frequency || existingDate?.frequency || 'monthly';
        const schedInterval = validated.interval || existingDate?.interval || 1;
        fields.date = buildScheduleDateValue(
          schedDate,
          schedFrequency,
          schedInterval,
        );
      }
      await send('api/schedule-update', {
        id: validated.scheduleId,
        fields,
        resetNextDate: hasDateChange,
      });
      return 'Schedule updated successfully.';
    }
    case 'delete-schedule': {
      const validated = validateDeleteSchedule(action.params);
      await send('api/schedule-delete', validated.scheduleId);
      return `Schedule "${validated.scheduleName}" deleted successfully.`;
    }
    case 'create-schedules-batch': {
      const validated = validateCreateSchedulesBatch(action.params);
      const allAccounts = (await send('api/accounts-get')) as Array<{
        id: string;
        closed?: boolean;
      }>;
      const openAccounts = allAccounts.filter(a => !a.closed);
      const defaultAccountId =
        openAccounts.length > 0 ? openAccounts[0].id : undefined;
      const allPayees = (await send('payees-get')) as Array<{
        id: string;
        name: string;
      }>;
      const payeeLookup = new Map<string, string>();
      for (const p of allPayees) {
        payeeLookup.set(p.name.toLowerCase(), p.id);
      }
      const results: string[] = [];
      for (const sched of validated.schedules) {
        const accountId = sched.accountId || defaultAccountId;
        if (!accountId)
          throw new Error('No open accounts available to assign schedules to.');
        let payeeId = payeeLookup.get(sched.payee_name.toLowerCase());
        if (!payeeId) {
          payeeId = (await send('payee-create', {
            name: sched.payee_name,
          })) as string;
          payeeLookup.set(sched.payee_name.toLowerCase(), payeeId);
        }
        const dateValue = buildScheduleDateValue(
          sched.date,
          sched.frequency,
          sched.interval,
        );
        const scheduleName = sched.name || sched.payee_name;
        await send('api/schedule-create', {
          name: scheduleName,
          payee: payeeId,
          account: accountId,
          amount: sched.amount,
          amountOp: sched.amountOp as 'is' | 'isapprox' | 'isbetween',
          date: dateValue as {
            start: string;
            frequency: 'weekly' | 'monthly' | 'yearly';
            interval: number;
          },
          posts_transaction: sched.posts_transaction,
        });
        const freqLabel =
          sched.interval > 1
            ? `every ${sched.interval} ${sched.frequency}`
            : sched.frequency;
        results.push(
          `"${sched.payee_name}" — ${formatCents(Math.abs(sched.amount))} ${freqLabel}`,
        );
      }
      return `Created ${results.length} schedule(s):\n${results.map(r => `  ✓ ${r}`).join('\n')}`;
    }
    case 'bulk-create-category-groups': {
      const groups = action.params.groups;
      if (!Array.isArray(groups) || groups.length === 0) {
        throw new Error(
          'bulk-create-category-groups requires a non-empty "groups" array.',
        );
      }
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i] as { name?: unknown; categories?: unknown };
        if (!g || typeof g.name !== 'string' || !g.name.trim()) {
          throw new Error(`groups[${i}] must have a non-empty string "name".`);
        }
        if (g.categories !== undefined && !Array.isArray(g.categories)) {
          throw new Error(
            `groups[${i}].categories must be an array of category name strings.`,
          );
        }
        if (Array.isArray(g.categories)) {
          for (let j = 0; j < (g.categories as unknown[]).length; j++) {
            const catVal = (g.categories as unknown[])[j];
            if (typeof catVal !== 'string' || !(catVal as string).trim()) {
              throw new Error(
                `groups[${i}].categories[${j}] must be a non-empty string.`,
              );
            }
          }
        }
      }

      const typedGroups = (
        groups as Array<{ name: string; categories?: string[] }>
      ).map(g => ({
        name: g.name.trim(),
        categories: Array.isArray(g.categories)
          ? g.categories.map(c => c.trim())
          : undefined,
      }));
      const summary: string[] = [];

      for (const group of typedGroups) {
        const groupId = (await send('api/category-group-create', {
          group: { name: group.name },
        })) as unknown as string;

        const catCount = Array.isArray(group.categories)
          ? group.categories.length
          : 0;
        if (Array.isArray(group.categories) && group.categories.length > 0) {
          for (const catName of group.categories) {
            await send('api/category-create', {
              category: { name: catName, group_id: groupId, hidden: false },
            });
          }
          summary.push(
            `"${group.name}" with ${catCount} categor${catCount === 1 ? 'y' : 'ies'}: ${group.categories.join(', ')}`,
          );
        } else {
          summary.push(`"${group.name}" (empty)`);
        }
      }

      return `Created ${typedGroups.length} category group${typedGroups.length === 1 ? '' : 's'}:\n${summary.join('\n')}`;
    }
    case 'create-rule': {
      const {
        fromNames,
        containsPattern,
        toPayee,
        conditions,
        actions,
        conditionsOp,
        stage,
      } = action.params;
      if (Array.isArray(conditions) && Array.isArray(actions)) {
        const resolvedConditions = await resolveRuleConditions(
          conditions as Array<Record<string, unknown>>,
        );
        const resolvedActions = await resolveRuleActions(
          actions as Array<Record<string, unknown>>,
        );
        const rulePayload = {
          stage: (stage === null
            ? null
            : typeof stage === 'string'
              ? stage
              : 'pre') as 'pre' | null | 'post',
          conditionsOp: (typeof conditionsOp === 'string'
            ? conditionsOp
            : 'and') as 'and' | 'or',
          conditions: resolvedConditions,
          actions: resolvedActions,
        };
        const result = (await send(
          'rule-add',
          rulePayload as Parameters<typeof send<'rule-add'>>[1],
        )) as { error?: { message?: string } } | { id: string };
        if ('error' in result && result.error) {
          throw new Error(
            `Failed to create rule: ${result.error.message || 'validation error'}`,
          );
        }
        const condDesc = resolvedConditions
          .map(c => `${c.field} ${c.op} ${c.value}`)
          .join(' AND ');
        const actDesc = resolvedActions
          .map(a => `${a.op} ${a.field} = ${a.value}`)
          .join(', ');
        return `Rule created: If ${condDesc} → ${actDesc}`;
      }

      if (typeof toPayee !== 'string' || !toPayee.trim()) {
        throw new Error(
          'create-rule requires a non-empty "toPayee" string or "conditions"/"actions" arrays.',
        );
      }
      const cleanToPayee = (toPayee as string).trim();
      const allPayees = (await send('payees-get')) as Array<{
        id: string;
        name: string;
      }>;
      let payeeId: string;
      const matchedPayee = allPayees.find(
        p => p.name.toLowerCase() === cleanToPayee.toLowerCase(),
      );
      if (matchedPayee) {
        payeeId = matchedPayee.id;
      } else {
        payeeId = (await send('payee-create', {
          name: cleanToPayee,
        })) as string;
      }

      if (typeof containsPattern === 'string' && containsPattern.trim()) {
        const result = (await send('rule-add', {
          stage: 'pre',
          conditionsOp: 'and',
          conditions: [
            {
              field: 'imported_payee',
              op: 'contains',
              value: containsPattern.trim(),
            },
          ],
          actions: [{ op: 'set', field: 'payee', value: payeeId }],
        })) as { error?: { message?: string } } | { id: string };
        if ('error' in result && result.error) {
          throw new Error(
            `Failed to create rule: ${result.error.message || 'validation error'}`,
          );
        }
        return `Payee rename rule created: imported payee contains "${containsPattern.trim()}" → ${cleanToPayee}`;
      }

      if (!Array.isArray(fromNames) || fromNames.length === 0) {
        throw new Error(
          'create-rule requires either "containsPattern" (substring match), "fromNames" (exact match list), or "conditions"/"actions" arrays.',
        );
      }
      for (const name of fromNames as unknown[]) {
        if (typeof name !== 'string' || !(name as string).trim()) {
          throw new Error(
            'Each entry in fromNames must be a non-empty string.',
          );
        }
      }
      await send('rule-add-payee-rename', {
        fromNames: (fromNames as string[]).map(n => n.trim()),
        to: payeeId,
      });
      return `Payee rename rule created: ${(fromNames as string[]).join(', ')} → ${cleanToPayee}`;
    }
    case 'update-rule': {
      const { ruleId, conditions, actions, conditionsOp, stage } =
        action.params;
      if (typeof ruleId !== 'string' || !ruleId.trim()) {
        throw new Error('update-rule requires a non-empty "ruleId" string.');
      }
      const existingRule = (await send('rule-get', {
        id: ruleId as string,
      })) as {
        id: string;
        stage?: string;
        conditionsOp?: string;
        conditions?: Array<{ field: string; op: string; value: unknown }>;
        actions?: Array<{ field: string; op: string; value: unknown }>;
      } | null;
      if (!existingRule) {
        throw new Error(`Rule not found: ${ruleId}`);
      }
      const resolvedStage =
        stage === null
          ? null
          : typeof stage === 'string'
            ? stage
            : existingRule.stage !== undefined
              ? existingRule.stage
              : 'pre';
      const updatedRule: Record<string, unknown> = {
        id: ruleId,
        stage: resolvedStage,
        conditionsOp:
          typeof conditionsOp === 'string'
            ? conditionsOp
            : existingRule.conditionsOp || 'and',
      };
      if (Array.isArray(conditions)) {
        updatedRule.conditions = await resolveRuleConditions(
          conditions as Array<Record<string, unknown>>,
        );
      } else {
        updatedRule.conditions = existingRule.conditions || [];
      }
      if (Array.isArray(actions)) {
        updatedRule.actions = await resolveRuleActions(
          actions as Array<Record<string, unknown>>,
        );
      } else {
        updatedRule.actions = existingRule.actions || [];
      }
      const updateResult = (await send(
        'rule-update',
        updatedRule as Parameters<typeof send<'rule-update'>>[1],
      )) as { error?: { message?: string } } | { id: string };
      if ('error' in updateResult && updateResult.error) {
        throw new Error(
          `Failed to update rule: ${updateResult.error.message || 'validation error'}`,
        );
      }
      return 'Rule updated successfully.';
    }
    case 'delete-rule': {
      const { ruleId } = action.params;
      if (typeof ruleId !== 'string' || !ruleId.trim()) {
        throw new Error('delete-rule requires a non-empty "ruleId" string.');
      }
      const deleteResult = await send('rule-delete', ruleId);
      if (deleteResult === false) {
        throw new Error(
          'Failed to delete rule — the rule may be in use or no longer exists.',
        );
      }
      return `Rule deleted successfully.`;
    }
    case 'list-rules': {
      const rules = (await send('rules-get')) as Array<{
        id: string;
        stage?: string;
        conditionsOp?: string;
        conditions?: Array<{ field: string; op: string; value: unknown }>;
        actions?: Array<{ field: string; op: string; value: unknown }>;
      }>;
      if (!rules || rules.length === 0) return 'No rules found.';
      const allPayees = (await send('payees-get')) as Array<{
        id: string;
        name: string;
      }>;
      const payeeIdToName = new Map<string, string>();
      for (const p of allPayees) payeeIdToName.set(p.id, p.name);
      const allCategories = (await send('api/categories-get')) as Array<{
        id: string;
        name: string;
      }>;
      const catIdToName = new Map<string, string>();
      if (Array.isArray(allCategories)) {
        for (const c of allCategories) catIdToName.set(c.id, c.name);
      }
      const resolveValue = (field: string, value: unknown): string => {
        if (field === 'payee' && typeof value === 'string') {
          return payeeIdToName.get(value) || value;
        }
        if (field === 'category' && typeof value === 'string') {
          return catIdToName.get(value) || value;
        }
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
      };
      const ruleLines: string[] = [`Found ${rules.length} rule(s):\n`];
      for (const rule of rules) {
        const condStr = (rule.conditions || [])
          .map(c => `${c.field} ${c.op} ${resolveValue(c.field, c.value)}`)
          .join(' AND ');
        const actStr = (rule.actions || [])
          .map(a => `set ${a.field} = ${resolveValue(a.field, a.value)}`)
          .join(', ');
        ruleLines.push(`• [${rule.stage || 'default'}] ID: ${rule.id}`);
        ruleLines.push(`  If: ${condStr || '(no conditions)'}`);
        ruleLines.push(`  Then: ${actStr || '(no actions)'}`);
      }
      return ruleLines.join('\n');
    }
    case 'save-memory': {
      const { content, category } = action.params;
      if (typeof content !== 'string')
        throw new Error('Memory content must be a string.');
      if (category !== undefined && typeof category !== 'string')
        throw new Error('Memory category must be a string.');
      await addMemory({
        content,
        category:
          (category as 'categorization' | 'preference' | 'context') ||
          'categorization',
        source: 'ai',
      });
      return 'Memory saved successfully.';
    }
    case 'delete-memory': {
      const { memoryId } = action.params;
      if (typeof memoryId !== 'string')
        throw new Error('Memory ID must be a string.');
      await deleteMemoryById(memoryId);
      return 'Memory deleted successfully.';
    }
    case 'list-memories': {
      const memories = await getMemories();
      if (memories.length === 0) return "You haven't saved any memories yet.";
      return `Here are your saved memories:\n${memories.map(m => `• [${m.category || 'General'}] ${m.content}`).join('\n')}`;
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
