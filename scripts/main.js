/**
 * @file main.js
 * @description Shared utilities: storage management, toast notifications,
 *              active nav link, and helper functions.
 * Forever Planner — Wedding Planning Helper
 */

'use strict';

/* ============================================================
   StorageManager — wraps localStorage with error handling
   ============================================================ */
export class StorageManager {
  /**
   * Retrieve an array from localStorage.
   * @param {string} key
   * @returns {Array}
   */
  static getList(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Persist an array to localStorage.
   * @param {string} key
   * @param {Array} data
   */
  static setList(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  /**
   * Retrieve a single value from localStorage.
   * @param {string} key
   * @param {*} defaultVal
   * @returns {*}
   */
  static getValue(key, defaultVal = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  /**
   * Persist a single value to localStorage.
   * @param {string} key
   * @param {*} value
   */
  static setValue(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

/* ============================================================
   Toast — non-blocking UI notifications
   ============================================================ */
export class Toast {
  static _container = null;

  /** Initialise or return the toast container element. */
  static _getContainer() {
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.className = 'toast-container';
      this._container.setAttribute('aria-live', 'polite');
      this._container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(this._container);
    }
    return this._container;
  }

  /**
   * Show a toast message.
   * @param {string} message
   * @param {'default'|'success'|'error'} type
   * @param {number} duration  ms before auto-dismiss
   */
  static show(message, type = 'default', duration = 2800) {
    const container = this._getContainer();
    const el = document.createElement('div');
    el.className = `toast${type !== 'default' ? ' ' + type : ''}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s ease';
      setTimeout(() => el.remove(), 350);
    }, duration);
  }
}

/* ============================================================
   Utility helpers
   ============================================================ */

/**
 * Format a number as USD currency string.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/**
 * Escape user-provided strings to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a simple unique ID.
 * @returns {string}
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Mark the current page's nav link as active.
 */
export function markActiveNav() {
  const current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.site-nav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === current || (current === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
}
