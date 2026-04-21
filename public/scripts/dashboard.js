/**
 * @file scripts/dashboard.js
 * @description Dashboard — countdown timer + API-backed summary stats.
 */

import api, { Auth } from "./api.js";
import { initNav, formatCurrency, Toast } from "./main.js";

Auth.requireAuth();

/* ── DOM refs ──────────────────────────────────────────────── */
const countdownEl = document.getElementById("countdown-number");
const dateLabelEl = document.getElementById("countdown-date-label");
const dateInput = document.getElementById("wedding-date-input");
const setDateBtn = document.getElementById("set-date-btn");
const statBudget = document.getElementById("stat-budget");
const statGuests = document.getElementById("stat-guests");
const statTasks = document.getElementById("stat-tasks");
const statVendors = document.getElementById("stat-vendors");

let timerInterval = null;

/* ── Boot ──────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  initNav();
  loadSavedDate();
  await renderStats();
});

/* ── Wedding date (stored in user profile via API) ─────────── */
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function loadSavedDate() {
  // Prefer the profile wedding_date; fall back to localStorage cache
  const user = Auth.getUser();
  const saved = user?.wedding_date || localStorage.getItem("fp_wedding_date");
  if (saved) {
    const iso = saved.substring(0, 10); // handles ISO timestamp or plain date
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

    // Update cached user
    const user = Auth.getUser() ?? {};
    user.wedding_date = val;
    Auth.setUser(user);

    startCountdown(parseLocalDate(val));
    Toast.show("Wedding date saved!", "success");
  } catch (err) {
    Toast.show(err.message || "Could not save date.", "error");
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

/* ── Stats ─────────────────────────────────────────────────── */
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
