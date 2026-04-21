/**
 * @file scripts/settings.js
 *
 * Fixes applied:
 *  1. `const { data: weddings }` was wrong — data is { weddings: [] }, not the array.
 *     Fixed to `const { data }` then `data.weddings`.
 *  2. invite.expires_at (string) compared to new Date() — wrapped in new Date().
 *  3. Role change uses correct PATCH endpoint.
 */

import api, { Auth } from "./api.js";
import { initNav, Toast, escapeHtml, showLoading } from "./main.js";

Auth.requireAuth();

class SettingsManager {
  constructor() {
    this._weddingNameInput = document.getElementById("wedding-name");
    this._weddingDateInput = document.getElementById("wedding-date-input");
    this._saveWeddingBtn = document.getElementById("save-wedding-btn");
    this._viewerNotice = document.getElementById("viewer-notice");

    this._membersList = document.getElementById("members-list");

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

    const refreshBtn = document.getElementById("refresh-invites-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this._load());
    }
  }

  /* ── Load ─────────────────────────────────────────────── */
  async _load() {
    showLoading(this._membersList, "Loading settings…");

    try {
      // ← FIX: was `const { data: weddings }` which gave the wrapper object,
      //         not the array. Now we destructure correctly.
      const { data } = await api.get("/weddings");
      const weddingList = data.weddings || [];
      if (weddingList.length === 0) {
        throw new Error("No wedding found");
      }

      this._currentWedding = weddingList[0];
      this._currentUserRole = this._currentWedding.role;

      const { data: membersData } = await api.get(
        `/weddings/${this._currentWedding.id}/members`,
      );
      const { data: invitesData } = await api.get(
        `/weddings/${this._currentWedding.id}/invites`,
      );

      this._renderWedding();
      this._renderMembers(membersData.members);
      this._renderInvites(invitesData.invites);
    } catch (err) {
      Toast.show("Could not load settings.", "error");
      this._membersList.innerHTML = `<p style="color:var(--danger);padding:16px">${escapeHtml(err.message)}</p>`;
    }
  }

  /* ── Wedding ──────────────────────────────────────────── */
  _renderWedding() {
    this._weddingNameInput.value = this._currentWedding.name || "";
    this._weddingDateInput.value = this._currentWedding.wedding_date
      ? this._currentWedding.wedding_date.substring(0, 10)
      : "";

    const isOwner = this._currentUserRole === "owner";
    this._viewerNotice.style.display = isOwner ? "none" : "block";
    this._saveWeddingBtn.disabled = !isOwner;
    this._inviteEmailInput.disabled = !isOwner;
    this._sendInviteBtn.disabled = !isOwner;
  }

  async _saveWedding() {
    const name = this._weddingNameInput.value.trim();
    const weddingDate = this._weddingDateInput.value || null;
    try {
      await api.patch(`/weddings/${this._currentWedding.id}`, {
        name,
        weddingDate,
      });
      this._currentWedding.name = name;
      this._currentWedding.wedding_date = weddingDate;
      Toast.show("Wedding updated!", "success");
    } catch (err) {
      Toast.show(err.message || "Could not update wedding.", "error");
    }
  }

  /* ── Members ──────────────────────────────────────────── */
  _renderMembers(members) {
    this._membersList.innerHTML = "";

    if (!members || members.length === 0) {
      this._membersList.innerHTML = `<p style="color:var(--text-muted);padding:12px">No members yet.</p>`;
      return;
    }

    members.forEach((member) => {
      const card = document.createElement("div");
      card.className = "member-card";

      const isCurrentUser = member.id === Auth.getUser()?.id;
      const canEdit = this._currentUserRole === "owner" && !isCurrentUser;

      const initial = (member.display_name ||
        member.email ||
        "?")[0].toUpperCase();

      card.innerHTML = `
        <div class="member-avatar">${
          member.avatar_url
            ? `<img src="${escapeHtml(member.avatar_url)}" alt="" />`
            : escapeHtml(initial)
        }</div>
        <div class="member-info">
          <div class="member-name">
            ${escapeHtml(member.display_name || member.email)}
            ${isCurrentUser ? `<span class="you-badge">you</span>` : ""}
          </div>
          <div class="member-email">${escapeHtml(member.email)}</div>
        </div>
        <div class="member-role">
          ${
            canEdit
              ? `<select class="role-select" data-user-id="${escapeHtml(member.id)}">
                  <option value="viewer"  ${member.role === "viewer" ? "selected" : ""}>Viewer</option>
                  <option value="editor"  ${member.role === "editor" ? "selected" : ""}>Editor</option>
                  <option value="owner"   ${member.role === "owner" ? "selected" : ""}>Owner</option>
                </select>`
              : `<span class="owner-badge">${escapeHtml(member.role)}</span>`
          }
        </div>
        ${
          canEdit
            ? `<button class="btn btn-danger remove-member-btn" data-user-id="${escapeHtml(member.id)}">Remove</button>`
            : ""
        }
      `;

      if (canEdit) {
        card
          .querySelector(".role-select")
          .addEventListener("change", (e) =>
            this._changeRole(member.id, e.target.value),
          );
        card
          .querySelector(".remove-member-btn")
          .addEventListener("click", () => this._removeMember(member.id));
      }

      this._membersList.appendChild(card);
    });

    const countEl = document.getElementById("member-count");
    if (countEl) {
      countEl.textContent = `${members.length} member${members.length !== 1 ? "s" : ""}`;
    }
  }

