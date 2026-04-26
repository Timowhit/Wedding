/**
 * @file public/scripts/lang-switcher.js
 * @description Floating language-switcher pill (top-right corner).
 *
 * Renders a fixed EN/ES button that opens a small dropdown.
 * On selection: updates i18n, saves to localStorage, and PATCHes
 * the user's language preference to the API (if logged in).
 */

"use strict";

import api, { Auth } from "./api.js";
import { t, getLang, setLang, SUPPORTED_LANGS } from "./i18n.js";
import { Toast } from "./main.js";

const LANG_LABELS = { en: "EN", es: "ES" };

export function initLangSwitcher() {
  // Remove any existing instance (safe to call multiple times)
  document.getElementById("fp-lang-switcher")?.remove();

  const container = document.createElement("div");
  container.id = "fp-lang-switcher";
  container.className = "lang-switcher";
  container.setAttribute("role", "region");
  container.setAttribute("aria-label", "Language selector");

  container.innerHTML = `
    <button
      class="lang-toggle"
      aria-haspopup="listbox"
      aria-expanded="false"
      aria-label="Change language, current: ${LANG_LABELS[getLang()]}"
    >
      <span class="lang-code">${LANG_LABELS[getLang()]}</span>
      <svg class="lang-chevron" viewBox="0 0 10 6" aria-hidden="true">
        <path d="M0 0l5 6 5-6z" fill="currentColor"/>
      </svg>
    </button>
    <ul class="lang-dropdown" role="listbox" aria-label="Languages" hidden>
      ${SUPPORTED_LANGS.map(
        (code) => `
        <li
          role="option"
          aria-selected="${code === getLang()}"
          class="lang-option${code === getLang() ? " active" : ""}"
          data-lang="${code}"
        >
          ${LANG_LABELS[code]}
        </li>
      `,
      ).join("")}
    </ul>
  `;

  document.body.appendChild(container);

  const toggle = container.querySelector(".lang-toggle");
  const dropdown = container.querySelector(".lang-dropdown");
  const codeEl = container.querySelector(".lang-code");

  /* ── Open / close ─────────────────────────────────────── */
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    toggle.setAttribute("aria-expanded", String(!isOpen));
    container.classList.toggle("open", !isOpen);
  });

  const close = () => {
    dropdown.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    container.classList.remove("open");
  };

  document.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      close();
    }
  });

  /* ── Select language ──────────────────────────────────── */
  dropdown.querySelectorAll(".lang-option").forEach((opt) => {
    opt.addEventListener("click", async (e) => {
      e.stopPropagation();
      const code = opt.dataset.lang;
      if (code === getLang()) {
        return close();
      }

      // Update UI immediately
      setLang(code);
      codeEl.textContent = LANG_LABELS[code];
      toggle.setAttribute(
        "aria-label",
        `Change language, current: ${LANG_LABELS[code]}`,
      );

      dropdown.querySelectorAll(".lang-option").forEach((o) => {
        o.classList.toggle("active", o.dataset.lang === code);
        o.setAttribute("aria-selected", String(o.dataset.lang === code));
      });

      close();

      // Persist to DB if logged in
      if (Auth.isLoggedIn()) {
        try {
          await api.patch("/auth/me", { language: code });
          Toast.show(t("toast.langSaved"), "success");
        } catch {
          // localStorage already updated — silently ignore network errors
        }
      }
    });
  });
}
