/**
 * @file public/scripts/i18n.js
 * @description Lightweight i18n engine for Forever Planner.
 *
 * Usage:
 *   import { t, setLang, getLang, applyTranslations, syncLangFromUser } from './i18n.js';
 *
 *   t('nav.budget')              // → 'Budget' | 'Presupuesto'
 *   t('toast.guestAdded', { name: 'Jane' }) // → 'Jane added!'
 *
 * HTML elements with data-i18n="key" are translated automatically
 * by applyTranslations(). For elements containing HTML markup (e.g.
 * the <em>-wrapped h1 headings) add data-i18n-html to use innerHTML.
 */

"use strict";

const STORAGE_KEY = "fp_lang";
const DEFAULT_LANG = "en";
export const SUPPORTED_LANGS = ["en", "es"];

const translations = {
  en: {
    /* ── Nav ──────────────────────────────────────────────── */
    "nav.dashboard": "Dashboard",
    "nav.budget": "Budget",
    "nav.vendors": "Vendors",
    "nav.music": "Music",
    "nav.inspiration": "Inspiration",
    "nav.guests": "Guests",
    "nav.checklist": "Checklist",
    "nav.settings": "Settings",
    "nav.signOut": "Sign Out",

    /* ── Common ───────────────────────────────────────────── */
    "common.add": "Add",
    "common.save": "Save",
    "common.delete": "Delete ✕",
    "common.search": "Search",
    "common.loading": "Loading…",
    "common.noResults": "No results found.",
    "common.remove": "Remove",
    "common.cancel": "Cancel",
    "common.copied": "Copied!",
    "common.copy": "Copy",
    "common.close": "Close ✕",
    "common.all": "All",
    "common.done": "Done",
    "common.active": "To Do",
    "common.refresh": "Refresh",

    /* ── Dashboard ────────────────────────────────────────── */
    "dashboard.title": "<em>Our</em> Wedding Dashboard",
    "dashboard.subtitle": "Everything you need, all in one place.",
    "dashboard.daysUntil": "Days Until Your Wedding",
    "dashboard.setDate": "Set your wedding date:",
    "dashboard.saveDate": "Save Date",
    "dashboard.budgetSpent": "Budget Spent",
    "dashboard.guests": "Guests",
    "dashboard.tasksDone": "Tasks Done",
    "dashboard.vendors": "Vendors",
    "dashboard.music": "Music",
    "dashboard.inspiration": "Inspiration",

    /* ── Budget ───────────────────────────────────────────── */
    "budget.title": "<em>Budget</em> Tracker",
    "budget.subtitle": "Keep every dollar accounted for.",
    "budget.totalBudget": "Total Budget",
    "budget.spent": "Spent",
    "budget.remaining": "Remaining",
    "budget.budgetUsed": "Budget used",
    "budget.setBudgetLimit": "⚙️ Set Budget Limit",
    "budget.totalBudgetLabel": "Total budget ($)",
    "budget.saveLimit": "Save Limit",
    "budget.addExpense": "➕ Add Expense",
    "budget.description": "Description",
    "budget.descriptionPlaceholder": "e.g. Florist deposit",
    "budget.category": "Category",
    "budget.amount": "Amount ($)",
    "budget.addExpenseBtn": "Add Expense",
    "budget.empty": "No expenses yet. Add your first one above!",
    "budget.filterAll": "All",

    /* ── Checklist ────────────────────────────────────────── */
    "checklist.title": "<em>Planning</em> Checklist",
    "checklist.subtitle": "Stay organised from engagement to big day.",
    "checklist.addTask": "➕ Add Task",
    "checklist.taskLabel": "Task *",
    "checklist.taskPlaceholder": "e.g. Book the photographer",
    "checklist.categoryLabel": "Category",
    "checklist.dueDate": "Due Date",
    "checklist.addTaskBtn": "Add Task",
    "checklist.loadExamples": "✨ Load example tasks",
    "checklist.empty":
      "No tasks yet. Add your first task above or load example tasks!",
    "checklist.tasksComplete": "{done} of {total} task{plural} complete",

    /* ── Guests ───────────────────────────────────────────── */
    "guests.title": "<em>Guest</em> List",
    "guests.subtitle": "Track RSVPs, dietary needs, and plus-ones.",
    "guests.total": "Total",
    "guests.confirmed": "Confirmed",
    "guests.pending": "Pending",
    "guests.declined": "Declined",
    "guests.addGuest": "➕ Add Guest",
    "guests.fullName": "Full Name *",
    "guests.fullNamePlaceholder": "e.g. Jane Smith",
    "guests.rsvpStatus": "RSVP Status",
    "guests.dietary": "Dietary Requirements",
    "guests.dietaryPlaceholder": "e.g. Vegan, Gluten-free",
    "guests.plusOne": "Plus-One Name",
    "guests.plusOnePlaceholder": "e.g. John Smith",
    "guests.addGuestBtn": "Add Guest",
    "guests.empty": "No guests added yet. Add your first guest above!",
    "guests.rsvpPending": "Pending",
    "guests.rsvpConfirmed": "Confirmed",
    "guests.rsvpDeclined": "Declined",

    /* ── Vendors ──────────────────────────────────────────── */
    "vendors.title": "<em>Vendor</em> Manager",
    "vendors.subtitle": "Keep all your vendor contacts in one place.",
    "vendors.addVendor": "➕ Add Vendor",
    "vendors.vendorName": "Vendor Name *",
    "vendors.vendorNamePlaceholder": "e.g. Bloom & Blossom Florists",
    "vendors.category": "Category",
    "vendors.phone": "Phone",
    "vendors.phonePlaceholder": "(555) 000-0000",
    "vendors.email": "Email",
    "vendors.emailPlaceholder": "hello@vendor.com",
    "vendors.website": "Website",
    "vendors.websitePlaceholder": "https://vendor.com",
    "vendors.bookingStatus": "Booking Status",
    "vendors.notes": "Notes",
    "vendors.notesPlaceholder": "Deposit paid, contract signed…",
    "vendors.addVendorBtn": "Add Vendor",
    "vendors.empty":
      "No vendors added yet. Fill in the form above to get started!",
    "vendors.statusResearching": "Researching",
    "vendors.statusContacted": "Contacted",
    "vendors.statusBooked": "Booked",
    "vendors.statusDeclined": "Declined",

    /* ── Music ────────────────────────────────────────────── */
    "music.title": "<em>Music</em> Planner",
    "music.subtitle":
      "Search songs and build your wedding playlists. Powered by iTunes Search API.",
    "music.searchSongs": "🔍 Search Songs",
    "music.searchPlaceholder": "Search by song or artist…",
    "music.yourPlaylists": "🎶 Your Playlists",
    "music.empty":
      "Your playlist is empty. Search for songs above and add them!",
    "music.preview": "▶ Preview",
    "music.addBtn": "+ Add",
    "music.searching": "Searching iTunes…",
    "music.noResults": 'No results found for "{q}".',
    "music.searchFailed":
      "Search failed. Please check your connection and try again.",

    /* ── Inspiration ──────────────────────────────────────── */
    "inspiration.title": "<em>Inspiration</em> Board",
    "inspiration.subtitle":
      "Search Unsplash for wedding imagery and save your favourites.",
    "inspiration.searchImages": "🔍 Search Images",
    "inspiration.searchPlaceholder":
      "e.g. floral arch, rustic barn, beach ceremony…",
    "inspiration.savedBoard": "🌸 Saved Board",
    "inspiration.boardEmpty":
      "Your inspiration board is empty. Search and save images above!",
    "inspiration.searchBtn": "Search",
    "inspiration.saveBtn": "♥ Save",
    "inspiration.searching": "Searching Unsplash…",
    "inspiration.noResults": 'No images found for "{q}".',
    "inspiration.searchFailed":
      "Search failed. Please check your connection and try again.",

    /* ── Settings ─────────────────────────────────────────── */
    "settings.title": "<em>Wedding</em> Settings",
    "settings.subtitle": "Manage your wedding details and collaborators.",
    "settings.weddingDetails": "💍 Wedding Details",
    "settings.weddingName": "Wedding Name",
    "settings.weddingDate": "Wedding Date",
    "settings.saveChanges": "Save Changes",
    "settings.viewerNotice": "Only the wedding owner can edit these details.",
    "settings.members": "👥 Members",
    "settings.inviteCollaborator": "💌 Invite a Collaborator",
    "settings.emailAddress": "Email address",
    "settings.emailPlaceholder": "partner@example.com",
    "settings.role": "Role",
    "settings.sendInvite": "Send Invite",
    "settings.share": "🔗 Share",
    "settings.pendingInvites": "📬 Pending Invites",
    "settings.noInvites": "No pending invites.",
    "settings.noMembers": "No members yet.",
    "settings.copyLink": "📋 Copy this link and send it manually:",

    /* ── Login ────────────────────────────────────────────── */
    "login.signIn": "Sign In",
    "login.createAccount": "Create Account",
    "login.continueWithGoogle": "Continue with Google",
    "login.signUpWithGoogle": "Sign up with Google",
    "login.email": "Email",
    "login.password": "Password",
    "login.yourName": "Your Name",
    "login.confirmPassword": "Confirm Password",

    /* ── Toasts ───────────────────────────────────────────── */
    "toast.dateSaved": "Wedding date saved!",
    "toast.limitSaved": "Budget limit saved!",
    "toast.expenseAdded": "Added: {name}",
    "toast.expenseRemoved": "Expense removed.",
    "toast.taskAdded": "Task added!",
    "toast.taskRemoved": "Task removed.",
    "toast.seedAdded": "{count} example tasks added!",
    "toast.seedNone": "All example tasks already added.",
    "toast.guestAdded": "{name} added!",
    "toast.guestRemoved": "Guest removed.",
    "toast.vendorAdded": "{name} added!",
    "toast.vendorRemoved": "Vendor removed.",
    "toast.trackAdded": "Added to {section}!",
    "toast.trackDupe": "Already in {section}.",
    "toast.trackRemoved": "Track removed.",
    "toast.photoSaved": "Saved to your inspiration board! 🌸",
    "toast.photoDupe": "Already saved to your board!",
    "toast.photoRemoved": "Removed from board.",
    "toast.weddingUpdated": "Wedding updated!",
    "toast.inviteCreated": "Invite created! Copy the link below.",
    "toast.memberAdded": "Member added directly!",
    "toast.memberRemoved": "Member removed.",
    "toast.roleUpdated": "Role updated!",
    "toast.inviteDeleted": "Invite deleted.",
    "toast.inviteJoined": 'Joined "{name}"! 🎉',
    "toast.langSaved": "Language saved!",

    /* ── Errors ───────────────────────────────────────────── */
    "err.loadSummary": "Could not load budget summary.",
    "err.loadExpenses": "Could not load expenses.",
    "err.addExpense": "Could not add expense.",
    "err.descRequired": "Please enter a description.",
    "err.amountRequired": "Please enter a valid amount.",
    "err.budgetRequired": "Enter a valid budget amount.",
    "err.loadTasks": "Could not load tasks.",
    "err.addTask": "Could not add task.",
    "err.taskRequired": "Please enter a task description.",
    "err.loadGuests": "Could not load guests.",
    "err.addGuest": "Could not add guest.",
    "err.guestRequired": "Please enter a guest name.",
    "err.loadVendors": "Could not load vendors.",
    "err.addVendor": "Could not add vendor.",
    "err.vendorRequired": "Please enter a vendor name.",
    "err.loadPlaylists": "Could not load playlists.",
    "err.searchRequired": "Enter a song or artist to search.",
    "err.loadBoard": "Could not load inspiration board.",
    "err.searchInspoRequired": "Enter a search term.",
    "err.loadSettings": "Could not load settings.",
  },

  es: {
    /* ── Nav ──────────────────────────────────────────────── */
    "nav.dashboard": "Inicio",
    "nav.budget": "Presupuesto",
    "nav.vendors": "Proveedores",
    "nav.music": "Música",
    "nav.inspiration": "Inspiración",
    "nav.guests": "Invitados",
    "nav.checklist": "Lista de tareas",
    "nav.settings": "Configuración",
    "nav.signOut": "Cerrar sesión",

    /* ── Common ───────────────────────────────────────────── */
    "common.add": "Agregar",
    "common.save": "Guardar",
    "common.delete": "Eliminar ✕",
    "common.search": "Buscar",
    "common.loading": "Cargando…",
    "common.noResults": "No se encontraron resultados.",
    "common.remove": "Eliminar",
    "common.cancel": "Cancelar",
    "common.copied": "¡Copiado!",
    "common.copy": "Copiar",
    "common.close": "Cerrar ✕",
    "common.all": "Todos",
    "common.done": "Hecho",
    "common.active": "Pendiente",
    "common.refresh": "Actualizar",

    /* ── Dashboard ────────────────────────────────────────── */
    "dashboard.title": "<em>Panel</em> de Bodas",
    "dashboard.subtitle": "Todo lo que necesitas en un solo lugar.",
    "dashboard.daysUntil": "Días para tu boda",
    "dashboard.setDate": "Establece la fecha de tu boda:",
    "dashboard.saveDate": "Guardar fecha",
    "dashboard.budgetSpent": "Presupuesto gastado",
    "dashboard.guests": "Invitados",
    "dashboard.tasksDone": "Tareas completadas",
    "dashboard.vendors": "Proveedores",
    "dashboard.music": "Música",
    "dashboard.inspiration": "Inspiración",

    /* ── Budget ───────────────────────────────────────────── */
    "budget.title": "<em>Control</em> de Presupuesto",
    "budget.subtitle": "Cada peso cuenta.",
    "budget.totalBudget": "Presupuesto total",
    "budget.spent": "Gastado",
    "budget.remaining": "Restante",
    "budget.budgetUsed": "Presupuesto usado",
    "budget.setBudgetLimit": "⚙️ Establecer límite",
    "budget.totalBudgetLabel": "Presupuesto total ($)",
    "budget.saveLimit": "Guardar límite",
    "budget.addExpense": "➕ Agregar gasto",
    "budget.description": "Descripción",
    "budget.descriptionPlaceholder": "ej. Depósito floristería",
    "budget.category": "Categoría",
    "budget.amount": "Monto ($)",
    "budget.addExpenseBtn": "Agregar gasto",
    "budget.empty": "Sin gastos aún. ¡Agrega el primero!",
    "budget.filterAll": "Todos",

    /* ── Checklist ────────────────────────────────────────── */
    "checklist.title": "<em>Lista</em> de Planificación",
    "checklist.subtitle":
      "Mantente organizado desde el compromiso hasta el gran día.",
    "checklist.addTask": "➕ Agregar tarea",
    "checklist.taskLabel": "Tarea *",
    "checklist.taskPlaceholder": "ej. Reservar el fotógrafo",
    "checklist.categoryLabel": "Categoría",
    "checklist.dueDate": "Fecha límite",
    "checklist.addTaskBtn": "Agregar tarea",
    "checklist.loadExamples": "✨ Cargar tareas de ejemplo",
    "checklist.empty": "Sin tareas aún. ¡Agrega la primera o carga ejemplos!",
    "checklist.tasksComplete":
      "{done} de {total} tarea{plural} completada{plural}",

    /* ── Guests ───────────────────────────────────────────── */
    "guests.title": "<em>Lista</em> de Invitados",
    "guests.subtitle": "Gestiona confirmaciones, dietas y acompañantes.",
    "guests.total": "Total",
    "guests.confirmed": "Confirmados",
    "guests.pending": "Pendientes",
    "guests.declined": "Rechazados",
    "guests.addGuest": "➕ Agregar invitado",
    "guests.fullName": "Nombre completo *",
    "guests.fullNamePlaceholder": "ej. Juan Pérez",
    "guests.rsvpStatus": "Estado de confirmación",
    "guests.dietary": "Requisitos dietéticos",
    "guests.dietaryPlaceholder": "ej. Vegano, Sin gluten",
    "guests.plusOne": "Nombre del acompañante",
    "guests.plusOnePlaceholder": "ej. Ana Pérez",
    "guests.addGuestBtn": "Agregar invitado",
    "guests.empty": "Sin invitados aún. ¡Agrega el primero!",
    "guests.rsvpPending": "Pendiente",
    "guests.rsvpConfirmed": "Confirmado",
    "guests.rsvpDeclined": "Rechazado",

    /* ── Vendors ──────────────────────────────────────────── */
    "vendors.title": "<em>Gestión</em> de Proveedores",
    "vendors.subtitle": "Todos tus contactos en un solo lugar.",
    "vendors.addVendor": "➕ Agregar proveedor",
    "vendors.vendorName": "Nombre del proveedor *",
    "vendors.vendorNamePlaceholder": "ej. Floristería Bloom",
    "vendors.category": "Categoría",
    "vendors.phone": "Teléfono",
    "vendors.phonePlaceholder": "(555) 000-0000",
    "vendors.email": "Correo electrónico",
    "vendors.emailPlaceholder": "hola@proveedor.com",
    "vendors.website": "Sitio web",
    "vendors.websitePlaceholder": "https://proveedor.com",
    "vendors.bookingStatus": "Estado de reserva",
    "vendors.notes": "Notas",
    "vendors.notesPlaceholder": "Depósito pagado, contrato firmado…",
    "vendors.addVendorBtn": "Agregar proveedor",
    "vendors.empty": "Sin proveedores aún. ¡Completa el formulario!",
    "vendors.statusResearching": "Investigando",
    "vendors.statusContacted": "Contactado",
    "vendors.statusBooked": "Reservado",
    "vendors.statusDeclined": "Rechazado",

    /* ── Music ────────────────────────────────────────────── */
    "music.title": "<em>Planificador</em> de Música",
    "music.subtitle":
      "Busca canciones y crea tus playlists de boda. Impulsado por iTunes.",
    "music.searchSongs": "🔍 Buscar canciones",
    "music.searchPlaceholder": "Buscar por canción o artista…",
    "music.yourPlaylists": "🎶 Tus playlists",
    "music.empty": "Tu playlist está vacía. ¡Busca canciones y agrégalas!",
    "music.preview": "▶ Vista previa",
    "music.addBtn": "+ Agregar",
    "music.searching": "Buscando en iTunes…",
    "music.noResults": 'Sin resultados para "{q}".',
    "music.searchFailed":
      "Búsqueda fallida. Revisa tu conexión e inténtalo de nuevo.",

    /* ── Inspiration ──────────────────────────────────────── */
    "inspiration.title": "<em>Tablero</em> de Inspiración",
    "inspiration.subtitle":
      "Busca imágenes en Unsplash y guarda tus favoritas.",
    "inspiration.searchImages": "🔍 Buscar imágenes",
    "inspiration.searchPlaceholder":
      "ej. arco floral, granero rústico, ceremonia en playa…",
    "inspiration.savedBoard": "🌸 Tablero guardado",
    "inspiration.boardEmpty":
      "Tu tablero está vacío. ¡Busca y guarda imágenes!",
    "inspiration.searchBtn": "Buscar",
    "inspiration.saveBtn": "♥ Guardar",
    "inspiration.searching": "Buscando en Unsplash…",
    "inspiration.noResults": 'Sin imágenes para "{q}".',
    "inspiration.searchFailed":
      "Búsqueda fallida. Revisa tu conexión e inténtalo de nuevo.",

    /* ── Settings ─────────────────────────────────────────── */
    "settings.title": "<em>Configuración</em> de la Boda",
    "settings.subtitle": "Gestiona los detalles y colaboradores de tu boda.",
    "settings.weddingDetails": "💍 Detalles de la boda",
    "settings.weddingName": "Nombre de la boda",
    "settings.weddingDate": "Fecha de la boda",
    "settings.saveChanges": "Guardar cambios",
    "settings.viewerNotice": "Solo el propietario puede editar estos detalles.",
    "settings.members": "👥 Miembros",
    "settings.inviteCollaborator": "💌 Invitar colaborador",
    "settings.emailAddress": "Correo electrónico",
    "settings.emailPlaceholder": "pareja@ejemplo.com",
    "settings.role": "Rol",
    "settings.sendInvite": "Enviar invitación",
    "settings.share": "🔗 Compartir",
    "settings.pendingInvites": "📬 Invitaciones pendientes",
    "settings.noInvites": "Sin invitaciones pendientes.",
    "settings.noMembers": "Sin miembros aún.",
    "settings.copyLink": "📋 Copia este enlace y envíalo manualmente:",

    /* ── Login ────────────────────────────────────────────── */
    "login.signIn": "Iniciar sesión",
    "login.createAccount": "Crear cuenta",
    "login.continueWithGoogle": "Continuar con Google",
    "login.signUpWithGoogle": "Registrarse con Google",
    "login.email": "Correo electrónico",
    "login.password": "Contraseña",
    "login.yourName": "Tu nombre",
    "login.confirmPassword": "Confirmar contraseña",

    /* ── Toasts ───────────────────────────────────────────── */
    "toast.dateSaved": "¡Fecha de boda guardada!",
    "toast.limitSaved": "¡Límite de presupuesto guardado!",
    "toast.expenseAdded": "Agregado: {name}",
    "toast.expenseRemoved": "Gasto eliminado.",
    "toast.taskAdded": "¡Tarea agregada!",
    "toast.taskRemoved": "Tarea eliminada.",
    "toast.seedAdded": "¡{count} tareas de ejemplo agregadas!",
    "toast.seedNone": "Todas las tareas de ejemplo ya fueron agregadas.",
    "toast.guestAdded": "¡{name} agregado!",
    "toast.guestRemoved": "Invitado eliminado.",
    "toast.vendorAdded": "¡{name} agregado!",
    "toast.vendorRemoved": "Proveedor eliminado.",
    "toast.trackAdded": "¡Agregado a {section}!",
    "toast.trackDupe": "Ya está en {section}.",
    "toast.trackRemoved": "Pista eliminada.",
    "toast.photoSaved": "¡Guardado en tu tablero! 🌸",
    "toast.photoDupe": "¡Ya está guardado en tu tablero!",
    "toast.photoRemoved": "Eliminado del tablero.",
    "toast.weddingUpdated": "¡Boda actualizada!",
    "toast.inviteCreated": "¡Invitación creada! Copia el enlace.",
    "toast.memberAdded": "¡Miembro agregado directamente!",
    "toast.memberRemoved": "Miembro eliminado.",
    "toast.roleUpdated": "¡Rol actualizado!",
    "toast.inviteDeleted": "Invitación eliminada.",
    "toast.inviteJoined": '¡Te uniste a "{name}"! 🎉',
    "toast.langSaved": "¡Idioma guardado!",

    /* ── Errors ───────────────────────────────────────────── */
    "err.loadSummary": "No se pudo cargar el resumen del presupuesto.",
    "err.loadExpenses": "No se pudieron cargar los gastos.",
    "err.addExpense": "No se pudo agregar el gasto.",
    "err.descRequired": "Por favor ingresa una descripción.",
    "err.amountRequired": "Por favor ingresa un monto válido.",
    "err.budgetRequired": "Ingresa un monto de presupuesto válido.",
    "err.loadTasks": "No se pudieron cargar las tareas.",
    "err.addTask": "No se pudo agregar la tarea.",
    "err.taskRequired": "Por favor ingresa una descripción de la tarea.",
    "err.loadGuests": "No se pudieron cargar los invitados.",
    "err.addGuest": "No se pudo agregar el invitado.",
    "err.guestRequired": "Por favor ingresa el nombre del invitado.",
    "err.loadVendors": "No se pudieron cargar los proveedores.",
    "err.addVendor": "No se pudo agregar el proveedor.",
    "err.vendorRequired": "Por favor ingresa el nombre del proveedor.",
    "err.loadPlaylists": "No se pudieron cargar las playlists.",
    "err.searchRequired": "Ingresa una canción o artista para buscar.",
    "err.loadBoard": "No se pudo cargar el tablero de inspiración.",
    "err.searchInspoRequired": "Ingresa un término de búsqueda.",
    "err.loadSettings": "No se pudo cargar la configuración.",
  },
};

