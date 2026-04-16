/**
 * @file guests.js
 * @description GuestManager — add, filter, update, and delete wedding
 *              guests with RSVP tracking, dietary needs, and plus-ones.
 */

import { StorageManager, Toast, escapeHtml, uid, markActiveNav } from './main.js';

/* ============================================================
   GuestManager — manages the guest list
   ============================================================ */
class GuestManager {
  static STORAGE_KEY = 'guests';

  /** RSVP value → badge CSS class */
  static BADGE_MAP = {
    Confirmed: 'badge-confirmed',
    Declined:  'badge-declined',
    Pending:   'badge-pending',
  };

  constructor() {
    /** @type {Array<{id:string, name:string, rsvp:string, diet:string, plusOne:string}>} */
    this._guests       = StorageManager.getList(GuestManager.STORAGE_KEY);
    this._activeFilter = 'All';

    // Form inputs
    this._nameInput   = document.getElementById('guest-name');
    this._rsvpSelect  = document.getElementById('guest-rsvp');
    this._dietInput   = document.getElementById('guest-diet');
    this._plusOneInput = document.getElementById('guest-plusone');
    this._addBtn      = document.getElementById('add-guest-btn');

    // Stats
    this._statTotal     = document.getElementById('stat-total');
    this._statConfirmed = document.getElementById('stat-confirmed');
    this._statPending   = document.getElementById('stat-pending');
    this._statDeclined  = document.getElementById('stat-declined');

    // List
    this._list       = document.getElementById('guest-list');
    this._emptyState = document.getElementById('guest-empty');
  }

  init() {
    markActiveNav();
    this._bindEvents();
    this._render();
  }

  _bindEvents() {
    this._addBtn.addEventListener('click', () => this._addGuest());
    this._nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._addGuest();
    });

    document.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this._activeFilter = tab.dataset.rsvp;
        this._render();
      });
    });
  }

  _addGuest() {
    const name = this._nameInput.value.trim();
    if (!name) {
      Toast.show('Please enter a guest name.', 'error');
      this._nameInput.focus();
      return;
    }

    /** @type {{id:string, name:string, rsvp:string, diet:string, plusOne:string}} */
    const guest = {
      id:      uid(),
      name,
      rsvp:    this._rsvpSelect.value,
      diet:    this._dietInput.value.trim(),
      plusOne: this._plusOneInput.value.trim(),
    };

    this._guests.push(guest);
    this._persist();
    this._render();
    this._clearForm();
    Toast.show(`${name} added!`, 'success');
  }

  /**
   * Cycle a guest's RSVP status: Pending → Confirmed → Declined → Pending.
   * @param {string} id
   */
  _cycleRsvp(id) {
    const cycle = ['Pending', 'Confirmed', 'Declined'];
    const guest = this._guests.find((g) => g.id === id);
    if (!guest) return;
    const idx = cycle.indexOf(guest.rsvp);
    guest.rsvp = cycle[(idx + 1) % cycle.length];
    this._persist();
    this._render();
  }

  /**
   * Delete a guest by id.
   * @param {string} id
   */
  _deleteGuest(id) {
    const guest = this._guests.find((g) => g.id === id);
    this._guests = this._guests.filter((g) => g.id !== id);
    this._persist();
    this._render();
    if (guest) Toast.show(`${guest.name} removed.`);
  }

  _persist() {
    StorageManager.setList(GuestManager.STORAGE_KEY, this._guests);
  }

  _clearForm() {
    [this._nameInput, this._dietInput, this._plusOneInput].forEach((el) => { el.value = ''; });
    this._nameInput.focus();
  }

  _render() {
    // Update summary stats
    this._statTotal.textContent     = this._guests.length;
    this._statConfirmed.textContent = this._guests.filter((g) => g.rsvp === 'Confirmed').length;
    this._statPending.textContent   = this._guests.filter((g) => g.rsvp === 'Pending').length;
    this._statDeclined.textContent  = this._guests.filter((g) => g.rsvp === 'Declined').length;

    // Filter
    const filtered = this._activeFilter === 'All'
      ? this._guests
      : this._guests.filter((g) => g.rsvp === this._activeFilter);

    this._emptyState.hidden = filtered.length > 0;

    this._list.innerHTML = filtered.map((g) => {
      const badge = GuestManager.BADGE_MAP[g.rsvp] || 'badge-cat';
      const meta  = [
        g.diet    && `🥗 ${escapeHtml(g.diet)}`,
        g.plusOne && `+1: ${escapeHtml(g.plusOne)}`,
      ].filter(Boolean).join(' · ');

      return `
        <li class="item-card" data-id="${escapeHtml(g.id)}">
          <div class="item-info">
            <div class="item-name">${escapeHtml(g.name)}</div>
            ${meta ? `<div class="item-meta">${meta}</div>` : ''}
          </div>
          <button class="item-badge ${badge} rsvp-btn"
                  aria-label="RSVP: ${escapeHtml(g.rsvp)}. Click to change."
                  style="border:none;cursor:pointer;white-space:nowrap;">
            ${escapeHtml(g.rsvp)}
          </button>
          <button class="btn btn-danger delete-btn" aria-label="Remove ${escapeHtml(g.name)}">✕</button>
        </li>
      `;
    }).join('');

    // Delegate RSVP cycle
    this._list.querySelectorAll('.rsvp-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._cycleRsvp(btn.closest('.item-card').dataset.id);
      });
    });

    // Delegate delete
    this._list.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._deleteGuest(btn.closest('.item-card').dataset.id);
      });
    });
  }
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const manager = new GuestManager();
  manager.init();
});
