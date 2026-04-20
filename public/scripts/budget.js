/**
 * @file scripts/budget.js
 * @description BudgetManager — API-backed expense tracking.
 */

import api, { Auth } from "./api.js";
import {
  initNav,
  Toast,
  formatCurrency,
  escapeHtml,
  showLoading,
  showError,
} from "./main.js";

Auth.requireAuth();

class BudgetManager {
  constructor() {
    this._activeFilter = "All";

    // Form
    this._nameInput = document.getElementById("expense-name");
    this._catSelect = document.getElementById("expense-category");
    this._amountInput = document.getElementById("expense-amount");
    this._addBtn = document.getElementById("add-expense-btn");
    this._limitInput = document.getElementById("budget-limit-input");
    this._saveLimitBtn = document.getElementById("save-limit-btn");

    // Summary
    this._totalEl = document.getElementById("budget-total-display");
    this._spentEl = document.getElementById("budget-spent-display");
    this._remainEl = document.getElementById("budget-remaining-display");
    this._pctLabel = document.getElementById("budget-pct-label");
    this._progressBar = document.getElementById("budget-progress-bar");
    this._progressWrap = document.getElementById("budget-progress-wrap");

    // List
    this._list = document.getElementById("expense-list");
    this._emptyState = document.getElementById("budget-empty");
  }

  async init() {
    initNav();
    this._bindEvents();
    await this._load();
  }

  _bindEvents() {
    this._addBtn.addEventListener("click", () => this._addExpense());
    this._amountInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {this._addExpense();}
    });
    this._saveLimitBtn.addEventListener("click", () => this._saveLimit());

    document.querySelectorAll(".filter-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".filter-tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this._activeFilter = tab.dataset.cat;
        this._loadItems();
      });
    });
  }

  /* ── Load summary + items ─────────────────────────────── */
  async _load() {
    await Promise.all([this._loadSummary(), this._loadItems()]);
  }

  async _loadSummary() {
    try {
      const { data } = await api.get("/budget/summary");
      this._renderSummary(data);
      this._limitInput.value = data.limit > 0 ? data.limit : "";
    } catch (err) {
      Toast.show("Could not load budget summary.", "error");
    }
  }

  async _loadItems() {
    const query =
      this._activeFilter !== "All" ? { category: this._activeFilter } : {};
    showLoading(this._list, "Loading expenses…");
    this._emptyState.hidden = true;

    try {
      const { data } = await api.get("/budget", query);
      this._renderList(data.items);
    } catch (err) {
      showError(this._list, "Could not load expenses.");
    }
  }

  /* ── Add expense ──────────────────────────────────────── */
  async _addExpense() {
    const name = this._nameInput.value.trim();
    const cat = this._catSelect.value;
    const amount = parseFloat(this._amountInput.value);

    if (!name) {return Toast.show("Please enter a description.", "error");}
    if (isNaN(amount) || amount <= 0)
      {return Toast.show("Please enter a valid amount.", "error");}

    this._addBtn.disabled = true;
    try {
      await api.post("/budget", { name, category: cat, amount });
      this._nameInput.value = "";
      this._amountInput.value = "";
      this._nameInput.focus();
      Toast.show(`Added: ${name}`, "success");
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not add expense.", "error");
    } finally {
      this._addBtn.disabled = false;
    }
  }

  /* ── Save limit ───────────────────────────────────────── */
  async _saveLimit() {
    const val = parseFloat(this._limitInput.value);
    if (isNaN(val) || val < 0)
      {return Toast.show("Enter a valid budget amount.", "error");}

    try {
      await api.put("/budget/limit", { total: val });
      await this._loadSummary();
      Toast.show("Budget limit saved!", "success");
    } catch (err) {
      Toast.show(err.message || "Could not save limit.", "error");
    }
  }

  /* ── Delete ───────────────────────────────────────────── */
  async _deleteItem(id) {
    try {
      await api.delete(`/budget/${id}`);
      Toast.show("Expense removed.");
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not delete expense.", "error");
    }
  }

  /* ── Render ───────────────────────────────────────────── */
  _renderSummary({ limit, spent, remaining, pct }) {
    this._totalEl.textContent = formatCurrency(limit);
    this._spentEl.textContent = formatCurrency(spent);
    this._remainEl.textContent = formatCurrency(remaining);
    this._pctLabel.textContent = `${pct}%`;
    this._progressBar.style.width = `${pct}%`;
    this._progressWrap.setAttribute("aria-valuenow", pct);
  }

  _renderList(items) {
    this._emptyState.hidden = items.length > 0;

    if (!items.length) {
      this._list.innerHTML = "";
      return;
    }

    this._list.innerHTML = items
      .map(
        (item) => `
      <li class="item-card" data-id="${escapeHtml(item.id)}">
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">
            <span class="item-badge badge-cat">${escapeHtml(item.category)}</span>
            &nbsp;${escapeHtml(new Date(item.created_at).toLocaleDateString("en-US"))}
          </div>
        </div>
        <strong style="color:var(--primary);white-space:nowrap;">
          ${formatCurrency(item.amount)}
        </strong>
        <button class="btn btn-danger delete-btn"
                aria-label="Remove ${escapeHtml(item.name)}">✕</button>
      </li>
    `,
      )
      .join("");

    this._list.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        this._deleteItem(btn.closest(".item-card").dataset.id),
      );
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new BudgetManager().init();
});
