/**
 * @file scripts/settings.js
 * @description SettingsManager — Wedding settings, members, and invites.
 */

import api, { Auth } from "./api.js";
import { initNav, Toast, escapeHtml, showLoading } from "./main.js";

Auth.requireAuth();

class SettingsManager {
  constructor() {
    // Wedding form
    this._weddingNameInput = document.getElementById("wedding-name");
    this._weddingDateInput = document.getElementById("wedding-date-input");
    this._saveWeddingBtn = document.getElementById("save-wedding-btn");

    // Members
    this._membersList = document.getElementById("members-list");
    this._viewerNotice = document.getElementById("viewer-notice");

    // Invites
    this._inviteEmailInput = document.getElementById("invite-email-input");
    this._inviteRoleSelect = document.getElementById("invite-role-select");
    this._sendInviteBtn = document.getElementById("send-invite-btn");
    this._invitesList = document.getElementById("invites-list");

    this._currentWedding = null;
    this._currentUserRole = null;
  }

  async init() {
    initNav();
    this._bindEvents();
    await this._load();
  }

  _bindEvents() {
    this._saveWeddingBtn.addEventListener("click", () => this._saveWedding());
    this._sendInviteBtn.addEventListener("click", () => this._sendInvite());
  }

  /* ── Load ─────────────────────────────────────────────── */
  async _load() {
    showLoading(this._membersList, "Loading settings…");

    try {
      // Load primary wedding
      const { data: weddings } = await api.get("/weddings");
      if (weddings.length === 0) {
        throw new Error("No wedding found");
      }
      this._currentWedding = weddings[0];
      this._currentUserRole = this._currentWedding.role;

      // Load members
      const { data: membersData } = await api.get(
        `/weddings/${this._currentWedding.id}/members`,
      );
      this._renderWedding();
      this._renderMembers(membersData.members);

      // Load invites
      const { data: invitesData } = await api.get(
        `/weddings/${this._currentWedding.id}/invites`,
      );
      this._renderInvites(invitesData.invites);
    } catch (err) {
      Toast.show("Could not load settings.", "error");
    }
  }

  /* ── Wedding ──────────────────────────────────────────── */
  _renderWedding() {
    this._weddingNameInput.value = this._currentWedding.name || "";
    this._weddingDateInput.value = this._currentWedding.wedding_date || "";

    // Show viewer notice if not owner
    this._viewerNotice.hidden = this._currentUserRole === "owner";
    this._saveWeddingBtn.disabled = this._currentUserRole !== "owner";
    this._inviteEmailInput.disabled = this._currentUserRole !== "owner";
    this._sendInviteBtn.disabled = this._currentUserRole !== "owner";
  }

  async _saveWedding() {
    const name = this._weddingNameInput.value.trim();
    const weddingDate = this._weddingDateInput.value;

    try {
      await api.patch(`/weddings/${this._currentWedding.id}`, {
        name,
        weddingDate,
      });
      this._currentWedding.name = name;
      this._currentWedding.wedding_date = weddingDate;
      Toast.show("Wedding updated!", "success");
    } catch (err) {
      Toast.show("Could not update wedding.", "error");
    }
  }

