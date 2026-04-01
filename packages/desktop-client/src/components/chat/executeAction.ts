import { send } from 'loot-core/platform/client/connection';

import { createGoal, deleteGoal, updateGoal } from './goalStorage';
import { addMemory, deleteMemory as deleteMemoryById, getMemories } from './memoryStorage';
import type { BudgetAction } from './types';

function validateSetBudgetAmount(params: Record<string, unknown>): {
  month: string;
  categoryId: string;
  amount: number;
} {
  const { month, categoryId, amount } = params;
  if (typeof month !== 'string' || !month) throw new Error('Missing or invalid "month" parameter.');
  if (typeof categoryId !== 'string' || !categoryId) throw new Error('Missing or invalid "categoryId" parameter.');
  if (typeof amount !== 'number') throw new Error('Missing or invalid "amount" parameter.');
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
  if (typeof accountId !== 'string' || !accountId) throw new Error('Missing or invalid "accountId" parameter.');
  if (typeof date !== 'string' || !date) throw new Error('Missing or invalid "date" parameter.');
  if (typeof amount !== 'number') throw new Error('Missing or invalid "amount" parameter.');
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
} {
  const { transactionId, date, amount, payee_name, category_id, notes } = params;
  if (typeof transactionId !== 'string' || !transactionId) throw new Error('Missing or invalid "transactionId" parameter.');
  return {
    transactionId,
    date: typeof date === 'string' ? date : undefined,
    amount: typeof amount === 'number' ? amount : undefined,
    payee_name: typeof payee_name === 'string' ? payee_name : undefined,
    category_id: typeof category_id === 'string' ? category_id : undefined,
    notes: typeof notes === 'string' ? notes : undefined,
  };
}

function validateDeleteTransaction(params: Record<string, unknown>): {
  transactionId: string;
} {
  const { transactionId } = params;
  if (typeof transactionId !== 'string' || !transactionId) throw new Error('Missing or invalid "transactionId" parameter.');
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
  if (typeof fromAccountId !== 'string' || !fromAccountId) throw new Error('Missing or invalid "fromAccountId" parameter.');
  if (typeof toAccountId !== 'string' || !toAccountId) throw new Error('Missing or invalid "toAccountId" parameter.');
  if (typeof amount !== 'number') throw new Error('Missing or invalid "amount" parameter.');
  if (typeof date !== 'string' || !date) throw new Error('Missing or invalid "date" parameter.');
  if (fromAccountId === toAccountId) throw new Error('Source and destination accounts must be different.');
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
  if (typeof name !== 'string' || !name) throw new Error('Missing or invalid "name" parameter.');
  const candidates = [group_id, groupId, group_name, groupName];
  const gid = candidates.find(c => typeof c === 'string' && c.trim().length > 0);
  if (!gid) throw new Error('Missing or invalid "group_id" parameter. Please specify which category group to add this category to.');
  return { name, group_id: (gid as string).trim() };
}

function validateCreateAccount(params: Record<string, unknown>): {
  name: string;
  balance: number;
  offBudget: boolean;
} {
  const { name, balance, offBudget } = params;
  if (typeof name !== 'string' || !name) throw new Error('Missing or invalid "name" parameter.');
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
  if (typeof accountId !== 'string' || !accountId) throw new Error('Missing or invalid "accountId" parameter.');
  return {
    accountId,
    transferAccountId: typeof transferAccountId === 'string' ? transferAccountId : undefined,
  };
}

function validateReopenAccount(params: Record<string, unknown>): {
  accountId: string;
} {
  const { accountId } = params;
  if (typeof accountId !== 'string' || !accountId) throw new Error('Missing or invalid "accountId" parameter.');
  return { accountId };
}

