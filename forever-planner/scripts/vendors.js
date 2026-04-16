/**
 * @file vendors.js
 * @description VendorManager — add, filter, delete wedding vendor contacts
 *              with booking-status tracking.
 */

import { StorageManager, Toast, escapeHtml, uid, markActiveNav } from './main.js';

/* ============================================================
   VendorManager — manages vendor contact list
   ============================================================ */
class VendorManager {
  static STORAGE_KEY = 'vendors';

  /** Status → badge style mapping */
  static STATUS_STYLES = {
    Booked:      'badge-confirmed',
    Declined:    'badge-declined',
    Contacted:   'badge-pending',
    Researching: 'badge-cat',
  };

  constructor() {
    this._vendors       = StorageManager.getList(VendorManager.STORAGE_KEY);
    this._activeFilter  = 'All';

    // Form inputs
    this._nameInput    = document.getElementById('vendor-name');
    this._catSelect    = document.getElementById('vendor-category');
    this._phoneInput   = document.getElementById('vendor-phone');
    this._emailInput   = document.getElementById('vendor-email');
    this._websiteInput = document.getElementById('vendor-website');
    this._statusSelect = document.getElementById('vendor-status');
    this._notesInput   = document.getElementById('vendor-notes');
    this._addBtn       = document.getElementById('add-vendor-btn');

    // List
    this._list        = document.getElementById('vendor-list');
    this._emptyState  = document.getElementById('vendor-empty');
  }

  init() {
    markActiveNav();
    this._bindEvents();
    this._render();
  }

  _bindEvents() {
    this._addBtn.addEventListener('click', () => this._addVendor());

    document.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this._activeFilter = tab.dataset.status;
        this._render();
      });
    });
  }

  _addVendor() {
    const name = this._nameInput.value.trim();
    if (!name) {
      Toast.show('Please enter a vendor name.', 'error');
      this._nameInput.focus();
      return;
    }

    /** @type {{id:string, name:string, category:string, phone:string, email:string, website:string, status:string, notes:string}} */
    const vendor = {
      id:       uid(),
      name,
      category: this._catSelect.value,
      phone:    this._phoneInput.value.trim(),
      email:    this._emailInput.value.trim(),
      website:  this._websiteInput.value.trim(),
      status:   this._statusSelect.value,
      notes:    this._notesInput.value.trim(),
    };

    this._vendors.push(vendor);
    this._persist();
    this._render();
    this._clearForm();
    Toast.show(`${name} added!`, 'success');
  }

  /**
   * Cycle status of a vendor through the workflow.
   * @param {string} id
   */
  _cycleStatus(id) {
    const cycle = ['Researching', 'Contacted', 'Booked', 'Declined'];
    const vendor = this._vendors.find((v) => v.id === id);
    if (!vendor) return;
    const idx = cycle.indexOf(vendor.status);
    vendor.status = cycle[(idx + 1) % cycle.length];
    this._persist();
    this._render();
  }

  /**
   * Delete vendor by id.
   * @param {string} id
   */
  _deleteVendor(id) {
    const vendor = this._vendors.find((v) => v.id === id);
    this._vendors = this._vendors.filter((v) => v.id !== id);
    this._persist();
    this._render();
    if (vendor) Toast.show(`${vendor.name} removed.`);
  }

  _persist() {
    StorageManager.setList(VendorManager.STORAGE_KEY, this._vendors);
  }

  _clearForm() {
    [this._nameInput, this._phoneInput, this._emailInput, this._websiteInput, this._notesInput]
      .forEach((el) => { el.value = ''; });
    this._nameInput.focus();
  }

  _render() {
    const filtered = this._activeFilter === 'All'
      ? this._vendors
      : this._vendors.filter((v) => v.status === this._activeFilter);

    this._emptyState.hidden = filtered.length > 0;

    this._list.innerHTML = filtered.map((v) => {
      const badgeClass = VendorManager.STATUS_STYLES[v.status] || 'badge-cat';
      const contactParts = [
        v.phone  && `<a href="tel:${escapeHtml(v.phone)}" style="color:var(--primary)">${escapeHtml(v.phone)}</a>`,
        v.email  && `<a href="mailto:${escapeHtml(v.email)}" style="color:var(--primary)">${escapeHtml(v.email)}</a>`,
        v.website && `<a href="${escapeHtml(v.website)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary)">Website ↗</a>`,
      ].filter(Boolean).join(' · ');

      return `
        <li class="item-card vendor-card" data-id="${escapeHtml(v.id)}">
          <div class="item-info">
            <div class="item-name">${escapeHtml(v.name)}</div>
            <div class="item-meta">
              <span class="item-badge badge-cat">${escapeHtml(v.category)}</span>
              ${contactParts ? `&nbsp;· ${contactParts}` : ''}
              ${v.notes ? `<br><em style="font-style:italic;opacity:.8">${escapeHtml(v.notes)}</em>` : ''}
            </div>
          </div>
          <button class="item-badge ${badgeClass} status-btn"
                  aria-label="Status: ${escapeHtml(v.status)}. Click to change."
                  style="border:none;cursor:pointer;white-space:nowrap;">
            ${escapeHtml(v.status)}
          </button>
          <button class="btn btn-danger delete-btn" aria-label="Remove ${escapeHtml(v.name)}">✕</button>
        </li>
      `;
    }).join('');

    // Delegate status cycle
    this._list.querySelectorAll('.status-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._cycleStatus(btn.closest('.item-card').dataset.id);
      });
    });

    // Delegate delete
    this._list.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._deleteVendor(btn.closest('.item-card').dataset.id);
      });
    });
  }
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const manager = new VendorManager();
  manager.init();
});
