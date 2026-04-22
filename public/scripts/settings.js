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
    const shareBtn = document.getElementById("share-wedding-btn");
    if (shareBtn) {
      shareBtn.addEventListener("click", () => this._shareWedding());
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

    const shareBtn = document.getElementById("share-wedding-btn");
    if (shareBtn) {
      shareBtn.disabled = !isOwner;
    }
  }

  async _shareWedding() {
    if (!this._currentWedding) {
      return;
    }

    const btn = document.getElementById("share-wedding-btn");
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "…";

    try {
      const { data } = await api.post(
        `/weddings/${this._currentWedding.id}/share-link`,
        { role: "editor" },
      );
      const inviteUrl = `${window.location.origin}/invite.html?token=${data.invite.token}`;
      this._showShareSheet(
        inviteUrl,
        this._currentWedding.name || "Our Wedding",
      );
    } catch (err) {
      Toast.show(err.message || "Could not generate share link.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  _showShareSheet(url, weddingName) {
    document.getElementById("fp-share-modal")?.remove();

    const encodedUrl = encodeURIComponent(url);
    const msgText = `You're invited to help plan "${weddingName}" on Forever Planner! 💍\n${url}`;
    const encodedMsg = encodeURIComponent(msgText);
    const subject = encodeURIComponent(
      `You're invited to plan "${weddingName}" 💍`,
    );

    const channels = [
      {
        id: "copy",
        label: "Copy Link",
        color: "#5b9e6e",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round">
               <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
               <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
             </svg>`,
        action: async (btn) => {
          await navigator.clipboard.writeText(url).catch(() => {});
          const lbl = btn.querySelector(".share-channel-label");
          lbl.textContent = "Copied!";
          setTimeout(() => {
            lbl.textContent = "Copy Link";
          }, 2000);
        },
      },
      {
        id: "sms",
        label: "Text",
        color: "#007AFF",
        icon: `<svg viewBox="0 0 24 24" fill="white">
               <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/>
             </svg>`,
        href: `sms:?&body=${encodedMsg}`,
      },
      {
        id: "email",
        label: "Email",
        color: "#c9748f",
        icon: `<svg viewBox="0 0 24 24" fill="white">
               <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9
                        2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
             </svg>`,
        href: `mailto:?subject=${subject}&body=${encodedMsg}`,
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        color: "#25D366",
        icon: `<svg viewBox="0 0 24 24" fill="white">
               <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15
                        -.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463
                        -2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606
                        .134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025
                        -.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008
                        -.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479
                        0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306
                        1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719
                        2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347
                        m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982
                        .998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884
                        9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994
                        c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0
                        0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588
                        5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005
                        c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
             </svg>`,
        href: `https://wa.me/?text=${encodedMsg}`,
      },
      {
        id: "x",
        label: "X",
        color: "#1c1c1e",
        icon: `<svg viewBox="0 0 24 24" fill="white">
               <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231
                        -5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161
                        17.52h1.833L7.084 4.126H5.117z"/>
             </svg>`,
        href: `https://x.com/intent/post?text=${encodedMsg}`,
      },
      {
        id: "messenger",
        label: "Messenger",
        color: "#0084FF",
        icon: `<svg viewBox="0 0 24 24" fill="white">
               <path d="M12 0C5.373 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472
                        8.652V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.627 0
                        12-4.974 12-11.111C24 4.975 18.627 0 12 0zm1.193 14.963l-3.056
                        -3.259-5.963 3.259L10.096 9l3.136 3.259L19.04 9l-5.847 5.963z"/>
             </svg>`,
        action: async () => {
          window.location.href = `fb-messenger://share/?link=${encodedUrl}`;
          await new Promise((r) => setTimeout(r, 600));
          await navigator.clipboard.writeText(url).catch(() => {});
          window.open("https://messenger.com", "_blank", "noopener");
          Toast.show("Link copied — paste it in Messenger", "default", 3500);
        },
      },
      {
        id: "instagram",
        label: "Instagram",
        color: "#C13584",
        icon: `<svg viewBox="0 0 24 24" fill="white">
               <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691
                        4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584
                        -.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644
                        .07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699
                        -4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07
                        -4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069
                        4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78
                        2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014
                        3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689
                        .072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782
                        -2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014
                        -3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059
                        -1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162
                        6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403
                        -2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4
                        0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406
                        -11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44
                        c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
             </svg>`,
        action: async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          window.open("https://www.instagram.com", "_blank", "noopener");
          Toast.show("Link copied — paste it in Instagram", "default", 3500);
        },
      },
    ];

    const overlay = document.createElement("div");
    overlay.id = "fp-share-modal";
    overlay.className = "share-overlay";
    overlay.innerHTML = `
    <div class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-sheet-title">
      <div class="share-header">
        <h2 class="share-title" id="share-sheet-title">Share Wedding Invite 💍</h2>
        <button class="modal-close" aria-label="Close">✕</button>
      </div>

      <p class="share-wedding-name">${escapeHtml(weddingName)}</p>

      <div class="share-link-row">
        <span class="share-link-url" title="${escapeHtml(url)}">${escapeHtml(url)}</span>
        <button class="btn btn-secondary share-copy-main-btn"
                style="padding:6px 16px;font-size:.8rem;white-space:nowrap;flex-shrink:0;">
          Copy
        </button>
      </div>

      <p class="share-via">Share via</p>

      <div class="share-grid">
        ${channels
          .map(
            (ch) => `
          <button class="share-channel" data-channel="${ch.id}" title="${ch.label}">
            <span class="share-channel-icon" style="background:${ch.color}">
              ${ch.icon}
            </span>
            <span class="share-channel-label">${ch.label}</span>
          </button>
        `,
          )
          .join("")}
      </div>

      <button class="btn btn-ghost btn-full share-dismiss-btn"
              style="font-size:.85rem;margin-top:4px;">
        Done
      </button>
    </div>
  `;

    document.body.appendChild(overlay);

    const dismiss = () => overlay.remove();
    overlay.querySelector(".modal-close").addEventListener("click", dismiss);
    overlay
      .querySelector(".share-dismiss-btn")
      .addEventListener("click", dismiss);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        dismiss();
      }
    });

    // Main copy button
    overlay
      .querySelector(".share-copy-main-btn")
      .addEventListener("click", async (e) => {
        await navigator.clipboard.writeText(url).catch(() => {});
        const btn = e.currentTarget;
        btn.textContent = "✓ Copied";
        setTimeout(() => {
          btn.textContent = "Copy";
        }, 2000);
      });

    // Platform buttons
    overlay.querySelectorAll(".share-channel").forEach((btn) => {
      const ch = channels.find((c) => c.id === btn.dataset.channel);
      if (!ch) {
        return;
      }
      btn.addEventListener("click", () => {
        if (ch.action) {
          ch.action(btn);
        } else if (ch.href) {
          window.open(ch.href, "_blank", "noopener,noreferrer");
        }
      });
    });
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
