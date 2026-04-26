/**
 * @file scripts/dashboard.js
 */

import api, { Auth } from "./api.js";
import { initNav, formatCurrency, Toast, showInviteModal, t } from "./main.js";

Auth.requireAuth();

const countdownEl = document.getElementById("countdown-number");
const dateLabelEl = document.getElementById("countdown-date-label");
const dateInput = document.getElementById("wedding-date-input");
const setDateBtn = document.getElementById("set-date-btn");
const statBudget = document.getElementById("stat-budget");
const statGuests = document.getElementById("stat-guests");
const statTasks = document.getElementById("stat-tasks");
const statVendors = document.getElementById("stat-vendors");

let timerInterval = null;

document.addEventListener("DOMContentLoaded", async () => {
  initNav();
  loadSavedDate();

  if (sessionStorage.getItem("fp_fresh_login")) {
    sessionStorage.removeItem("fp_fresh_login");
    try {
      const { data } = await api.get("/weddings/my-pending-invites");
      if ((data.invites || []).length > 0) {
        showInviteModal(data.invites);
      }
    } catch {
      /* silently ignore */
    }
  }

  await renderStats();
});

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function loadSavedDate() {
  const user = Auth.getUser();
  const saved = user?.wedding_date || localStorage.getItem("fp_wedding_date");
  if (saved) {
    const iso = saved.substring(0, 10);
    dateInput.value = iso;
    startCountdown(parseLocalDate(iso));
  }
}

setDateBtn.addEventListener("click", async () => {
  const val = dateInput.value;
  if (!val) {
    return;
  }

  try {
    await api.patch("/auth/me", { weddingDate: val });
    localStorage.setItem("fp_wedding_date", val);

    const user = Auth.getUser() ?? {};
    user.wedding_date = val;
    Auth.setUser(user);

    startCountdown(parseLocalDate(val));
    Toast.show(t("toast.dateSaved"), "success");
  } catch (err) {
    Toast.show(err.message || t("toast.dateSaved"), "error");
  }
});

function startCountdown(targetDate) {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  const opts = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  dateLabelEl.textContent = targetDate.toLocaleDateString("en-US", opts);

  const tick = () => {
    const diff = targetDate - new Date();
    if (diff <= 0) {
      countdownEl.textContent = "🎉";
      dateLabelEl.textContent = "Today is the big day!";
      clearInterval(timerInterval);
      return;
    }
    countdownEl.textContent = Math.floor(diff / 86_400_000);
  };

  tick();
  timerInterval = setInterval(tick, 60_000);
}

async function renderStats() {
  try {
    const [budgetRes, guestsRes, tasksRes, vendorsRes] = await Promise.all([
      api.get("/budget/summary"),
      api.get("/guests"),
      api.get("/checklist"),
      api.get("/vendors"),
    ]);

    statBudget.textContent = formatCurrency(budgetRes.data.spent);
    statGuests.textContent = guestsRes.data.stats.total;
    statTasks.textContent = `${tasksRes.data.progress.pct}%`;
    statVendors.textContent = vendorsRes.data.vendors.length;
  } catch (err) {
    console.error("Dashboard stats error:", err);
  }
}