  /* ── Members ──────────────────────────────────────────── */
  _renderMembers(members) {
    this._membersList.innerHTML = "";

    members.forEach((member) => {
      const li = document.createElement("li");
      li.className = "member-item";

      const isCurrentUser = member.id === Auth.getUser().id;
      const canEdit = this._currentUserRole === "owner" && !isCurrentUser;

      li.innerHTML = `
        <div class="member-info">
          <div class="member-name">${escapeHtml(member.display_name || member.email)}</div>
          <div class="member-email">${escapeHtml(member.email)}</div>
        </div>
        <div class="member-role">
          ${
            canEdit
              ? `
            <select class="role-select" data-user-id="${member.id}">
              <option value="viewer" ${member.role === "viewer" ? "selected" : ""}>Viewer</option>
              <option value="editor" ${member.role === "editor" ? "selected" : ""}>Editor</option>
              <option value="owner" ${member.role === "owner" ? "selected" : ""}>Owner</option>
            </select>
          `
              : `
            <span class="role-badge">${member.role}</span>
          `
          }
        </div>
        ${
          canEdit
            ? `
          <button class="btn btn-danger btn-sm remove-member-btn" data-user-id="${member.id}">
            Remove
          </button>
        `
            : ""
        }
      `;

      // Bind events
      if (canEdit) {
        const select = li.querySelector(".role-select");
        select.addEventListener("change", () =>
          this._changeRole(member.id, select.value),
        );

        const removeBtn = li.querySelector(".remove-member-btn");
        removeBtn.addEventListener("click", () =>
          this._removeMember(member.id),
        );
      }

      this._membersList.appendChild(li);
    });
  }

  async _changeRole(userId, role) {
    try {
      await api.patch(
        `/weddings/${this._currentWedding.id}/members/${userId}`,
        { role },
      );
      Toast.show("Role updated!", "success");
      await this._load(); // Reload to update UI
    } catch (err) {
      Toast.show("Could not update role.", "error");
    }
  }

  async _removeMember(userId) {
    if (!confirm("Are you sure you want to remove this member?")) {
      return;
    }

    try {
      await api.delete(
        `/weddings/${this._currentWedding.id}/members/${userId}`,
      );
      Toast.show("Member removed!", "success");
      await this._load();
    } catch (err) {
      Toast.show("Could not remove member.", "error");
    }
  }

  /* ── Invites ──────────────────────────────────────────── */
  async _sendInvite() {
    const email = this._inviteEmailInput.value.trim();
    const role = this._inviteRoleSelect.value;

    if (!email) {
      return Toast.show("Please enter an email address.", "error");
    }

    this._sendInviteBtn.disabled = true;
    try {
      await api.post(`/weddings/${this._currentWedding.id}/members`, {
        email,
        role,
      });
      this._inviteEmailInput.value = "";
      Toast.show("Invite sent!", "success");
      await this._load();
    } catch (err) {
      Toast.show("Could not send invite.", "error");
    } finally {
      this._sendInviteBtn.disabled = false;
    }
  }

  _renderInvites(invites) {
    this._invitesList.innerHTML = "";

    if (invites.length === 0) {
      this._invitesList.innerHTML =
        "<li class='empty-state'>No pending invites</li>";
      return;
    }

    invites.forEach((invite) => {
      const li = document.createElement("li");
      li.className = "invite-item";

      const status = invite.accepted_at
        ? "Accepted"
        : invite.expires_at < new Date()
          ? "Expired"
          : "Pending";

      li.innerHTML = `
        <div class="invite-info">
          <div class="invite-email">${escapeHtml(invite.invited_email)}</div>
          <div class="invite-role">Role: ${invite.role}</div>
          <div class="invite-status">Status: ${status}</div>
        </div>
        ${
          this._currentUserRole === "owner"
            ? `
          <button class="btn btn-danger btn-sm delete-invite-btn" data-invite-id="${invite.id}">
            Delete
          </button>
        `
            : ""
        }
      `;

      if (this._currentUserRole === "owner") {
        const deleteBtn = li.querySelector(".delete-invite-btn");
        deleteBtn.addEventListener("click", () =>
          this._deleteInvite(invite.id),
        );
      }

      this._invitesList.appendChild(li);
    });
  }

  async _deleteInvite(inviteId) {
    try {
      await api.delete(
        `/weddings/${this._currentWedding.id}/invites/${inviteId}`,
      );
      Toast.show("Invite deleted!", "success");
      await this._load();
    } catch (err) {
      Toast.show("Could not delete invite.", "error");
    }
  }
}

// Initialize
const manager = new SettingsManager();
manager.init();
