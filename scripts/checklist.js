/**
 * @file checklist.js
 * @description ChecklistManager — add, complete, filter, and delete
 *              wedding planning tasks with category and due-date support.
 */

import { StorageManager, Toast, escapeHtml, uid, markActiveNav } from './main.js';

/* ============================================================
   ChecklistManager — manages the task list
   ============================================================ */
class ChecklistManager {
  static STORAGE_KEY = 'tasks';

  /** Sample tasks to seed the checklist for a demo / first run. */
  static SEED_TASKS = [
    { text: 'Book the venue',               category: 'Venue',       due: '' },
    { text: 'Choose a caterer',             category: 'Catering',    due: '' },
    { text: 'Order wedding dress',          category: 'Attire',      due: '' },
    { text: 'Book the photographer',        category: 'Photography', due: '' },
    { text: 'Send save-the-date cards',     category: 'Invitations', due: '' },
    { text: 'Book hair & makeup artist',    category: 'Beauty',      due: '' },
    { text: 'Choose wedding flowers',       category: 'Flowers',     due: '' },
    { text: 'Book honeymoon travel',        category: 'Honeymoon',   due: '' },
    { text: 'Finalise guest list',          category: 'Other',       due: '' },
    { text: 'Arrange transportation',       category: 'Other',       due: '' },
  ];

  constructor() {
    /** @type {Array<{id:string, text:string, category:string, due:string, done:boolean}>} */
    this._tasks        = StorageManager.getList(ChecklistManager.STORAGE_KEY);
    this._activeFilter = 'All';

    // Form inputs
    this._taskInput  = document.getElementById('task-text');
    this._catSelect  = document.getElementById('task-category');
    this._dueInput   = document.getElementById('task-due');
    this._addBtn     = document.getElementById('add-task-btn');
    this._seedBtn    = document.getElementById('seed-tasks-btn');

    // Progress
    this._progressBar  = document.getElementById('checklist-progress-bar');
    this._progressWrap = document.getElementById('checklist-progress-wrap');
    this._progressText = document.getElementById('progress-text');
    this._progressPct  = document.getElementById('progress-pct');

    // List
    this._list       = document.getElementById('task-list');
    this._emptyState = document.getElementById('task-empty');
  }

  init() {
    markActiveNav();
    this._bindEvents();
    this._render();
  }

  _bindEvents() {
    this._addBtn.addEventListener('click', () => this._addTask());
    this._taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._addTask();
    });

    this._seedBtn.addEventListener('click', () => this._seedTasks());

    document.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this._activeFilter = tab.dataset.cat;
        this._render();
      });
    });
  }

  _addTask() {
    const text = this._taskInput.value.trim();
    if (!text) {
      Toast.show('Please enter a task description.', 'error');
      this._taskInput.focus();
      return;
    }

    /** @type {{id:string, text:string, category:string, due:string, done:boolean}} */
    const task = {
      id:       uid(),
      text,
      category: this._catSelect.value,
      due:      this._dueInput.value,
      done:     false,
    };

    this._tasks.push(task);
    this._persist();
    this._render();
    this._clearForm();
    Toast.show('Task added!', 'success');
  }

  /** Load demo tasks (skip any already-present by text). */
  _seedTasks() {
    const existing = new Set(this._tasks.map((t) => t.text));
    let added = 0;
    ChecklistManager.SEED_TASKS.forEach((seed) => {
      if (!existing.has(seed.text)) {
        this._tasks.push({ id: uid(), ...seed, done: false });
        added++;
      }
    });
    if (added > 0) {
      this._persist();
      this._render();
      Toast.show(`${added} example tasks added!`, 'success');
    } else {
      Toast.show('All example tasks already added.');
    }
  }

  /**
   * Toggle a task's completion state.
   * @param {string} id
   */
  _toggleTask(id) {
    const task = this._tasks.find((t) => t.id === id);
    if (!task) return;
    task.done = !task.done;
    this._persist();
    this._render();
  }

  /**
   * Delete a task by id.
   * @param {string} id
   */
  _deleteTask(id) {
    this._tasks = this._tasks.filter((t) => t.id !== id);
    this._persist();
    this._render();
    Toast.show('Task removed.');
  }

  _persist() {
    StorageManager.setList(ChecklistManager.STORAGE_KEY, this._tasks);
  }

  _clearForm() {
    this._taskInput.value = '';
    this._dueInput.value  = '';
    this._taskInput.focus();
  }

  /**
   * Format a date string to a human-readable label.
   * @param {string} dateStr  YYYY-MM-DD
   * @returns {string}
   */
  _formatDue(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** Re-render progress and filtered task list. */
  _render() {
    const total = this._tasks.length;
    const done  = this._tasks.filter((t) => t.done).length;
    const pct   = total ? Math.round((done / total) * 100) : 0;

    // Progress
    this._progressBar.style.width = `${pct}%`;
    this._progressWrap.setAttribute('aria-valuenow', pct);
    this._progressText.textContent = `${done} of ${total} task${total !== 1 ? 's' : ''} complete`;
    this._progressPct.textContent  = `${pct}%`;

    // Filter
    let filtered;
    if (this._activeFilter === 'All') {
      filtered = this._tasks;
    } else if (this._activeFilter === 'active') {
      filtered = this._tasks.filter((t) => !t.done);
    } else if (this._activeFilter === 'done') {
      filtered = this._tasks.filter((t) => t.done);
    } else {
      filtered = this._tasks.filter((t) => t.category === this._activeFilter);
    }

    this._emptyState.hidden = filtered.length > 0;

    this._list.innerHTML = filtered.map((t) => {
      const dueLabel = this._formatDue(t.due);
      return `
        <li class="item-card${t.done ? ' completed' : ''}" data-id="${escapeHtml(t.id)}">
          <button class="check-btn${t.done ? ' done' : ''} toggle-btn"
                  aria-label="${t.done ? 'Mark incomplete' : 'Mark complete'}: ${escapeHtml(t.text)}"
                  aria-pressed="${t.done}">
            ${t.done ? '✓' : ''}
          </button>
          <div class="item-info">
            <div class="item-name">${escapeHtml(t.text)}</div>
            <div class="item-meta">
              <span class="item-badge badge-cat">${escapeHtml(t.category)}</span>
              ${dueLabel ? `&nbsp;· Due: ${escapeHtml(dueLabel)}` : ''}
            </div>
          </div>
          <button class="btn btn-danger delete-btn" aria-label="Delete task: ${escapeHtml(t.text)}">✕</button>
        </li>
      `;
    }).join('');

    // Delegate toggle
    this._list.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._toggleTask(btn.closest('.item-card').dataset.id);
      });
    });

    // Delegate delete
    this._list.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._deleteTask(btn.closest('.item-card').dataset.id);
      });
    });
  }
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const manager = new ChecklistManager();
  manager.init();
});
