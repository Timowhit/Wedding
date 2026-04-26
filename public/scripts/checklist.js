/**
 * @file scripts/checklist.js
 */

import api, { Auth } from "./api.js";
import { initNav, Toast, escapeHtml, showLoading, t } from "./main.js";

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
      if (e.key === "Enter") {
        this._addTask();
      }
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

  async _load() {
    showLoading(this._list, t("common.loading"));
    this._emptyState.hidden = true;

    const query = {};
    if (this._activeFilter === "active") {
      query.status = "active";
    } else if (this._activeFilter === "done") {
      query.status = "done";
    } else if (this._activeFilter !== "All") {
      query.category = this._activeFilter;
    }

    try {
      const { data } = await api.get("/checklist", query);
      this._renderProgress(data.progress);
      this._renderList(data.tasks);
    } catch {
      this._list.innerHTML = "";
      Toast.show(t("err.loadTasks"), "error");
    }
  }

  async _addTask() {
    const text = this._taskInput.value.trim();
    if (!text) {
      return Toast.show(t("err.taskRequired"), "error");
    }

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
      Toast.show(t("toast.taskAdded"), "success");
      await this._load();
    } catch (err) {
      Toast.show(err.message || t("err.addTask"), "error");
    } finally {
      this._addBtn.disabled = false;
    }
  }

  async _toggle(id) {
    try {
      await api.post(`/checklist/${id}/toggle`);
      await this._load();
    } catch (err) {
      Toast.show(err.message || t("err.addTask"), "error");
    }
  }

  async _delete(id) {
    try {
      await api.delete(`/checklist/${id}`);
      Toast.show(t("toast.taskRemoved"));
      await this._load();
    } catch (err) {
      Toast.show(err.message || t("err.addTask"), "error");
    }
  }

  async _seed() {
    this._seedBtn.disabled = true;
    try {
      const { data } = await api.post("/checklist/seed");
      Toast.show(
        data.added > 0
          ? t("toast.seedAdded", { count: data.added })
          : t("toast.seedNone"),
        data.added > 0 ? "success" : "default",
      );
      await this._load();
    } catch (err) {
      Toast.show(err.message || t("err.addTask"), "error");
    } finally {
      this._seedBtn.disabled = false;
    }
  }

  _renderProgress({ total, done, pct }) {
    this._progressBar.style.width = `${pct}%`;
    this._progressWrap.setAttribute("aria-valuenow", pct);
    const plural = total !== 1 ? "s" : "";
    this._progressText.textContent = t("checklist.tasksComplete", {
      done,
      total,
      plural,
    });
    this._progressPct.textContent = `${pct}%`;
  }

  _renderList(tasks) {
    this._emptyState.hidden = tasks.length > 0;
    if (!tasks.length) {
      this._list.innerHTML = "";
      return;
    }

    this._list.innerHTML = tasks
      .map((task) => {
        const due = task.due_date
          ? new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "";

        return `
        <li class="item-card${task.done ? " completed" : ""}" data-id="${escapeHtml(task.id)}">
          <button class="check-btn${task.done ? " done" : ""} toggle-btn"
                  aria-label="${task.done ? t("common.active") : t("common.done")}: ${escapeHtml(task.text)}"
                  aria-pressed="${task.done}">
            ${task.done ? "✓" : ""}
          </button>
          <div class="item-info">
            <div class="item-name">${escapeHtml(task.text)}</div>
            <div class="item-meta">
              <span class="item-badge badge-cat">${escapeHtml(task.category)}</span>
              ${due ? `&nbsp;· Due: ${escapeHtml(due)}` : ""}
            </div>
          </div>
          <button class="btn btn-danger delete-btn"
                  aria-label="${t("common.delete")}: ${escapeHtml(task.text)}">✕</button>
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

document.addEventListener("DOMContentLoaded", () =>
  new ChecklistManager().init(),
);