  async _changeRole(userId, role) {
    try {
      await api.patch(
        `/weddings/${this._currentWedding.id}/members/${userId}`,
        { role },
      );
      Toast.show("Role updated!", "success");
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not update role.", "error");
    }
  }

  async _removeMember(userId) {
    if (!confirm("Remove this member from the wedding?")) {
      return;
    }
    try {
      await api.delete(
        `/weddings/${this._currentWedding.id}/members/${userId}`,
      );
      Toast.show("Member removed.", "success");
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not remove member.", "error");
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

    // Hide link box from previous attempt
    document.getElementById("invite-link-container").style.display = "none";

    try {
      const { data } = await api.post(
        `/weddings/${this._currentWedding.id}/members`,
        { email, role },
      );
      this._inviteEmailInput.value = "";

      if (data.invite) {
        // Build the invite URL
        const inviteUrl = `${window.location.origin}/invite.html?token=${data.invite.token}`;

        // Show the copy-link box (SMTP may not be configured)
        const linkContainer = document.getElementById("invite-link-container");
        const linkText = document.getElementById("invite-link-text");
        const copyBtn = document.getElementById("copy-link-btn");

        linkText.textContent = inviteUrl;
        linkContainer.style.display = "block";

        // Wire up copy button
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(inviteUrl).then(() => {
            copyBtn.textContent = "Copied!";
            setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
          });
        };

        Toast.show("Invite created! Copy the link below.", "success");
      } else {
        Toast.show("Member added directly!", "success");
      }

      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not send invite.", "error");
    } finally {
      this._sendInviteBtn.disabled = false;
    }
  }

  _renderInvites(invites) {
    this._invitesList.innerHTML = "";

    if (!invites || invites.length === 0) {
      this._invitesList.innerHTML = `<p style="color:var(--text-muted);padding:12px">No pending invites.</p>`;
      return;
    }

    invites.forEach((invite) => {
      const item = document.createElement("div");
      item.className = "invite-item";

      // ← FIX: wrap string in new Date() before comparing
      const expired = new Date(invite.expires_at) < new Date();
      const accepted = !!invite.accepted_at;
      const status = accepted ? "Accepted" : expired ? "Expired" : "Pending";
      const statusClass = accepted ? "invite-used" : "";

      item.innerHTML = `
        <div style="flex:1">
          <div class="invite-email">${escapeHtml(invite.invited_email)}</div>
          <div class="invite-status ${statusClass}">${status} · ${escapeHtml(invite.role)}</div>
        </div>
        ${
          this._currentUserRole === "owner"
            ? `<button class="btn btn-danger delete-invite-btn" data-invite-id="${escapeHtml(invite.id)}">Delete</button>`
            : ""
        }
      `;

      if (this._currentUserRole === "owner") {
        item
          .querySelector(".delete-invite-btn")
          .addEventListener("click", () => this._deleteInvite(invite.id));
      }

      this._invitesList.appendChild(item);
    });
  }

  async _deleteInvite(inviteId) {
    try {
      await api.delete(
        `/weddings/${this._currentWedding.id}/invites/${inviteId}`,
      );
      Toast.show("Invite deleted.", "success");
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not delete invite.", "error");
    }
  }
}

document.addEventListener("DOMContentLoaded", () =>
  new SettingsManager().init(),
);
