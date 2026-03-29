import { send } from 'loot-core/platform/client/connection';

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
  const { name, group_id } = params;
  if (typeof name !== 'string' || !name) throw new Error('Missing or invalid "name" parameter.');
  if (typeof group_id !== 'string' || !group_id) throw new Error('Missing or invalid "group_id" parameter.');
  return { name, group_id };
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
      });
      return 'Transfer completed successfully.';
    }
    case 'create-category': {
      const validated = validateCreateCategory(action.params);
      await send('api/category-create', {
        category: { name: validated.name, group_id: validated.group_id, hidden: false },
      });
      return `Category "${validated.name}" created successfully.`;
    }
    case 'create-account': {
      const validated = validateCreateAccount(action.params);
      await send('account-create', {
        name: validated.name,
        balance: validated.balance,
        offBudget: validated.offBudget,
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
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