/* ── Internal state ──────────────────────────────────────── */
let currentLang = (() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return SUPPORTED_LANGS.includes(stored) ? stored : DEFAULT_LANG;
})();

/* ── Public API ──────────────────────────────────────────── */

/**
 * Translate a key, optionally interpolating {variables}.
 * Falls back to EN then to the raw key if not found.
 * @param {string} key
 * @param {Record<string,string|number>} [vars]
 * @returns {string}
 */
export function t(key, vars = {}) {
  const dict = translations[currentLang] ?? translations[DEFAULT_LANG];
  let str = dict[key] ?? translations[DEFAULT_LANG][key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replaceAll(`{${k}}`, v);
  }
  return str;
}

/** Current active language code. */
export function getLang() {
  return currentLang;
}

/**
 * Switch language, persist to localStorage, and re-apply translations.
 * @param {string} code  e.g. 'en' | 'es'
 */
export function setLang(code) {
  if (!SUPPORTED_LANGS.includes(code)) {
    return;
  }
  currentLang = code;
  localStorage.setItem(STORAGE_KEY, code);
  document.documentElement.lang = code;
  applyTranslations();
}

/**
 * Walk all [data-i18n] elements and set their text/html/attribute.
 * Called automatically by setLang(); also call manually after initNav().
 */
export function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const attr = el.dataset.i18nAttr; // e.g. "placeholder"
    const useHtml = "i18nHtml" in el.dataset;
    const val = t(key);

    if (attr) {
      el.setAttribute(attr, val);
    } else if (useHtml) {
      el.innerHTML = val;
    } else {
      el.textContent = val;
    }
  });
  document.documentElement.lang = currentLang;
}

/**
 * Sync language preference from a loaded user object.
 * Call this in initNav() after Auth.getUser() is available.
 * @param {{ language?: string }|null} user
 */
export function syncLangFromUser(user) {
  if (user?.language && SUPPORTED_LANGS.includes(user.language)) {
    if (currentLang !== user.language) {
      currentLang = user.language;
      localStorage.setItem(STORAGE_KEY, currentLang);
    }
  }
}
