import { RATING_MAX, VENDOR_STATUSES } from '../constants.js';
import {
    createPayment,
    deletePayment,
    findPayment,
    findPayments,
    findVendorMoney,
    setPaymentPaid,
    updatePayment
} from '../models/payments.js';
import { findVendor, rateVendor, updateContract } from '../models/vendors.js';
import { setFlash } from '../utils/flash.js';
import { toIsoDate } from '../utils/format.js';
import { todayIso } from '../utils/today.js';
import { isUuid } from '../validators/common.js';
import { validateContract, validatePayment } from '../validators/payments.js';
import { validateRating } from '../validators/wrapup.js';

const EMPTY_PAYMENT = { label: '', amount: '', due_date: '', paid_on: '', note: '' };

/** The vendor named in the route, if it belongs to the active wedding. */
const routeVendor = (req) => (isUuid(req.params.id) ? findVendor(req.params.id, req.wedding.id) : null);

/** The payment named in the route, if it belongs to the active wedding. */
const routePayment = (req) => (isUuid(req.params.id) ? findPayment(req.params.id, req.wedding.id) : null);

const contractValues = (vendor) => ({
    contract_total: vendor.contract_total === null ? '' : String(vendor.contract_total),
    contract_signed_on: toIsoDate(vendor.contract_signed_on),
    contract_url: vendor.contract_url ?? '',
    contract_includes: vendor.contract_includes ?? '',
    contract_cancellation: vendor.contract_cancellation ?? ''
});

const paymentValues = (payment) => ({
    label: payment.label ?? '',
    amount: String(payment.amount),
    due_date: toIsoDate(payment.due_date),
    paid_on: toIsoDate(payment.paid_on),
    note: payment.note ?? ''
});

const renderVendorPage = async (req, res, vendor, { status = 200, paymentForm, ratingForm } = {}) => {
    const today = todayIso();
    const [payments, money] = await Promise.all([
        findPayments(vendor.id, req.wedding.id),
        findVendorMoney(req.wedding.id, today)
    ]);
    res.status(status).render('vendor', {
        title: vendor.name,
        vendor,
        statuses: VENDOR_STATUSES,
        payments,
        money: money.get(vendor.id),
        today,
        paymentForm: paymentForm ?? { values: EMPTY_PAYMENT, errors: [] },
        ratingForm: ratingForm ?? {
            values: { rating: vendor.rating ? String(vendor.rating) : '', review: vendor.review ?? '' },
            errors: []
        },
        ratingMax: RATING_MAX
    });
};

/** POST /vendors/:id/rating: stars and a note after the wedding. */
const processRating = async (req, res, next) => {
    const vendor = await routeVendor(req);
    if (!vendor) return next();
    const { values, data, errors } = validateRating(req.body);
    if (errors.length > 0) return renderVendorPage(req, res, vendor, { status: 400, ratingForm: { values, errors } });
    await rateVendor(vendor.id, req.wedding.id, data);
    setFlash(req, 'success', 'wrapup.rated', { name: vendor.name });
    res.redirect(`/vendors/${vendor.id}`);
};

/** GET /vendors/:id: the vendor with its contract and payments. */
const showVendor = async (req, res, next) => {
    const vendor = await routeVendor(req);
    if (!vendor) return next();
    await renderVendorPage(req, res, vendor);
};

const renderContractForm = (req, res, vendor, { status = 200, values, errors = [] }) =>
    res.status(status).render('edit-contract', {
        title: req.t('contract.editTitle', { name: vendor.name }),
        vendor,
        values,
        errors
    });

const showEditContract = async (req, res, next) => {
    const vendor = await routeVendor(req);
    if (!vendor) return next();
    renderContractForm(req, res, vendor, { values: contractValues(vendor) });
};

const processContract = async (req, res, next) => {
    const vendor = await routeVendor(req);
    if (!vendor) return next();
    const { values, data, errors } = validateContract(req.body);
    if (errors.length > 0) return renderContractForm(req, res, vendor, { status: 400, values, errors });

    await updateContract(vendor.id, req.wedding.id, data);
    const cleared = Object.values(data).every((value) => value === null);
    setFlash(req, 'success', cleared ? 'contract.cleared' : 'contract.saved', { name: vendor.name });
    res.redirect(`/vendors/${vendor.id}`);
};

const processNewPayment = async (req, res, next) => {
    const vendor = await routeVendor(req);
    if (!vendor) return next();
    const { values, data, errors } = validatePayment(req.body);
    if (errors.length > 0) return renderVendorPage(req, res, vendor, { status: 400, paymentForm: { values, errors } });

    if (!(await createPayment(vendor.id, req.wedding.id, data))) return next();
    setFlash(req, 'success', 'payments.added', { name: vendor.name });
    res.redirect(`/vendors/${vendor.id}`);
};

const renderEditPayment = async (req, res, payment, { status = 200, values, errors = [] }) => {
    const vendor = await findVendor(payment.vendor_id, req.wedding.id);
    res.status(status).render('edit-payment', {
        title: req.t('payments.editTitle'),
        formAction: `/payments/${payment.id}/edit`,
        vendor,
        values,
        errors
    });
};

const showEditPayment = async (req, res, next) => {
    const payment = await routePayment(req);
    if (!payment) return next();
    await renderEditPayment(req, res, payment, { values: paymentValues(payment) });
};

const processEditPayment = async (req, res, next) => {
    const payment = await routePayment(req);
    if (!payment) return next();
    const { values, data, errors } = validatePayment(req.body);
    if (errors.length > 0) return renderEditPayment(req, res, payment, { status: 400, values, errors });

    await updatePayment(payment.id, req.wedding.id, data);
    setFlash(req, 'success', 'payments.saved');
    res.redirect(`/vendors/${payment.vendor_id}`);
};

/** "Mark paid" records today's date (in APP_TIME_ZONE); "Mark unpaid" clears it. */
const processPaid = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const paid = req.body.paid === '1';
    const payment = await setPaymentPaid(req.params.id, req.wedding.id, paid ? todayIso() : null);
    if (!payment) return next();
    setFlash(req, 'success', paid ? 'payments.markedPaid' : 'payments.markedUnpaid');
    res.redirect(`/vendors/${payment.vendor_id}`);
};

const processDeletePayment = async (req, res, next) => {
    const deleted = isUuid(req.params.id) ? await deletePayment(req.params.id, req.wedding.id) : null;
    if (!deleted) return next();
    setFlash(req, 'success', 'payments.deleted');
    res.redirect(`/vendors/${deleted.vendor_id}`);
};

export {
    showVendor,
    processRating,
    showEditContract,
    processContract,
    processNewPayment,
    showEditPayment,
    processEditPayment,
    processPaid,
    processDeletePayment
};
