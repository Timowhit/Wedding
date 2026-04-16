/**
 * @file dashboard.js
 * @description Dashboard controller: manages wedding countdown timer
 *              and pulls summary stats from other modules' localStorage data.
 */

import { StorageManager, formatCurrency, markActiveNav } from './main.js';

/* ============================================================
   DashboardController — orchestrates the dashboard view
   ============================================================ */
class DashboardController {
  constructor() {
    this._timerInterval = null;

    // DOM refs
    this._countdownEl   = document.getElementById('countdown-number');
    this._dateLabelEl   = document.getElementById('countdown-date-label');
    this._dateInput     = document.getElementById('wedding-date-input');
    this._setDateBtn    = document.getElementById('set-date-btn');

    // Stat refs
    this._statBudget    = document.getElementById('stat-budget');
    this._statGuests    = document.getElementById('stat-guests');
    this._statTasks     = document.getElementById('stat-tasks');
    this._statVendors   = document.getElementById('stat-vendors');
  }

  /** Boot the dashboard. */
  init() {
    markActiveNav();
    this._bindEvents();
    this._loadSavedDate();
    this._renderStats();
  }

  /** Attach UI event listeners. */
  _bindEvents() {
    this._setDateBtn.addEventListener('click', () => this._saveDate());
    this._dateInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._saveDate();
    });
  }

  /** Restore persisted wedding date and start timer. */
  _loadSavedDate() {
    const saved = StorageManager.getValue('weddingDate');
    if (saved) {
      this._dateInput.value = saved;
      this._startCountdown(this._parseLocalDate(saved));
    }
  }

  /**
   * Parse a YYYY-MM-DD string as a local-timezone Date (not UTC).
   * Using new Date('YYYY-MM-DD') parses as UTC midnight, which shifts
   * the displayed date backward in timezones behind UTC (e.g. UTC-7).
   * @param {string} dateStr  format: YYYY-MM-DD
   * @returns {Date}
   */
  _parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  }

  /** Persist and activate a new wedding date. */
  _saveDate() {
    const val = this._dateInput.value;
    if (!val) return;
    StorageManager.setValue('weddingDate', val);
    this._startCountdown(this._parseLocalDate(val));
  }

  /**
   * Start (or restart) the countdown interval to a target date.
   * @param {Date} targetDate
   */
  _startCountdown(targetDate) {
    // Clear any existing interval
    if (this._timerInterval) clearInterval(this._timerInterval);

    // Format the human-readable target date label
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    this._dateLabelEl.textContent = targetDate.toLocaleDateString('en-US', opts);

    const update = () => {
      const now  = new Date();
      const diff = targetDate - now;

      if (diff <= 0) {
        this._countdownEl.textContent = '🎉';
        this._dateLabelEl.textContent = 'Today is the big day!';
        clearInterval(this._timerInterval);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      this._countdownEl.textContent = days;
    };

    update();
    this._timerInterval = setInterval(update, 60_000); // refresh every minute
  }

  /** Pull aggregate stats from other module keys and render them. */
  _renderStats() {
    // Budget: sum all item amounts
    const budgetItems = StorageManager.getList('budgetItems');
    const totalSpent  = budgetItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    this._statBudget.textContent = formatCurrency(totalSpent);

    // Guests: count
    const guests = StorageManager.getList('guests');
    this._statGuests.textContent = guests.length;

    // Tasks: percentage complete
    const tasks = StorageManager.getList('tasks');
    const done  = tasks.filter((t) => t.done).length;
    const pct   = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    this._statTasks.textContent = `${pct}%`;

    // Vendors: count
    const vendors = StorageManager.getList('vendors');
    this._statVendors.textContent = vendors.length;
  }
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const controller = new DashboardController();
  controller.init();
});