function validateRenameCategory(params: Record<string, unknown>): {
  categoryId: string;
  newName: string;
  oldName: string;
} {
  const { categoryId, newName, oldName } = params;
  if (typeof categoryId !== 'string' || !categoryId) throw new Error('Missing or invalid "categoryId" parameter.');
  if (typeof newName !== 'string' || !newName) throw new Error('Missing or invalid "newName" parameter.');
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
  const { categoryId, categoryName, transferCategoryId, transactionCount } = params;
  if (typeof categoryId !== 'string' || !categoryId) throw new Error('Missing or invalid "categoryId" parameter.');
  return {
    categoryId,
    categoryName: typeof categoryName === 'string' ? categoryName : '',
    transferCategoryId: typeof transferCategoryId === 'string' ? transferCategoryId : undefined,
    transactionCount: typeof transactionCount === 'number' ? transactionCount : 0,
  };
}

function validateCreateCategoryGroup(params: Record<string, unknown>): {
  name: string;
  categories?: Array<{ name: string }>;
} {
  const { name, categories } = params;
  if (typeof name !== 'string' || !name) throw new Error('Missing or invalid "name" parameter.');
  const cats = Array.isArray(categories)
    ? categories.filter((c): c is { name: string } => typeof c === 'object' && c !== null && typeof (c as Record<string, unknown>).name === 'string')
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
  if (typeof categoryId !== 'string' || !categoryId) throw new Error('Missing or invalid "categoryId" parameter.');
  if (typeof groupId !== 'string' || !groupId) throw new Error('Missing or invalid "groupId" parameter.');
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
  if (typeof groupId !== 'string' || !groupId) throw new Error('Missing or invalid "groupId" parameter.');
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
  if (typeof payeeId !== 'string' || !payeeId) throw new Error('Missing or invalid "payeeId" parameter.');
  if (typeof newName !== 'string' || !newName) throw new Error('Missing or invalid "newName" parameter.');
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
  if (typeof targetId !== 'string' || !targetId) throw new Error('Missing or invalid "targetId" parameter.');
  if (!Array.isArray(mergeIds)) throw new Error('Missing or invalid "mergeIds" parameter.');
  const filteredIds = mergeIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (filteredIds.length === 0) throw new Error('"mergeIds" must contain at least one valid payee ID.');
  return {
    targetId,
    targetName: typeof targetName === 'string' ? targetName : '',
    mergeIds: filteredIds,
    mergeNames: Array.isArray(mergeNames) ? mergeNames.filter((n): n is string => typeof n === 'string') : [],
  };
}

function validateCopyPreviousMonth(params: Record<string, unknown>): {
  month: string;
} {
  const { month } = params;
  if (typeof month !== 'string' || !month) throw new Error('Missing or invalid "month" parameter.');
  return { month };
}

function validateSetBudgetAverage(params: Record<string, unknown>): {
  month: string;
  numMonths: number;
} {
  const { month, numMonths } = params;
  if (typeof month !== 'string' || !month) throw new Error('Missing or invalid "month" parameter.');
  const n = typeof numMonths === 'number' ? numMonths : 3;
  if (![3, 6, 12].includes(n)) throw new Error('"numMonths" must be 3, 6, or 12.');
  return { month, numMonths: n };
}

