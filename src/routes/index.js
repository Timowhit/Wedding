import { Router } from 'express';
import {
    finishGoogleLogin,
    processLanguage,
    processLogin,
    processLogout,
    processRegister,
    showLoginForm,
    showStart,
    showRegisterForm,
    startGoogleLogin
} from '../controllers/auth.js';
import { processBudgetLimit, processDeleteExpense, processNewExpense, showBudget } from '../controllers/budget.js';
import {
    processDeleteTask,
    processEditTask,
    processExampleTasks,
    processNewTask,
    processToggleTask,
    showChecklist,
    showEditTask
} from '../controllers/checklist.js';
import {
    processJoinByLink,
    processNewWedding,
    processSwitchWedding,
    processWeddingDate,
    showDashboard,
    showWelcome
} from '../controllers/dashboard.js';
import {
    processSetRsvp,
    processDeleteGuest,
    processEditGuest,
    processNewGuest,
    showEditGuest,
    showGuests
} from '../controllers/guests.js';
import {
    processClearBoard,
    processDeletePhoto,
    processSavePhoto,
    showInspiration
} from '../controllers/inspiration.js';
import { processAcceptInvite, processDeclineInvite, showInvite } from '../controllers/invites.js';
import { processAddTrack, processClearSection, processDeleteTrack, showMusic } from '../controllers/music.js';
import {
    processHandover,
    processBecomePlanner,
    processAppearance,
    processReminders,
    processBusiness,
    processInvite,
    processLeaveWedding,
    processMemberRole,
    processPassword,
    processProfile,
    processRemoveMember,
    processRevokeInvite,
    processWeddingDetails,
    showSettings
} from '../controllers/settings.js';
import {
    processSetStatus,
    processDeleteVendor,
    processEditVendor,
    processNewVendor,
    showEditVendor,
    showVendors
} from '../controllers/vendors.js';
import { redirectIfLoggedIn, requireLogin, requirePlanner } from '../middleware/auth.js';
import { processNewClientWedding, processOpenWedding, showPlannerDashboard } from '../controllers/planner.js';
import {
    inviteLimiter,
    loginLimiter,
    passwordLimiter,
    registerLimiter,
    searchLimiter
} from '../middleware/rateLimit.js';
import {
    loadActiveWedding,
    loadOptionalWedding,
    requireDecisionRight,
    requireEditor,
    requireOwner
} from '../middleware/wedding.js';
import { showLanding } from '../controllers/home.js';
import {
    processAssignGuest,
    processDeleteTable,
    processEditTable,
    processNewTable,
    showSeating
} from '../controllers/seating.js';
import {
    processDeleteItem,
    processEditItem,
    processNewItem,
    showEditItem,
    showSchedule
} from '../controllers/schedule.js';
import { showCustomCss } from '../controllers/themes.js';
import {
    processAppColors,
    processAppColorsOff,
    processDeleteColor,
    processNewColor,
    showColors
} from '../controllers/colors.js';
import { showOffline } from '../controllers/offline.js';
import { processUnsubscribe, showUnsubscribe } from '../controllers/reminders.js';
import {
    processApplyTemplate,
    processDeleteTemplate,
    processRenameTemplate,
    processSaveTemplate,
    showTemplates
} from '../controllers/templates.js';
import {
    processContract,
    processDeletePayment,
    processEditPayment,
    processNewPayment,
    processPaid,
    showEditContract,
    showEditPayment,
    showVendor
} from '../controllers/payments.js';
import {
    processAnswer,
    processDeleteDecision,
    processEditDecision,
    processNewDecision,
    processReopen,
    showDecisions,
    showEditDecision
} from '../controllers/decisions.js';

const router = Router();

// Every page of the planner works on the active wedding of a logged-in member.
const member = [requireLogin, loadActiveWedding];
const editor = [...member, requireEditor];
const owner = [...member, requireOwner];
// Account pages work with or without an active wedding (a new planner has none yet).
const account = [requireLogin, loadOptionalWedding];
const planner = [requireLogin, requirePlanner, loadOptionalWedding];

