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
import {
    processBudgetLimit,
    processCategoryPlan,
    processDeleteCategory,
    processDeleteExpense,
    processNewCategory,
    processNewExpense,
    processSuggestedCategories,
    showBudget
} from '../controllers/budget.js';
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
import {
    processAddLink,
    processAddTrack,
    processClearSection,
    processDeleteTrack,
    processMoveTrack,
    showMusic
} from '../controllers/music.js';
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
import {
    redirectIfLoggedIn,
    redirectIfSignedUp,
    requireLogin,
    requirePlanner,
    requireRealAccount
} from '../middleware/auth.js';
import { processTry, showTry } from '../controllers/trial.js';
import { processDeleteField, processNewField, showFields } from '../controllers/custom-fields.js';
import { processNewClientWedding, processOpenWedding, showPlannerDashboard } from '../controllers/planner.js';
import {
    inviteLimiter,
    loginLimiter,
    passwordLimiter,
    registerLimiter,
    trialLimiter,
    searchLimiter,
    uploadLimiter
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
    processAvailability,
    processDeleteProposal,
    processNewProposal,
    processProposalStatus
} from '../controllers/proposals.js';
import {
    processDeleteAppointment,
    processEditAppointment,
    processNewAppointment,
    showAppointments,
    showEditAppointment
} from '../controllers/appointments.js';
import {
    processAnswers,
    processDeleteMessage,
    processDeleteQuestionnaire,
    processDeleteSent,
    processEditMessage,
    processEditQuestionnaire,
    processNewMessage,
    processNewQuestionnaire,
    processSendQuestionnaire,
    showEditMessage,
    showEditQuestionnaire,
    showLibrary,
    showNewQuestionnaire,
    showQuestionnaires,
    showSentQuestionnaire,
    showUseMessage
} from '../controllers/library.js';
import { downloadFile, processDeleteFile, processUpload, showFiles } from '../controllers/files.js';
import { parseUpload, verifyUploadCsrf } from '../middleware/upload.js';
import { processArchive, processWrapUpTasks } from '../controllers/wrapup.js';
import { showCalendar, showSearch } from '../controllers/calendar.js';
import {
    processDeletePiece,
    processDeleteRoom,
    processEditPiece,
    processMovePiece,
    processNewFixture,
    processNewRoom,
    processPieceRoom,
    processPlaceAllTables,
    processPlaceTable,
    processRoom,
    showLayout
} from '../controllers/layout.js';
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
    processApplyWeddingTemplate,
    processDeleteTemplate,
    processRenameTemplate,
    processSaveTemplate,
    processSaveWeddingTemplate,
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
    showVendor,
    processRating,
    processClearRating
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
router.get('/login', redirectIfSignedUp, showLoginForm);
router.post('/login', redirectIfSignedUp, loginLimiter, processLogin);
router.get('/start', redirectIfSignedUp, showStart);
// The playground: anyone not signed in can start a private trial wedding.
router.get('/try', redirectIfLoggedIn, showTry);
router.post('/try', redirectIfLoggedIn, trialLimiter, processTry);
router.get('/offline', showOffline);
router.get('/css/custom/:key.css', showCustomCss);
router.get('/register', redirectIfSignedUp, showRegisterForm);
router.post('/register', redirectIfSignedUp, registerLimiter, processRegister);
router.post('/logout', processLogout);
router.get('/auth/google', startGoogleLogin);
router.get('/auth/google/callback', finishGoogleLogin);
router.post('/language', processLanguage);
router.get('/invite/:token', showInvite);

/* Logged in, no wedding needed ------------------------------------------------------------------ */
router.get('/welcome', requireLogin, showWelcome);
router.post('/weddings', requireLogin, processNewWedding);
router.post('/wedding/switch', requireLogin, processSwitchWedding);
router.post('/invites/join', requireLogin, requireRealAccount, processJoinByLink);
router.post('/invite/:token/accept', requireLogin, requireRealAccount, processAcceptInvite);
router.post('/invite/:token/decline', requireLogin, processDeclineInvite);

/* Planner dashboard ---------------------------------------------------------------------------- */
router.get('/planner', planner, showPlannerDashboard);
router.post('/planner/weddings', planner, requireRealAccount, processNewClientWedding);
router.post('/planner/weddings/:id/open', planner, processOpenWedding);

/* Dashboard ----------------------------------------------------------------------------------- */
// Visitors who are not signed in get the public landing page; members fall through to their dashboard.
router.get('/', showLanding);
router.get('/', member, showDashboard);
router.post('/wedding/date', owner, processWeddingDate);
router.post('/wedding/archive', owner, processArchive(true));
router.post('/wedding/unarchive', owner, processArchive(false));

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

/* Venue layout (member reads, editor changes) ---------------------------------------------------- */
router.get('/layout', member, showLayout);
router.post('/layout/room', editor, processRoom);
router.post('/layout/items', editor, processNewFixture);
router.post('/layout/tables', editor, processPlaceTable);
router.post('/layout/tables/all', editor, processPlaceAllTables);
router.post('/layout/rooms', editor, processNewRoom);
router.post('/layout/rooms/:id/delete', editor, processDeleteRoom);
router.post('/layout/items/:id/room', editor, processPieceRoom);
router.post('/layout/items/:id', editor, processEditPiece);
router.post('/layout/items/:id/move', editor, processMovePiece);
router.post('/layout/items/:id/delete', editor, processDeletePiece);

