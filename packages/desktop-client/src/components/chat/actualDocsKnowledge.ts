export const ACTUAL_DOCS_KNOWLEDGE = `
=== ACTUAL BUDGET KNOWLEDGE BASE ===
This is a condensed reference of Actual Budget's features and concepts from the official documentation (actualbudget.org/docs). Use this to give accurate, helpful guidance.

--- CORE PHILOSOPHY ---
Actual Budget uses envelope budgeting (also called zero-sum budgeting). Every dollar of income is assigned to a category — money can only be budgeted if you already have it. Categories act as virtual envelopes. If a category runs out, you move money from another category to cover it. The goal is a "To Budget" amount of $0 — every dollar has a job.

--- BUDGET WORKFLOW ---
1. Import transactions regularly and categorize them.
2. Check your budget. If you've overspent, move money from another category.
3. New income goes to "To Budget" — assign it to categories or hold for next month.
4. At month end, create next month's budget using last month's available income.
5. Leftover savings can go into a savings category.

--- HOW MONEY ROLLS OVER ---
- Income: Added to "Available Funds" immediately. Unbudgeted income rolls to next month.
- Overspending: If a category goes negative, by default it resets to 0 next month (the overspent amount is deducted from "To Budget"). You can enable "Rollover Overspending" on a category to carry the negative balance forward instead.
- Positive balances: Money left in categories rolls forward automatically.
- Hold for Next Month: You can set aside income to budget next month by using "Hold for next month" in the To Budget menu.

--- ACCOUNTS ---
Types:
- On Budget: Checking, savings, credit cards — money counts toward your budget.
- Off Budget: Investments (401k, IRA, HSA), loans, asset tracking — only for tracking, shows in net worth.
- Savings: Can be on or off budget. On budget is simpler (no need to categorize transfers between on-budget accounts).

Adding: Click "+ Add account" in sidebar. Enter name, balance, type (on/off budget).
Closing: Use account menu > Close Account. Must transfer remaining balance if non-zero.
Reconciliation: Compare your account balance with your bank. Click the checkmark icon next to the cleared balance. Enter the bank's balance. Actual highlights uncleared transactions to help find discrepancies. Reconcile regularly!

--- CATEGORIES ---
Categories belong to category groups. One income group always exists and cannot be deleted.
- Add: Hover over a group, click the down arrow > Add category.
- Add group: Scroll to bottom of budget, click "Add Group".
- Rename/Delete: Hover > down arrow > Rename or Delete.
- Merge: Delete a category and choose another to receive its balance and transactions.
- Hide: Categories not currently needed can be hidden (still affect budget). Unhide when needed.
- Category Notes: Click the note icon next to a category to add notes for context.
- Pinning: Pin categories to keep them at the top of their group.

--- TRANSACTIONS ---
Fields: date, account, payee, notes, category, payment/deposit amount.
- Add manually: Click "Add New" in account view.
- Split transactions: A single transaction can be split across multiple categories (e.g., a grocery trip that includes household items).
- Cleared/Uncleared: Toggle the cleared status to track which transactions have posted at your bank.
- Importing: Supports OFX, QFX, QIF, and CSV files. Actual detects duplicates automatically during import.

--- TRANSFERS ---
Transfers between on-budget accounts don't need a category — they just move money between accounts.
To create: Set the payee to the destination account name (shown with a transfer icon).
Matched transfers: When importing, Actual can auto-match transfers between accounts.
Between on-budget and off-budget: These DO require a category since money is entering/leaving the budget.

--- PAYEES ---
Payees describe transaction sources. Actual auto-creates payees from imported names.
- Rename: Click payee name in Payees page.
- Merge: Select multiple payees with similar names, click Merge. Cleans up ugly bank descriptions.
- Transfer payees: Special payees for account transfers. Found at bottom of Payees page.
- Rules: Each payee can have associated rules for automatic renaming and categorization.
- Favorites: Mark payees as favorites to appear at top of suggestions when entering transactions.

--- BULK EDITING ---
Select multiple transactions using checkboxes. Then use the toolbar to:
- Change category, payee, account, or date in bulk.
- Delete multiple transactions.
- Clear/unclear transactions.
- Set notes on multiple transactions.
Useful for cleaning up imports or recategorizing old transactions.

--- RULES ---
Rules automate transaction processing. When importing/syncing, transactions run through rules in order.
Structure: Conditions (left) → Actions (right). If all conditions match, actions execute.
Stages: Rules run in 3 stages: pre → default → post. Within each stage, rules auto-rank from least to most specific.
Condition types: is, is not, contains, does not contain, matches (regex), one of, not one of.
Condition fields: imported payee, payee, account, category, date, notes, amount, amount (inflow), amount (outflow).
- "imported payee" = raw text from bank. "payee" = Actual's internal payee.
Action fields: category, payee, notes, cleared, account, date, amount. Can also prepend/append to notes.

Automatic rules:
- Payee renaming: When you rename a payee, Actual asks if you want to auto-rename in the future. Creates a "pre" stage rule.
- Category learning: After categorizing a payee a few times, Actual auto-creates a rule to set the category. Created in "default" stage.
- Both can be disabled per-payee or globally via Payees > Category Learning Settings.

Rule editor as batch editor: Create a temporary rule to see matching transactions and apply bulk actions without actually saving the rule.

--- SCHEDULES ---
Schedules handle recurring or one-time anticipated transactions (bills, subscriptions, income).
Features:
- Set frequency: weekly, every 2 weeks, monthly (specific day), yearly, or custom.
- Approximate amounts: Use ~ for bills that vary slightly (e.g., utilities).
- Auto-enter: Transactions can be auto-entered on the scheduled date, or require manual approval.
- Link to existing transactions: When an imported transaction matches a schedule, Actual links them.
- Create from transactions: Select existing transactions and create a schedule from them.
- Upcoming display: Configure how far in advance scheduled transactions appear (1 day, 1 week, 1 month, end of month, custom).
- Schedules create backing rules to match and categorize transactions.

--- CREDIT CARDS ---
Credit cards are on-budget accounts with negative balances (representing debt owed).
Payment workflow:
1. Budget for expenses using normal categories (Food, Gas, etc.).
2. When you pay the credit card bill, create a transfer from checking to the credit card. No category needed.
3. The credit card balance shows how much you owe. The budget categories track what the spending was for.

Carrying debt: If you started with existing credit card debt:
1. Add the card with its current negative balance.
2. Create a "Credit Card Payment" category.
3. Budget money to that category each month for debt payoff.
4. Track the payment as a transfer, categorized to "Credit Card Payment".

Key insight: Don't budget in the credit card's "budgeted" column. Budget in the spending categories. The credit card is just the payment method.

--- RETURNS & REIMBURSEMENTS ---
Returns: Enter as a deposit (positive amount) in the same account and same category as the original purchase. This restores the budget to that category automatically.
Reimbursements: If someone will pay you back for an expense:
1. Create a "Reimbursements" category.
2. Categorize the expense as "Reimbursements".
3. When paid back, enter the deposit in "Reimbursements" category.
This keeps the reimbursable expense from affecting your regular budget categories.

--- REPORTS ---
Available reports:
- Net Worth: Track total assets minus liabilities over time. Includes all accounts (on and off budget).
- Cash Flow: Shows income vs expenses over time.
- Spending: Breakdown of spending by category for a selected period.
- Custom Reports: Create charts and graphs with custom filters and date ranges.
All reports can be filtered by accounts, categories, payees, and date ranges.

--- FILTERS ---
Transactions can be filtered by: date, account, payee, category, amount, notes, cleared status.
Multiple filters combine with AND logic. Filters work in account views and reports.
Saved filters: Save commonly used filter combinations for quick access.

--- MULTI-CURRENCY ---
Actual doesn't have built-in multi-currency support, but you can handle it with off-budget accounts.
Workaround: Create an off-budget account for each foreign currency. Track exchange rates manually when transferring.

--- JOINT ACCOUNTS ---
Strategies for couples/shared finances:
1. Single budget file: Both partners use the same budget. Simpler but less privacy.
2. Separate budgets with shared account: Each has their own file, with the joint account appearing in both.
3. Separate budgets with reimbursement: Track shared expenses and reimburse each other.

--- SYNCING ---
Actual stores data locally AND on your server. Works offline — syncs when internet is available.
End-to-end encryption available (optional). Server only passes encrypted changes.
Multiple devices sync automatically. Budget files can be managed (create, delete, download) from the server.
Bank syncing: GoCardless (EU/UK banks), SimpleFIN (US/Canadian banks), or community plugins.

--- TIPS & TRICKS ---
- Budget only money you have, not money you expect.
- Use "To Budget" to track unallocated funds — should be $0 ideally.
- Categories can serve as savings goals (e.g., "Vacation Fund").
- Split transactions when one purchase spans categories.
- Use notes on transactions for extra context.
- Reconcile accounts weekly for accuracy.
- Use the rule editor for powerful batch editing without creating permanent rules.
- Hidden categories still impact your budget — use them for seasonal expenses.
- Credit card spending is tracked through expense categories, not the card itself.
- Transfers between on-budget accounts never need categories.
- Off-budget accounts are for tracking only (investments, loans, assets).
`;