/* Public ------------------------------------------------------------------------------------- */
router.get('/login', redirectIfLoggedIn, showLoginForm);
router.post('/login', redirectIfLoggedIn, loginLimiter, processLogin);
router.get('/start', redirectIfLoggedIn, showStart);
router.get('/offline', showOffline);
router.get('/css/custom/:key.css', showCustomCss);
router.get('/register', redirectIfLoggedIn, showRegisterForm);
router.post('/register', redirectIfLoggedIn, registerLimiter, processRegister);
router.post('/logout', processLogout);
router.get('/auth/google', startGoogleLogin);
router.get('/auth/google/callback', finishGoogleLogin);
router.post('/language', processLanguage);
router.get('/invite/:token', showInvite);

/* Logged in, no wedding needed ------------------------------------------------------------------ */
router.get('/welcome', requireLogin, showWelcome);
router.post('/weddings', requireLogin, processNewWedding);
router.post('/wedding/switch', requireLogin, processSwitchWedding);
router.post('/invites/join', requireLogin, processJoinByLink);
router.post('/invite/:token/accept', requireLogin, processAcceptInvite);
router.post('/invite/:token/decline', requireLogin, processDeclineInvite);

/* Planner dashboard ---------------------------------------------------------------------------- */
router.get('/planner', planner, showPlannerDashboard);
router.post('/planner/weddings', planner, processNewClientWedding);
router.post('/planner/weddings/:id/open', planner, processOpenWedding);

/* Dashboard ----------------------------------------------------------------------------------- */
// Visitors who are not signed in get the public landing page; members fall through to their dashboard.
router.get('/', showLanding);
router.get('/', member, showDashboard);
router.post('/wedding/date', owner, processWeddingDate);

/* Decisions ----------------------------------------------------------------------------------- */
const asker = [...member, requireDecisionRight('ask')];
const answerer = [...member, requireDecisionRight('answer')];
router.get('/decisions', member, showDecisions);
router.post('/decisions', asker, processNewDecision);
router.get('/decisions/:id/edit', asker, showEditDecision);
router.post('/decisions/:id/edit', asker, processEditDecision);
router.post('/decisions/:id/reopen', asker, processReopen);
router.post('/decisions/:id/delete', asker, processDeleteDecision);
router.post('/decisions/:id/answer', answerer, processAnswer);

/* Wedding colours ------------------------------------------------------------------------------- */
router.get('/colors', member, showColors);
router.post('/colors', editor, processNewColor);
router.post('/colors/app', editor, processAppColors);
router.post('/colors/app/off', editor, processAppColorsOff);
router.post('/colors/:id/delete', editor, processDeleteColor);

/* Event-day schedule ---------------------------------------------------------------------------- */
router.get('/schedule', member, showSchedule);
router.post('/schedule', editor, processNewItem);
router.post('/schedule/template', editor, processSaveTemplate('schedule'));
router.post('/schedule/from-template', editor, processApplyTemplate('schedule'));
router.get('/schedule/:id/edit', editor, showEditItem);
router.post('/schedule/:id/edit', editor, processEditItem);
router.post('/schedule/:id/delete', editor, processDeleteItem);

/* Seating chart ------------------------------------------------------------------------------- */
router.get('/seating', member, showSeating);
router.post('/seating/tables', editor, processNewTable);
router.post('/seating/tables/:id/edit', editor, processEditTable);
router.post('/seating/tables/:id/delete', editor, processDeleteTable);
router.post('/seating/guests/:id', editor, processAssignGuest);

/* Budget -------------------------------------------------------------------------------------- */
router.get('/budget', member, showBudget);
router.post('/budget/limit', editor, processBudgetLimit);
router.post('/budget/expenses', editor, processNewExpense);
router.post('/budget/expenses/:id/delete', editor, processDeleteExpense);

