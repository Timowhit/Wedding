import { VENDOR_CATEGORIES, VENDOR_STATUSES, RATING_MAX } from '../constants.js';
import { findVendorMoney } from '../models/payments.js';
import {
    countVendorPayments,
    createVendor,
    deleteVendor,
    findVendor,
    findVendors,
    updateVendor,
    updateVendorStatus
} from '../models/vendors.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { isUuid, readChoice } from '../validators/common.js';
import { validateVendor } from '../validators/planning.js';

const EMPTY_VENDOR = {
    name: '',
    category: VENDOR_CATEGORIES[0],
    phone: '',
    email: '',
    website: '',
    status: VENDOR_STATUSES[0],
    notes: ''
};

/** Turns a vendor row into form values (nulls become empty strings). */
const toFormValues = (vendor) =>
    Object.fromEntries(Object.keys(EMPTY_VENDOR).map((field) => [field, vendor[field] ?? '']));

const renderVendors = async (req, res, { status = 200, vendorForm } = {}) => {
    const activeStatus = readChoice(req.query.status, VENDOR_STATUSES);
    const [vendors, money, paymentCounts] = await Promise.all([
        findVendors(req.wedding.id, activeStatus),
        findVendorMoney(req.wedding.id),
        countVendorPayments(req.wedding.id)
    ]);

    res.status(status).render('vendors', {
        title: req.t('vendors.title'),
        vendors,
        money,
        paymentCounts,
        categories: VENDOR_CATEGORIES,
        statuses: VENDOR_STATUSES,
        ratingMax: RATING_MAX,
        activeStatus,
        vendorForm: vendorForm ?? { values: EMPTY_VENDOR, errors: [] }
    });
};

const renderEditVendor = (req, res, { status = 200, id, values, errors = [] }) =>
    res.status(status).render('edit-vendor', {
        title: req.t('vendors.editTitle'),
        formAction: `/vendors/${id}/edit`,
        categories: VENDOR_CATEGORIES,
        statuses: VENDOR_STATUSES,
        values,
        errors
    });

const showVendors = (req, res) => renderVendors(req, res);

const processNewVendor = async (req, res) => {
    const { values, data, errors } = validateVendor(req.body);
    if (errors.length > 0) return renderVendors(req, res, { status: 400, vendorForm: { values, errors } });

    const vendor = await createVendor(req.wedding.id, data);
    setFlash(req, 'success', 'vendors.added', { name: vendor.name });
    res.redirect(backTo(req, '/vendors'));
};

const showEditVendor = async (req, res, next) => {
    const vendor = isUuid(req.params.id) ? await findVendor(req.params.id, req.wedding.id) : null;
    if (!vendor) return next();
    renderEditVendor(req, res, { id: vendor.id, values: toFormValues(vendor) });
};

const processEditVendor = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const { values, data, errors } = validateVendor(req.body);
    if (errors.length > 0) return renderEditVendor(req, res, { status: 400, id: req.params.id, values, errors });

    const updated = await updateVendor(req.params.id, req.wedding.id, data);
    if (!updated) return next();
    setFlash(req, 'success', 'vendors.saved', { name: updated.name });
    res.redirect(backTo(req, '/vendors'));
};

/** The status picker on each row: sets the chosen booking status. */
const processSetStatus = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const status = readChoice(req.body?.status, VENDOR_STATUSES);
    if (!status) {
        setFlash(req, 'error', 'validation.choice');
        return res.redirect(backTo(req, '/vendors'));
    }
    const vendor = await updateVendorStatus(req.params.id, req.wedding.id, status);
    if (!vendor) return next();
    setFlash(req, 'success', 'vendors.statusSaved', { name: vendor.name });
    res.redirect(backTo(req, '/vendors'));
};

const processDeleteVendor = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteVendor(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'vendors.removed');
    res.redirect(backTo(req, '/vendors'));
};

export { showVendors, processNewVendor, showEditVendor, processEditVendor, processSetStatus, processDeleteVendor };
