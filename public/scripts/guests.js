/**
 * @file scripts/guests.js
 * @description GuestManager — API-backed guest list with RSVP cycling.
 */

import api, { Auth }                               from './api.js';
import { initNav, Toast, escapeHtml, showLoading } from './main.js';

Auth.requireAuth();

const BADGE_MAP = {
  Confirmed: 'badge-confirmed',
  Declined:  'badge-declined',
  Pending:   'badge-pending',
};

class GuestManager {
  constructor() {
    this._activeFilter = 'All';

    this._nameInput    = document.getElementById('guest-name');
    this._rsvpSelect   = document.getElementById('guest-rsvp');
    this._dietInput    = document.getElementById('guest-diet');
    this._plusOneInput = document.getElementById('guest-plusone');
    this._addBtn       = document.getElementById('add-guest-btn');

    this._statTotal     = document.getElementById('stat-total');
    this._statConfirmed = document.getElementById('stat-confirmed');
    this._statPending   = document.getElementById('stat-pending');
    this._statDeclined  = document.getElementById('stat-declined');

    this._list          = document.getElementById('guest-list');
    this._emptyState    = document.getElementById('guest-empty');
  }

  async init() {
    initNav();
    this._bindEvents();
    await this._load();
  }

  _bindEvents() {
    this._addBtn.addEventListener('click', () => this._add());
    this._nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._add();
    });

    document.querySelectorAll('.filter-tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this._activeFilter = tab.dataset.rsvp;
        this._load();
      }),
    );
  }

  /* ── Load ─────────────────────────────────────────────── */
  async _load() {
    showLoading(this._list, 'Loading guests…');
    this._emptyState.hidden = true;

    const query = this._activeFilter !== 'All' ? { rsvp: this._activeFilter } : {};
    try {
      const { data } = await api.get('/guests', query);
      this._renderStats(data.stats);
      this._renderList(data.guests);
    } catch (err) {
      this._list.innerHTML = '';
      Toast.show('Could not load guests.', 'error');
    }
  }

  /* ── Add ──────────────────────────────────────────────── */
  async _add() {
    const name = this._nameInput.value.trim();
    if (!name) return Toast.show('Please enter a guest name.', 'error');

    this._addBtn.disabled = true;
    try {
      await api.post('/guests', {
        name,
        rsvp:    this._rsvpSelect.value,
        diet:    this._dietInput.value.trim()    || undefined,
        plusOne: this._plusOneInput.value.trim() || undefined,
      });
      [this._nameInput, this._dietInput, this._plusOneInput].forEach((el) => { el.value = ''; });
      this._nameInput.focus();
      Toast.show(`${name} added!`, 'success');
      await this._load();
    } catch (err) {
      Toast.show(err.message || 'Could not add guest.', 'error');
    } finally {
      this._addBtn.disabled = false;
    }
  }

  /* ── Cycle RSVP ───────────────────────────────────────── */
  async _cycleRsvp(id) {
    try {
      await api.post(`/guests/${id}/cycle-rsvp`);
      await this._load();
    } catch (err) {
      Toast.show(err.message || 'Could not update RSVP.', 'error');
    }
  }

  /* ── Delete ───────────────────────────────────────────── */
  async _delete(id) {
    try {
      await api.delete(`/guests/${id}`);
      Toast.show('Guest removed.');
      await this._load();
    } catch (err) {
      Toast.show(err.message || 'Could not remove guest.', 'error');
    }
  }

  /* ── Render ───────────────────────────────────────────── */
  _renderStats({ total, confirmed, pending, declined }) {
    this._statTotal.textContent     = total;
    this._statConfirmed.textContent = confirmed;
    this._statPending.textContent   = pending;
    this._statDeclined.textContent  = declined;
  }

  _renderList(guests) {
    this._emptyState.hidden = guests.length > 0;
    if (!guests.length) { this._list.innerHTML = ''; return; }

    this._list.innerHTML = guests.map((g) => {
      const badge = BADGE_MAP[g.rsvp] || 'badge-cat';
      const meta  = [
        g.diet     && `🥗 ${escapeHtml(g.diet)}`,
        g.plus_one && `+1: ${escapeHtml(g.plus_one)}`,
      ].filter(Boolean).join(' · ');

      return `
        <li class="item-card" data-id="${escapeHtml(g.id)}">
          <div class="item-info">
            <div class="item-name">${escapeHtml(g.name)}</div>
            ${meta ? `<div class="item-meta">${meta}</div>` : ''}
          </div>
          <button class="item-badge ${badge} rsvp-btn"
                  style="border:none;cursor:pointer;white-space:nowrap;"
                  aria-label="RSVP: ${escapeHtml(g.rsvp)}. Click to change.">
            ${escapeHtml(g.rsvp)}
          </button>
          <button class="btn btn-danger delete-btn"
                  aria-label="Remove ${escapeHtml(g.name)}">✕</button>
        </li>`;
    }).join('');

    this._list.querySelectorAll('.rsvp-btn').forEach((btn) =>
      btn.addEventListener('click', () =>
        this._cycleRsvp(btn.closest('.item-card').dataset.id),
      ),
    );
    this._list.querySelectorAll('.delete-btn').forEach((btn) =>
      btn.addEventListener('click', () =>
        this._delete(btn.closest('.item-card').dataset.id),
      ),
    );
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new GuestManager().init();
});