/* Checklist ----------------------------------------------------------------------------------- */
router.get('/checklist', member, showChecklist);
router.post('/checklist', editor, processNewTask);
router.post('/checklist/examples', editor, processExampleTasks);
router.post('/checklist/template', editor, processSaveTemplate('checklist'));
router.post('/checklist/from-template', editor, processApplyTemplate('checklist'));
router.get('/checklist/:id/edit', editor, showEditTask);
router.post('/checklist/:id/edit', editor, processEditTask);
router.post('/checklist/:id/toggle', editor, processToggleTask);
router.post('/checklist/:id/delete', editor, processDeleteTask);

/* Guests -------------------------------------------------------------------------------------- */
router.get('/guests', member, showGuests);
router.post('/guests', editor, processNewGuest);
router.get('/guests/:id/edit', editor, showEditGuest);
router.post('/guests/:id/edit', editor, processEditGuest);
router.post('/guests/:id/rsvp', editor, processSetRsvp);
router.post('/guests/:id/delete', editor, processDeleteGuest);

/* Vendors ------------------------------------------------------------------------------------- */
router.get('/vendors', member, showVendors);
router.post('/vendors', editor, processNewVendor);
router.get('/vendors/:id/edit', editor, showEditVendor);
router.post('/vendors/:id/edit', editor, processEditVendor);
router.post('/vendors/:id/status', editor, processSetStatus);
router.post('/vendors/:id/delete', editor, processDeleteVendor);
router.get('/vendors/:id', member, showVendor);
router.get('/vendors/:id/contract', editor, showEditContract);
router.post('/vendors/:id/contract', editor, processContract);
router.post('/vendors/:id/payments', editor, processNewPayment);

/* Templates (a person's own; see models/templates.js) ------------------------------------------- */
router.get('/templates', account, showTemplates);
router.post('/templates/:id/rename', account, processRenameTemplate);
router.post('/templates/:id/delete', account, processDeleteTemplate);

/* Vendor payments --------------------------------------------------------------------------------- */
router.get('/payments/:id/edit', editor, showEditPayment);
router.post('/payments/:id/edit', editor, processEditPayment);
router.post('/payments/:id/paid', editor, processPaid);
router.post('/payments/:id/delete', editor, processDeletePayment);

/* Music --------------------------------------------------------------------------------------- */
router.get('/music', member, searchLimiter, showMusic);
router.post('/music/tracks', editor, processAddTrack);
router.post('/music/tracks/:id/delete', editor, processDeleteTrack);
router.post('/music/sections/:slug/clear', editor, processClearSection);

/* Inspiration --------------------------------------------------------------------------------- */
router.get('/inspiration', member, searchLimiter, showInspiration);
router.post('/inspiration', editor, processSavePhoto);
router.post('/inspiration/clear', editor, processClearBoard);
router.post('/inspiration/:id/delete', editor, processDeletePhoto);

/* Settings ------------------------------------------------------------------------------------ */
router.get('/settings', account, showSettings);
router.post('/settings/profile', account, processProfile);
router.post('/settings/appearance', account, processAppearance);
router.post('/settings/reminders', account, processReminders);

/* Reminder emails: the link is signed (utils/unsubscribe.js), so no sign-in and no CSRF token */
router.get('/reminders/unsubscribe', showUnsubscribe);
router.post('/reminders/unsubscribe', processUnsubscribe);
router.post('/settings/business', account, processBusiness);
router.post('/settings/become-planner', account, processBecomePlanner);
router.post('/settings/password', account, passwordLimiter, processPassword);
router.post('/settings/leave', member, processLeaveWedding);
router.post('/settings/wedding', owner, processWeddingDetails);
router.post('/settings/invites', owner, inviteLimiter, processInvite);
router.post('/settings/handover', owner, inviteLimiter, processHandover);
router.post('/settings/invites/:id/delete', owner, processRevokeInvite);
router.post('/settings/members/:userId/role', owner, processMemberRole);
router.post('/settings/members/:userId/delete', owner, processRemoveMember);

export default router;
