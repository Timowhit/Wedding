/**
 * @file scripts/invite.js
 * @description InviteManager — Handle wedding invites with login/register flow.
 */

import api, { Auth, ApiResponseError } from "./api.js";
import { Toast } from "./main.js";

// Get token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token");

if (!token) {
  showError("Invalid invite link.");
} else {
  loadInvite();
}

class InviteManager {
  constructor(inviteData) {
    this.invite = inviteData;

    // Elements
    this._loading = document.getElementById("invite-loading");
    this._error = document.getElementById("invite-error");
    this._errorMsg = document.getElementById("invite-error-msg");

    this._authSection = document.getElementById("invite-auth-section");
    this._loggedinSection = document.getElementById("invite-loggedin-section");

    // Auth form
    this._emailInput = document.getElementById("invite-email");
    this._passwordInput = document.getElementById("invite-password");
    this._loginBtn = document.getElementById("invite-login-btn");
    this._registerBtn = document.getElementById("invite-register-btn");
    this._googleBtn = document.getElementById("google-invite-btn");
    this._authError = document.getElementById("invite-auth-error");

    // Logged in
    this._currentUser = document.getElementById("invite-current-user");
    this._acceptBtn = document.getElementById("invite-accept-btn");
    this._wrongAccountBtn = document.getElementById("invite-wrong-account-btn");

    // Details
    this._from = document.getElementById("invite-from");
    this._wedding = document.getElementById("invite-wedding");
    this._roleBadge = document.getElementById("invite-role-badge");

    this._bindEvents();
    this._renderInvite();
    this._checkAuthStatus();
  }

  _bindEvents() {
    this._loginBtn.addEventListener("click", () => this._login());
    this._registerBtn.addEventListener("click", () => this._register());
    this._googleBtn.addEventListener("click", () => this._googleLogin());
    this._acceptBtn.addEventListener("click", () => this._accept());
    this._wrongAccountBtn.addEventListener("click", () => this._logout());
  }

  _renderInvite() {
    this._from.textContent = this.invite.invited_by_name;
    this._wedding.textContent = this.invite.wedding_name;
    this._roleBadge.textContent = this.invite.role;
  }

  _checkAuthStatus() {
    const user = Auth.getUser();
    if (user) {
      this._showLoggedIn(user);
    } else {
      this._showAuth();
    }
  }

  _showAuth() {
    this._loading.hidden = true;
    this._authSection.hidden = false;
    this._loggedinSection.hidden = true;
    this._emailInput.value = this.invite.invited_email || "";
  }

  _showLoggedIn(user) {
    this._loading.hidden = true;
    this._authSection.hidden = true;
    this._loggedinSection.hidden = false;
    this._currentUser.textContent = user.display_name || user.email;
  }

  async _login() {
    const email = this._emailInput.value.trim();
    const password = this._passwordInput.value;

    if (!email || !password) {
      return this._showAuthError("Please enter email and password.");
    }

    this._loginBtn.disabled = true;
    try {
      await Auth.login(email, password);
      this._checkAuthStatus();
    } catch (err) {
      this._showAuthError("Invalid email or password.");
    } finally {
      this._loginBtn.disabled = false;
    }
  }

  async _register() {
    const email = this._emailInput.value.trim();
    const password = this._passwordInput.value;

    if (!email || !password) {
      return this._showAuthError("Please enter email and password.");
    }

    if (password.length < 8) {
      return this._showAuthError("Password must be at least 8 characters.");
    }

    this._registerBtn.disabled = true;
    try {
      await Auth.register(email, password);
      this._checkAuthStatus();
    } catch (err) {
      this._showAuthError(
        "Could not create account. Email may already be in use.",
      );
    } finally {
      this._registerBtn.disabled = false;
    }
  }

  _googleLogin() {
    // Redirect to Google OAuth
    window.location.href = "/api/v1/auth/google";
  }

  async _accept() {
    this._acceptBtn.disabled = true;
    try {
      await api.post(`/weddings/invites/${token}/accept`);
      Toast.show("Welcome to the wedding!", "success");
      // Redirect to dashboard
      window.location.href = "/index.html";
    } catch (err) {
      Toast.show("Could not accept invite.", "error");
    } finally {
      this._acceptBtn.disabled = false;
    }
  }

  _logout() {
    Auth.logout();
    this._checkAuthStatus();
  }

  _showAuthError(msg) {
    this._authError.textContent = msg;
    this._authError.hidden = false;
  }
}

async function loadInvite() {
  try {
    const { data } = await api.get(`/weddings/invites/${token}`);
    new InviteManager(data);
  } catch (err) {
    if (err instanceof ApiResponseError && err.status === 404) {
      showError("Invite not found or expired.");
    } else {
      showError("Could not load invite.");
    }
  }
}

function showError(msg) {
  document.getElementById("invite-loading").hidden = true;
  document.getElementById("invite-error-msg").textContent = msg;
  document.getElementById("invite-error").hidden = false;
}