/* Files (member downloads, editor uploads; uploads are multipart, see middleware/upload.js) ----- */
router.get('/files', member, showFiles);
router.post('/files', editor, requireRealAccount, uploadLimiter, parseUpload, verifyUploadCsrf, processUpload);
router.get('/files/:id', member, downloadFile);
router.post('/files/:id/delete', editor, processDeleteFile);

/* Event-day schedule ---------------------------------------------------------------------------- */
router.get('/schedule', member, showSchedule);
router.post('/schedule', editor, processNewItem);
router.post('/schedule/template', editor, processSaveTemplate('schedule'));
router.post('/schedule/from-template', editor, processApplyTemplate('schedule'));
router.get('/schedule/:id/edit', editor, showEditItem);
router.post('/schedule/:id/edit', editor, processEditItem);
router.post('/schedule/:id/delete', editor, processDeleteItem);

/* Appointments -------------------------------------------------------------------------------- */
router.get('/appointments', member, showAppointments);
router.post('/appointments', editor, processNewAppointment);
router.get('/appointments/:id/edit', editor, showEditAppointment);
router.post('/appointments/:id/edit', editor, processEditAppointment);
router.post('/appointments/:id/delete', editor, processDeleteAppointment);

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
router.post('/budget/categories', editor, processNewCategory);
router.post('/budget/categories/suggested', editor, processSuggestedCategories);
router.post('/budget/categories/:id/plan', editor, processCategoryPlan);
router.post('/budget/categories/:id/delete', editor, processDeleteCategory);

/* Checklist ----------------------------------------------------------------------------------- */
router.get('/checklist', member, showChecklist);
router.post('/checklist', editor, processNewTask);
router.post('/checklist/examples', editor, processExampleTasks);
router.post('/checklist/wrap-up', editor, processWrapUpTasks);
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
router.post('/vendors/:id/rating', editor, processRating);
router.post('/vendors/:id/rating/clear', editor, processClearRating);
router.post('/vendors/:id/availability', editor, processAvailability);
router.post('/vendors/:id/proposals', editor, processNewProposal);
router.post('/proposals/:id/status', editor, processProposalStatus);
router.post('/proposals/:id/delete', editor, processDeleteProposal);

/* Custom fields on guests, vendors and tasks (member reads, editor changes) --------------------- */
router.get('/fields', member, showFields);
router.post('/fields', editor, processNewField);
router.post('/fields/:id/delete', editor, processDeleteField);

/* Templates (a person's own; see models/templates.js) ------------------------------------------- */
router.get('/templates', account, showTemplates);
router.post('/templates/wedding', editor, processSaveWeddingTemplate);
router.post('/templates/:id/apply', editor, processApplyWeddingTemplate);

/* Messages and questionnaires library (account: a person's own; using one needs a wedding).
   Sending and removing questionnaires is asking (the planner); answering is the couple's. ---- */
router.get('/library', account, showLibrary);
router.post('/library/messages', account, processNewMessage);
router.get('/library/messages/:id/edit', account, showEditMessage);
router.post('/library/messages/:id/edit', account, processEditMessage);
router.post('/library/messages/:id/delete', account, processDeleteMessage);
router.get('/library/messages/:id/use', editor, showUseMessage);
router.get('/library/questionnaires/new', account, showNewQuestionnaire);
router.post('/library/questionnaires', account, processNewQuestionnaire);
router.get('/library/questionnaires/:id/edit', account, showEditQuestionnaire);
router.post('/library/questionnaires/:id/edit', account, processEditQuestionnaire);
router.post('/library/questionnaires/:id/delete', account, processDeleteQuestionnaire);
router.get('/questionnaires', member, showQuestionnaires);
router.post('/questionnaires/send', asker, processSendQuestionnaire);
router.get('/questionnaires/:id', member, showSentQuestionnaire);
router.post('/questionnaires/:id/answers', answerer, processAnswers);
router.post('/questionnaires/:id/delete', asker, processDeleteSent);
router.get('/calendar', account, showCalendar);
router.get('/search', account, searchLimiter, showSearch);
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
router.post('/music/links', editor, processAddLink);
router.post('/music/tracks/:id/move', editor, processMoveTrack);
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
router.post('/settings/become-planner', account, requireRealAccount, processBecomePlanner);
router.post('/settings/password', account, requireRealAccount, passwordLimiter, processPassword);
router.post('/settings/leave', member, processLeaveWedding);
router.post('/settings/wedding', owner, processWeddingDetails);
router.post('/settings/invites', owner, requireRealAccount, inviteLimiter, processInvite);
router.post('/settings/handover', owner, requireRealAccount, inviteLimiter, processHandover);
router.post('/settings/invites/:id/delete', owner, processRevokeInvite);
router.post('/settings/members/:userId/role', owner, processMemberRole);
router.post('/settings/members/:userId/delete', owner, processRemoveMember);

export default router;
