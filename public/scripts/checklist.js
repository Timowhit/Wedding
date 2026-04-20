/**
 * @file scripts/checklist.js
 * @description ChecklistManager — API-backed tasks with toggle, seed, filter.
 */

import api, { Auth } from "./api.js";
import { initNav, Toast, escapeHtml, showLoading } from "./main.js";

Auth.requireAuth();

class ChecklistManager {
  constructor() {
    this._activeFilter = "All";

    this._taskInput = document.getElementById("task-text");
    this._catSelect = document.getElementById("task-category");
    this._dueInput = document.getElementById("task-due");
    this._addBtn = document.getElementById("add-task-btn");
    this._seedBtn = document.getElementById("seed-tasks-btn");

    this._progressBar = document.getElementById("checklist-progress-bar");
    this._progressWrap = document.getElementById("checklist-progress-wrap");
    this._progressText = document.getElementById("progress-text");
    this._progressPct = document.getElementById("progress-pct");

    this._list = document.getElementById("task-list");
    this._emptyState = document.getElementById("task-empty");
  }

  async init() {
    initNav();
    this._bindEvents();
    await this._load();
  }

  _bindEvents() {
    this._addBtn.addEventListener("click", () => this._addTask());
    this._taskInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {this._addTask();}
    });
    this._seedBtn.addEventListener("click", () => this._seed());

    document.querySelectorAll(".filter-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".filter-tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this._activeFilter = tab.dataset.cat;
        this._load();
      });
    });
  }

  /* ── Load ─────────────────────────────────────────────── */
  async _load() {
    showLoading(this._list, "Loading tasks…");
    this._emptyState.hidden = true;

    const query = {};
    if (this._activeFilter === "active") {query.status = "active";}
    else if (this._activeFilter === "done") {query.status = "done";}
    else if (!["All"].includes(this._activeFilter))
      {query.category = this._activeFilter;}

    try {
      const { data } = await api.get("/checklist", query);
      this._renderProgress(data.progress);
      this._renderList(data.tasks);
    } catch (err) {
      this._list.innerHTML = "";
      Toast.show("Could not load tasks.", "error");
    }
  }

  /* ── Add ──────────────────────────────────────────────── */
  async _addTask() {
    const text = this._taskInput.value.trim();
    if (!text) {return Toast.show("Please enter a task description.", "error");}

    this._addBtn.disabled = true;
    try {
      await api.post("/checklist", {
        text,
        category: this._catSelect.value,
        dueDate: this._dueInput.value || undefined,
      });
      this._taskInput.value = "";
      this._dueInput.value = "";
      this._taskInput.focus();
      Toast.show("Task added!", "success");
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not add task.", "error");
    } finally {
      this._addBtn.disabled = false;
    }
  }

  /* ── Toggle ───────────────────────────────────────────── */
  async _toggle(id) {
    try {
      await api.post(`/checklist/${id}/toggle`);
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not update task.", "error");
    }
  }

  /* ── Delete ───────────────────────────────────────────── */
  async _delete(id) {
    try {
      await api.delete(`/checklist/${id}`);
      Toast.show("Task removed.");
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not delete task.", "error");
    }
  }

  /* ── Seed ─────────────────────────────────────────────── */
  async _seed() {
    this._seedBtn.disabled = true;
    try {
      const { data } = await api.post("/checklist/seed");
      Toast.show(
        data.added > 0
          ? `${data.added} example tasks added!`
          : "All example tasks already added.",
        data.added > 0 ? "success" : "default",
      );
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not seed tasks.", "error");
    } finally {
      this._seedBtn.disabled = false;
    }
  }

  /* ── Render ───────────────────────────────────────────── */
  _renderProgress({ total, done, pct }) {
    this._progressBar.style.width = `${pct}%`;
    this._progressWrap.setAttribute("aria-valuenow", pct);
    this._progressText.textContent = `${done} of ${total} task${total !== 1 ? "s" : ""} complete`;
    this._progressPct.textContent = `${pct}%`;
  }

  _renderList(tasks) {
    this._emptyState.hidden = tasks.length > 0;
    if (!tasks.length) {
      this._list.innerHTML = "";
      return;
    }

    this._list.innerHTML = tasks
      .map((t) => {
        const due = t.due_date
          ? new Date(t.due_date + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "";

        return `
        <li class="item-card${t.done ? " completed" : ""}" data-id="${escapeHtml(t.id)}">
          <button class="check-btn${t.done ? " done" : ""} toggle-btn"
                  aria-label="${t.done ? "Mark incomplete" : "Mark complete"}: ${escapeHtml(t.text)}"
                  aria-pressed="${t.done}">
            ${t.done ? "✓" : ""}
          </button>
          <div class="item-info">
            <div class="item-name">${escapeHtml(t.text)}</div>
            <div class="item-meta">
              <span class="item-badge badge-cat">${escapeHtml(t.category)}</span>
              ${due ? `&nbsp;· Due: ${escapeHtml(due)}` : ""}
            </div>
          </div>
          <button class="btn btn-danger delete-btn"
                  aria-label="Delete: ${escapeHtml(t.text)}">✕</button>
        </li>`;
      })
      .join("");

    this._list
      .querySelectorAll(".toggle-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          this._toggle(btn.closest(".item-card").dataset.id),
        ),
      );
    this._list
      .querySelectorAll(".delete-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          this._delete(btn.closest(".item-card").dataset.id),
        ),
      );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new ChecklistManager().init();
});