function validateBulkSetBudget(params: Record<string, unknown>): {
  month: string;
  budgets: Array<{ categoryId: string; categoryName: string; amount: number }>;
} {
  const { month, budgets } = params;
  if (typeof month !== 'string' || !month) throw new Error('Missing or invalid "month" parameter.');
  if (!Array.isArray(budgets) || budgets.length === 0) throw new Error('Missing or invalid "budgets" parameter.');
  const validated = budgets.map((b, i) => {
    const entry = b as Record<string, unknown>;
    if (typeof entry.categoryId !== 'string' || !entry.categoryId) throw new Error(`Missing "categoryId" in budget entry ${i}.`);
    if (typeof entry.amount !== 'number') throw new Error(`Missing "amount" in budget entry ${i}.`);
    return {
      categoryId: entry.categoryId as string,
      categoryName: typeof entry.categoryName === 'string' ? entry.categoryName : '',
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
  const { month, amount, fromCategoryId, toCategoryId, fromCategoryName, toCategoryName } = params;
  if (typeof month !== 'string' || !month) throw new Error('Missing or invalid "month" parameter.');
  if (typeof amount !== 'number') throw new Error('Missing or invalid "amount" parameter.');
  if (typeof fromCategoryId !== 'string' || !fromCategoryId) throw new Error('Missing or invalid "fromCategoryId" parameter.');
  if (typeof toCategoryId !== 'string' || !toCategoryId) throw new Error('Missing or invalid "toCategoryId" parameter.');
  return {
    month,
    amount,
    fromCategoryId,
    toCategoryId,
    fromCategoryName: typeof fromCategoryName === 'string' ? fromCategoryName : '',
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
  const { name, targetAmount, targetDate, associatedAccountIds, associatedCategoryIds } = params;
  if (typeof name !== 'string' || !name) throw new Error('Missing or invalid "name" parameter.');
  if (typeof targetAmount !== 'number' || !isFinite(targetAmount) || targetAmount <= 0) throw new Error('"targetAmount" must be a positive number (in cents).');
  if (typeof targetDate !== 'string' || !validateDateString(targetDate)) throw new Error('"targetDate" must be a valid date in YYYY-MM-DD format.');
  return {
    name,
    targetAmount: Math.round(targetAmount),
    targetDate,
    associatedAccountIds: Array.isArray(associatedAccountIds) ? associatedAccountIds.filter((id): id is string => typeof id === 'string') : undefined,
    associatedCategoryIds: Array.isArray(associatedCategoryIds) ? associatedCategoryIds.filter((id): id is string => typeof id === 'string') : undefined,
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
  const { goalId, name, targetAmount, targetDate, associatedAccountIds, associatedCategoryIds } = params;
  if (typeof goalId !== 'string' || !goalId) throw new Error('Missing or invalid "goalId" parameter.');
  if (typeof targetAmount === 'number' && (!isFinite(targetAmount) || targetAmount <= 0)) throw new Error('"targetAmount" must be a positive number (in cents).');
  if (typeof targetDate === 'string' && !validateDateString(targetDate)) throw new Error('"targetDate" must be a valid date in YYYY-MM-DD format.');
  return {
    goalId,
    name: typeof name === 'string' && name ? name : undefined,
    targetAmount: typeof targetAmount === 'number' ? Math.round(targetAmount) : undefined,
    targetDate: typeof targetDate === 'string' ? targetDate : undefined,
    associatedAccountIds: Array.isArray(associatedAccountIds) ? associatedAccountIds.filter((id): id is string => typeof id === 'string') : undefined,
    associatedCategoryIds: Array.isArray(associatedCategoryIds) ? associatedCategoryIds.filter((id): id is string => typeof id === 'string') : undefined,
  };
}

function validateDeleteGoal(params: Record<string, unknown>): {
  goalId: string;
  goalName: string;
} {
  const { goalId, goalName } = params;
  if (typeof goalId !== 'string' || !goalId) throw new Error('Missing or invalid "goalId" parameter.');
  return {
    goalId,
    goalName: typeof goalName === 'string' ? goalName : '',
  };
}

function formatCents(amount: number): string {
  return '$' + (amount / 100).toFixed(2);
}

export function formatActionDetails(action: BudgetAction): string[] {
  const lines: string[] = [];
  const p = action.params;

  switch (action.type) {
    case 'set-budget-amount':
      lines.push(`Type: Set Budget Amount`);
      if (p.month) lines.push(`Month: ${p.month}`);
      if (p.categoryId) lines.push(`Category ID: ${p.categoryId}`);
      if (typeof p.amount === 'number') lines.push(`Amount: ${formatCents(p.amount as number)}`);
      break;
    case 'add-transaction':
      lines.push(`Type: Add Transaction`);
      if (p.accountId) lines.push(`Account ID: ${p.accountId}`);
      if (p.date) lines.push(`Date: ${p.date}`);
      if (typeof p.amount === 'number') lines.push(`Amount: ${formatCents(p.amount as number)}`);
      if (p.payee_name) lines.push(`Payee: ${p.payee_name}`);
      if (p.category_id) lines.push(`Category ID: ${p.category_id}`);
      if (p.notes) lines.push(`Notes: ${p.notes}`);
      break;
    case 'update-transaction':
      lines.push(`Type: Update Transaction`);
      lines.push(`Transaction ID: ${p.transactionId}`);
      if (p.date) lines.push(`New Date: ${p.date}`);
      if (typeof p.amount === 'number') lines.push(`New Amount: ${formatCents(p.amount as number)}`);
      if (p.payee_name) lines.push(`New Payee: ${p.payee_name}`);
      if (p.category_id) lines.push(`New Category ID: ${p.category_id}`);
      if (p.notes !== undefined) lines.push(`New Notes: ${p.notes || '(cleared)'}`);
      break;
    case 'delete-transaction':
      lines.push(`Type: Delete Transaction`);
      lines.push(`Transaction ID: ${p.transactionId}`);
      break;
    case 'transfer-between-accounts':
      lines.push(`Type: Transfer Between Accounts`);
      lines.push(`From Account: ${p.fromAccountId}`);
      lines.push(`To Account: ${p.toAccountId}`);
      if (typeof p.amount === 'number') lines.push(`Amount: ${formatCents(p.amount as number)}`);
      if (p.date) lines.push(`Date: ${p.date}`);
      if (p.notes) lines.push(`Notes: ${p.notes}`);
      break;
    case 'create-category':
      lines.push(`Type: Create Category`);
      if (p.name) lines.push(`Name: ${p.name}`);
      if (p.group_id) lines.push(`Group ID: ${p.group_id}`);
      break;
    case 'create-account':
      lines.push(`Type: Create Account`);
      if (p.name) lines.push(`Name: ${p.name}`);
      if (typeof p.balance === 'number') lines.push(`Balance: ${formatCents(p.balance as number)}`);
      if (typeof p.offBudget === 'boolean') lines.push(`Off Budget: ${p.offBudget ? 'Yes' : 'No'}`);
      break;
    case 'rename-category':
      lines.push(`Type: Rename Category`);
      if (p.oldName) lines.push(`From: ${p.oldName}`);
      if (p.newName) lines.push(`To: ${p.newName}`);
      break;
    case 'delete-category':
      lines.push(`Type: Delete Category`);
      if (p.categoryName) lines.push(`Category: ${p.categoryName}`);
      if (typeof p.transactionCount === 'number' && (p.transactionCount as number) > 0) {
        lines.push(`Warning: ${p.transactionCount} transaction(s) use this category`);
      }
      if (p.transferCategoryId) lines.push(`Transfer to: ${p.transferCategoryId}`);
      break;
    case 'create-category-group':
      lines.push(`Type: Create Category Group`);
      if (p.name) lines.push(`Group Name: ${p.name}`);
      if (Array.isArray(p.categories) && (p.categories as Array<{ name: string }>).length > 0) {
        lines.push(`Categories: ${(p.categories as Array<{ name: string }>).map(c => c.name).join(', ')}`);
      }
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
    case 'reorganize-categories': {
      lines.push(`Type: Reorganize Categories`);
      const newGroupNames: string[] = [];
      const moveLines: string[] = [];
      if (Array.isArray(p.newGroups)) {
        for (const g of p.newGroups as Array<{ name: string; categories?: string[] }>) {
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
      if (Array.isArray(p.deleteOldGroups) && (p.deleteOldGroups as string[]).length > 0) {
        lines.push(`Delete old groups: ${(p.deleteOldGroups as string[]).join(', ')}`);
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
      if (Array.isArray(p.mergeNames) && (p.mergeNames as string[]).length > 0) {
        lines.push(`Merging: ${(p.mergeNames as string[]).join(', ')}`);
      }
      break;
    case 'copy-previous-month':
      lines.push(`Type: Copy Previous Month Budget`);
      if (p.month) lines.push(`Copy to: ${p.month}`);
      break;
    case 'set-budget-average':
      lines.push(`Type: Set Budget from Average`);
      if (p.month) lines.push(`Month: ${p.month}`);
      if (typeof p.numMonths === 'number') lines.push(`Average of last: ${p.numMonths} months`);
      break;
    case 'bulk-set-budget':
      lines.push(`Type: Bulk Set Budget`);
      if (p.month) lines.push(`Month: ${p.month}`);
      if (Array.isArray(p.budgets)) {
        for (const b of p.budgets as Array<{ categoryName: string; amount: number }>) {
          lines.push(`  ${b.categoryName || 'Unknown'}: ${formatCents(b.amount)}`);
        }
      }
      break;
    case 'transfer-budget':
      lines.push(`Type: Transfer Budget`);
      if (p.month) lines.push(`Month: ${p.month}`);
      if (p.fromCategoryName) lines.push(`From: ${p.fromCategoryName}`);
      if (p.toCategoryName) lines.push(`To: ${p.toCategoryName}`);
      if (typeof p.amount === 'number') lines.push(`Amount: ${formatCents(p.amount as number)}`);
      break;
    case 'query':
      lines.push(`Type: Data Query`);
      lines.push(`Query: ${action.description}`);
      break;
    case 'close-account':
      lines.push(`Type: Close Account`);
      lines.push(`Account ID: ${p.accountId}`);
      if (p.transferAccountId) lines.push(`Transfer Balance To: ${p.transferAccountId}`);
      break;
    case 'reopen-account':
      lines.push(`Type: Reopen Account`);
      lines.push(`Account ID: ${p.accountId}`);
      break;
    case 'create-goal':
      lines.push(`Type: Create Savings Goal`);
      if (p.name) lines.push(`Name: ${p.name}`);
      if (typeof p.targetAmount === 'number') lines.push(`Target: ${formatCents(p.targetAmount as number)}`);
      if (p.targetDate) lines.push(`Target Date: ${p.targetDate}`);
      break;
    case 'update-goal':
      lines.push(`Type: Update Savings Goal`);
      if (p.goalId) lines.push(`Goal ID: ${p.goalId}`);
      if (p.name) lines.push(`New Name: ${p.name}`);
      if (typeof p.targetAmount === 'number') lines.push(`New Target: ${formatCents(p.targetAmount as number)}`);
      if (p.targetDate) lines.push(`New Target Date: ${p.targetDate}`);
      break;
    case 'delete-goal':
      lines.push(`Type: Delete Savings Goal`);
      if (p.goalName) lines.push(`Goal: ${p.goalName}`);
      break;
    case 'save-memory':
      lines.push(`Type: Save Memory`);
      if (p.content) lines.push(`Memory: ${p.content}`);
      if (p.category) lines.push(`Category: ${p.category}`);
      break;
    case 'delete-memory':
      lines.push(`Type: Delete Memory`);
      if (p.memoryId) lines.push(`Memory ID: ${p.memoryId}`);
      break;
    case 'list-memories':
      lines.push(`Type: List Memories`);
      break;
  }

  return lines;
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
      const updateFields: { id: string; date?: string; amount?: number; category?: string; notes?: string; payee?: string } = { id: validated.transactionId };
      if (validated.date !== undefined) updateFields.date = validated.date;
      if (validated.amount !== undefined) updateFields.amount = validated.amount;
      if (validated.category_id !== undefined) updateFields.category = validated.category_id;
      if (validated.notes !== undefined) updateFields.notes = validated.notes;
      if (validated.payee_name !== undefined) {
        const allPayees = await send('payees-get') as Array<{ id: string; name: string }>;
        const matchedPayee = allPayees.find(p => p.name.toLowerCase() === validated.payee_name!.toLowerCase());
        if (matchedPayee) {
          updateFields.payee = matchedPayee.id;
        } else {
          const newPayeeId = await send('payee-create', { name: validated.payee_name }) as string;
          updateFields.payee = newPayeeId;
        }
      }
      await send('transaction-update', updateFields as Parameters<typeof send<'transaction-update'>>[1]);
      return 'Transaction updated successfully.';
    }
    case 'delete-transaction': {
      const validated = validateDeleteTransaction(action.params);
      await send('transaction-delete', { id: validated.transactionId });
      return 'Transaction deleted successfully.';
    }
    case 'transfer-between-accounts': {
      const validated = validateTransferBetweenAccounts(action.params);
      const allPayees = await send('payees-get') as Array<{ id: string; transfer_acct?: string }>;
      const transferPayee = allPayees.find(p => p.transfer_acct === validated.toAccountId);
      if (!transferPayee) throw new Error('Could not find transfer payee for the destination account.');
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

      const allGroups = await send('api/category-groups-get') as Array<{ id: string; name: string; is_income?: boolean; hidden?: boolean }>;

      const groupExists = allGroups.some(g => g.id === resolvedGroupId);
      if (!groupExists) {
        const byName = allGroups.find(g => g.name.toLowerCase() === resolvedGroupId.toLowerCase());
        if (byName) {
          resolvedGroupId = byName.id;
        } else {
          const groupNames = allGroups.map(g => g.name).join(', ');
          throw new Error(
            `Could not find category group "${resolvedGroupId}". ` +
            (groupNames ? `Available groups: ${groupNames}. Please specify which group to add the category to.` : 'No category groups exist. Please create a category group first.')
          );
        }
      }

      await send('api/category-create', {
        category: { name: validated.name, group_id: resolvedGroupId, hidden: false },
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
      const allCategories = await send('api/categories-get', { grouped: false });
      const remainingCategories = (allCategories as Array<{ group_id?: string }>).filter(
        c => c.group_id === validated.groupId,
      );
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
      const goal = createGoal(validated);
      return `Savings goal "${goal.name}" created successfully. Target: ${formatCents(goal.targetAmount)} by ${goal.targetDate}.`;
    }
    case 'update-goal': {
      const validated = validateUpdateGoal(action.params);
      const updates: Record<string, unknown> = {};
      if (validated.name !== undefined) updates.name = validated.name;
      if (validated.targetAmount !== undefined) updates.targetAmount = validated.targetAmount;
      if (validated.targetDate !== undefined) updates.targetDate = validated.targetDate;
      if (validated.associatedAccountIds !== undefined) updates.associatedAccountIds = validated.associatedAccountIds;
      if (validated.associatedCategoryIds !== undefined) updates.associatedCategoryIds = validated.associatedCategoryIds;
      const updated = updateGoal(validated.goalId, updates);
      if (!updated) throw new Error('Goal not found.');
      return `Savings goal "${updated.name}" updated successfully.`;
    }
    case 'delete-goal': {
      const validated = validateDeleteGoal(action.params);
      const deleted = deleteGoal(validated.goalId);
      if (!deleted) throw new Error('Goal not found.');
      return `Savings goal "${validated.goalName}" deleted successfully.`;
    }
    case 'reorganize-categories': {
      const newGroups = action.params.newGroups;
      const deleteOldGroups = action.params.deleteOldGroups;

      if (!Array.isArray(newGroups) || newGroups.length === 0) {
        throw new Error('reorganize-categories requires a non-empty newGroups array.');
      }
      for (let i = 0; i < newGroups.length; i++) {
        const g = newGroups[i] as { name?: unknown; categories?: unknown };
        if (!g || typeof g.name !== 'string' || !g.name.trim()) {
          throw new Error(`newGroups[${i}] must have a non-empty string "name".`);
        }
        if (g.categories !== undefined && !Array.isArray(g.categories)) {
          throw new Error(`newGroups[${i}].categories must be an array of category name strings.`);
        }
        if (Array.isArray(g.categories)) {
          for (let j = 0; j < (g.categories as unknown[]).length; j++) {
            if (typeof (g.categories as unknown[])[j] !== 'string') {
              throw new Error(`newGroups[${i}].categories[${j}] must be a string.`);
            }
          }
        }
      }
      if (deleteOldGroups !== undefined && !Array.isArray(deleteOldGroups)) {
        throw new Error('deleteOldGroups must be an array of group name strings.');
      }

      const typedNewGroups = newGroups as Array<{ name: string; categories?: string[] }>;
      const typedDeleteOldGroups = deleteOldGroups as string[] | undefined;

      const allCategories = await send('api/categories-get', { grouped: false }) as Array<{ id: string; name: string; group_id?: string }>;
      const groupLookup = new Map<string, string>();
      const existingGroups = await send('api/categories-get', { grouped: true }) as Array<{ id: string; name: string }>;
      for (const g of existingGroups) {
        groupLookup.set(g.name.toLowerCase(), g.id);
      }

      const catsByName = new Map<string, Array<{ id: string; name: string }>>();
      for (const c of allCategories) {
        const key = c.name.toLowerCase();
        if (!catsByName.has(key)) catsByName.set(key, []);
        catsByName.get(key)!.push(c);
      }

      const summary: string[] = [];

      for (const group of typedNewGroups) {
        const existingGroupId = groupLookup.get(group.name.toLowerCase());
        let groupId: string;

        if (existingGroupId) {
          groupId = existingGroupId;
        } else {
          groupId = await send('api/category-group-create', {
            group: { name: group.name },
          }) as unknown as string;
          groupLookup.set(group.name.toLowerCase(), groupId);
          summary.push(`Created group "${group.name}"`);
        }

        if (Array.isArray(group.categories)) {
          for (const catName of group.categories) {
            const matches = catsByName.get(catName.toLowerCase());
            if (!matches || matches.length === 0) {
              summary.push(`Warning: category "${catName}" not found, skipped`);
              continue;
            }
            if (matches.length > 1) {
              summary.push(`Warning: multiple categories named "${catName}" found, skipped (ambiguous)`);
              continue;
            }
            const cat = matches[0];
            await send('api/category-update', {
              id: cat.id,
              fields: { group_id: groupId },
            });
            summary.push(`Moved "${cat.name}" → "${group.name}"`);
          }
        }
      }

      if (Array.isArray(typedDeleteOldGroups) && typedDeleteOldGroups.length > 0) {
        const refreshedGroups = await send('api/categories-get', { grouped: true }) as Array<{ id: string; name: string; categories?: Array<{ id: string; name: string; hidden?: boolean }> }>;
        for (const groupName of typedDeleteOldGroups) {
          const matches = refreshedGroups.filter(g => g.name.toLowerCase() === groupName.toLowerCase());
          if (matches.length === 0) {
            summary.push(`Warning: group "${groupName}" not found, skipped deletion`);
            continue;
          }
          if (matches.length > 1) {
            summary.push(`Warning: multiple groups named "${groupName}" found, skipped deletion (ambiguous)`);
            continue;
          }
          const grp = matches[0];
          const visibleCats = (grp.categories || []).filter(c => !c.hidden);
          if (visibleCats.length > 0) {
            summary.push(`Warning: group "${groupName}" still has ${visibleCats.length} categories, skipped deletion`);
            continue;
          }
          await send('api/category-group-delete', { id: grp.id });
          summary.push(`Deleted old group "${groupName}"`);
        }
      }

      return `Reorganization complete:\n${summary.join('\n')}`;
    }
    case 'save-memory': {
      const content = action.params.content;
      const category = action.params.category;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('Missing or invalid "content" parameter for save-memory.');
      }
      const validCategories = ['categorization', 'preference', 'context'];
      const cat = typeof category === 'string' && validCategories.includes(category)
        ? (category as 'categorization' | 'preference' | 'context')
        : 'preference';
      const memory = addMemory({ content: content.trim(), category: cat, source: 'ai' });
      return `Memory saved: "${memory.content}"`;
    }
    case 'delete-memory': {
      const memoryId = action.params.memoryId;
      if (typeof memoryId !== 'string' || !memoryId) {
        throw new Error('Missing or invalid "memoryId" parameter for delete-memory.');
      }
      const deleted = deleteMemoryById(memoryId);
      if (!deleted) throw new Error('Memory not found.');
      return 'Memory deleted successfully.';
    }
    case 'list-memories': {
      const allMemories = getMemories();
      if (allMemories.length === 0) {
        return 'No memories saved yet. You can teach me preferences by telling me things like "remember that Starbucks should be Dining Out".';
      }
      const lines: string[] = [`You have ${allMemories.length} saved memor${allMemories.length === 1 ? 'y' : 'ies'}:\n`];
      for (const m of allMemories) {
        lines.push(`- [${m.category}] ${m.content} (id: ${m.id}, ${m.source === 'ai' ? 'via AI' : 'manual'})`);
      }
      return lines.join('\n');
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
