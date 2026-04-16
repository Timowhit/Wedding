/**
 * @file budget.js
 * @description BudgetManager — add, filter, delete wedding expenses
 *              and track against a total budget.
 */

import { StorageManager, Toast, formatCurrency, escapeHtml, uid, markActiveNav } from './main.js';

/* ============================================================
   BudgetManager — manages expense list state and rendering
   ============================================================ */
class BudgetManager {
  /** Storage keys */
  static ITEMS_KEY = 'budgetItems';
  static LIMIT_KEY = 'budgetLimit';

  constructor() {
    this._items       = StorageManager.getList(BudgetManager.ITEMS_KEY);
    this._limit       = StorageManager.getValue(BudgetManager.LIMIT_KEY, 0);
    this._activeFilter = 'All';

    // DOM refs — form inputs
    this._nameInput    = document.getElementById('expense-name');
    this._catSelect    = document.getElementById('expense-category');
    this._amountInput  = document.getElementById('expense-amount');
    this._addBtn       = document.getElementById('add-expense-btn');

    // DOM refs — budget limit
    this._limitInput   = document.getElementById('budget-limit-input');
    this._saveLimitBtn = document.getElementById('save-limit-btn');

    // DOM refs — summary
    this._totalEl     = document.getElementById('budget-total-display');
    this._spentEl     = document.getElementById('budget-spent-display');
    this._remainEl    = document.getElementById('budget-remaining-display');
    this._pctLabel    = document.getElementById('budget-pct-label');
    this._progressBar = document.getElementById('budget-progress-bar');
    this._progressWrap = document.getElementById('budget-progress-wrap');

    // DOM refs — list
    this._list        = document.getElementById('expense-list');
    this._emptyState  = document.getElementById('budget-empty');
  }

  /** Boot: bind events, populate limit input, render. */
  init() {
    markActiveNav();
    this._bindEvents();
    if (this._limit) this._limitInput.value = this._limit;
    this._render();
  }

  /** Attach all event listeners. */
  _bindEvents() {
    // Add expense
    this._addBtn.addEventListener('click', () => this._addExpense());
    this._amountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._addExpense();
    });

    // Save limit
    this._saveLimitBtn.addEventListener('click', () => this._saveLimit());

    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this._activeFilter = tab.dataset.cat;
        this._render();
      });
    });
  }

  /** Validate and add a new expense item. */
  _addExpense() {
    const name   = this._nameInput.value.trim();
    const cat    = this._catSelect.value;
    const amount = parseFloat(this._amountInput.value);

    if (!name) {
      Toast.show('Please enter a description.', 'error');
      this._nameInput.focus();
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      Toast.show('Please enter a valid amount.', 'error');
      this._amountInput.focus();
      return;
    }

    /** @type {{id:string, name:string, category:string, amount:number, date:string}} */
    const item = {
      id:       uid(),
      name,
      category: cat,
      amount,
      date:     new Date().toLocaleDateString('en-US'),
    };

    this._items.push(item);
    this._persist();
    this._render();
    this._clearForm();
    Toast.show(`Added: ${name}`, 'success');
  }

  /** Save budget limit. */
  _saveLimit() {
    const val = parseFloat(this._limitInput.value);
    if (isNaN(val) || val < 0) {
      Toast.show('Enter a valid budget amount.', 'error');
      return;
    }
    this._limit = val;
    StorageManager.setValue(BudgetManager.LIMIT_KEY, val);
    this._render();
    Toast.show('Budget limit saved!', 'success');
  }

  /**
   * Remove an expense by id.
   * @param {string} id
   */
  _deleteItem(id) {
    this._items = this._items.filter((i) => i.id !== id);
    this._persist();
    this._render();
    Toast.show('Expense removed.');
  }

  /** Compute total amount spent. */
  _totalSpent() {
    return this._items.reduce((sum, i) => sum + i.amount, 0);
  }

  /** Persist current items array. */
  _persist() {
    StorageManager.setList(BudgetManager.ITEMS_KEY, this._items);
  }

  /** Clear the add-expense form fields. */
  _clearForm() {
    this._nameInput.value   = '';
    this._amountInput.value = '';
    this._nameInput.focus();
  }

  /** Re-render summary bars and filtered expense list. */
  _render() {
    const spent     = this._totalSpent();
    const remaining = this._limit - spent;
    const pct       = this._limit > 0 ? Math.min(Math.round((spent / this._limit) * 100), 100) : 0;

    // Summary boxes
    this._totalEl.textContent  = formatCurrency(this._limit);
    this._spentEl.textContent  = formatCurrency(spent);
    this._remainEl.textContent = formatCurrency(remaining);

    // Progress bar
    this._pctLabel.textContent      = `${pct}%`;
    this._progressBar.style.width   = `${pct}%`;
    this._progressWrap.setAttribute('aria-valuenow', pct);

    // Filter
    const filtered = this._activeFilter === 'All'
      ? this._items
      : this._items.filter((i) => i.category === this._activeFilter);

    // Empty state
    this._emptyState.hidden = filtered.length > 0;

    // List
    this._list.innerHTML = filtered.map((item) => `
      <li class="item-card" data-id="${escapeHtml(item.id)}">
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">
            <span class="item-badge badge-cat">${escapeHtml(item.category)}</span>
            &nbsp;${escapeHtml(item.date)}
          </div>
        </div>
        <strong style="color:var(--primary);white-space:nowrap;">${formatCurrency(item.amount)}</strong>
        <button class="btn btn-danger delete-btn" aria-label="Remove ${escapeHtml(item.name)}">✕</button>
      </li>
    `).join('');

    // Delegate delete events
    this._list.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.item-card').dataset.id;
        this._deleteItem(id);
      });
    });
  }
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const manager = new BudgetManager();
  manager.init();
});
