/**
 * @file scripts/login.js
 * @description Login / register page controller.
 * On success, redirects to index.html.
 */

import { Auth, ApiResponseError } from "./api.js";

/* ── If already logged in, skip straight to dashboard ─────── */
if (Auth.isLoggedIn()) {
  window.location.replace("/index.html");
}

/* ── DOM refs ──────────────────────────────────────────────── */
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("login-form");
const regForm = document.getElementById("register-form");

/* ── Tab switching ─────────────────────────────────────────── */
function showTab(tab) {
  const isLogin = tab === "login";

  tabLogin.classList.toggle("active", isLogin);
  tabRegister.classList.toggle("active", !isLogin);
  tabLogin.setAttribute("aria-selected", String(isLogin));
  tabRegister.setAttribute("aria-selected", String(!isLogin));

  loginForm.hidden = !isLogin;
  regForm.hidden = isLogin;

  clearErrors();
}

tabLogin.addEventListener("click", () => showTab("login"));
tabRegister.addEventListener("click", () => showTab("register"));

/* ── Field error helpers ───────────────────────────────────── */
function clearErrors() {
  document.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
    el.classList.remove("visible");
  });
  document.getElementById("login-error-banner").hidden = true;
  document.getElementById("reg-error-banner").hidden = true;
}

function fieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = msg;
    el.classList.add("visible");
  }
}

function bannerError(prefix, msg) {
  const banner = document.getElementById(`${prefix}-error-banner`);
  const span = document.getElementById(`${prefix}-error-msg`);
  if (banner && span) {
    span.textContent = msg;
    banner.hidden = false;
  }
}

/* ── Button loading state ──────────────────────────────────── */
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="spinner" aria-hidden="true"></span> Please wait…`
    : btn.dataset.label;
}

/* Stash original labels */
document.getElementById("login-btn").dataset.label = "Sign In";
document.getElementById("reg-btn").dataset.label = "Create Account";

/* ── Login form ────────────────────────────────────────────── */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  let valid = true;

  if (!email) {
    fieldError("login-email-error", "Email is required");
    valid = false;
  }
  if (!password) {
    fieldError("login-password-error", "Password is required");
    valid = false;
  }
  if (!valid) {return;}

  const btn = document.getElementById("login-btn");
  setLoading(btn, true);

  try {
    await Auth.login({ email, password });
    window.location.replace("/index.html");
  } catch (err) {
    setLoading(btn, false);
    if (err instanceof ApiResponseError && err.status === 422) {
      err.errors.forEach(({ field, msg }) => {
        if (field === "email") {fieldError("login-email-error", msg);}
        if (field === "password") {fieldError("login-password-error", msg);}
      });
    } else {
      bannerError("login", err.message || "Sign in failed. Please try again.");
    }
  }
});

/* ── Register form ─────────────────────────────────────────── */
regForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const displayName = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const confirm = document.getElementById("reg-confirm").value;
  let valid = true;

  if (!email) {
    fieldError("reg-email-error", "Email is required");
    valid = false;
  }
  if (!password) {
    fieldError("reg-password-error", "Password is required");
    valid = false;
  }
  if (password && password.length < 8) {
    fieldError("reg-password-error", "At least 8 characters required");
    valid = false;
  }
  if (password && !/[A-Z]/.test(password)) {
    fieldError("reg-password-error", "Must contain an uppercase letter");
    valid = false;
  }
  if (password && !/[0-9]/.test(password)) {
    fieldError("reg-password-error", "Must contain a number");
    valid = false;
  }
  if (password && confirm && password !== confirm) {
    fieldError("reg-confirm-error", "Passwords do not match");
    valid = false;
  }
  if (!valid) {return;}

  const btn = document.getElementById("reg-btn");
  setLoading(btn, true);

  try {
    await Auth.register({
      email,
      password,
      displayName: displayName || undefined,
    });
    window.location.replace("/index.html");
  } catch (err) {
    setLoading(btn, false);
    if (err instanceof ApiResponseError) {
      if (err.status === 409) {
        fieldError(
          "reg-email-error",
          "An account with that email already exists",
        );
      } else if (err.status === 422) {
        err.errors.forEach(({ field, msg }) => {
          if (field === "email") {fieldError("reg-email-error", msg);}
          if (field === "password") {fieldError("reg-password-error", msg);}
        });
      } else {
        bannerError(
          "reg",
          err.message || "Registration failed. Please try again.",
        );
      }
    } else {
      bannerError("reg", "Network error. Please check your connection.");
    }
  }
});
