import { MAX_PROPOSALS_PER_VENDOR } from '../constants.js';
import { findFiles } from '../models/files.js';
import { createProposal, deleteProposal, findProposal, setProposalStatus } from '../models/proposals.js';
import { findVendor, setAvailability } from '../models/vendors.js';
import { setFlash } from '../utils/flash.js';
import { isUuid } from '../validators/common.js';
import { readProposalStatus, validateAvailability, validateProposal } from '../validators/proposals.js';
import { renderVendorPage, routeVendor } from './payments.js';

/** The proposal named in the route, if it belongs to the active wedding. */
const routeProposal = (req) => (isUuid(req.params.id) ? findProposal(req.params.id, req.wedding.id) : null);

/** POST /vendors/:id/availability: free on the day, holding it until a date, or not. */
const processAvailability = async (req, res, next) => {
    const vendor = await routeVendor(req);
    if (!vendor) return next();
    const { values, data, errors } = validateAvailability(req.body);
    if (errors.length > 0)
        return renderVendorPage(req, res, vendor, { status: 400, availabilityForm: { values, errors } });
    await setAvailability(vendor.id, req.wedding.id, data);
    setFlash(req, 'success', 'vendor.availabilitySaved', { name: vendor.name });
    res.redirect(`/vendors/${vendor.id}`);
};

/** POST /vendors/:id/proposals: a quote, optionally pointing at one of this vendor's files. */
const processNewProposal = async (req, res, next) => {
    const vendor = await routeVendor(req);
    if (!vendor) return next();
    const files = await findFiles(req.wedding.id, { vendorId: vendor.id });
    const { values, data, errors } = validateProposal(
        req.body,
        files.map((file) => file.id)
    );
    if (errors.length > 0) return renderVendorPage(req, res, vendor, { status: 400, proposalForm: { values, errors } });
    const proposal = await createProposal(vendor.id, req.wedding.id, data);
    if (!proposal) {
        const limit = [{ field: 'title', key: 'proposals.limit', vars: { max: MAX_PROPOSALS_PER_VENDOR } }];
        return renderVendorPage(req, res, vendor, { status: 400, proposalForm: { values, errors: limit } });
    }
    setFlash(req, 'success', 'proposals.added', { title: proposal.title });
    res.redirect(`/vendors/${vendor.id}`);
};

/** POST /proposals/:id/status: accepted, declined, or back to received. */
const processProposalStatus = async (req, res, next) => {
    const proposal = await routeProposal(req);
    if (!proposal) return next();
    const status = readProposalStatus(req.body?.status);
    if (!status) {
        const vendor = await findVendor(proposal.vendor_id, req.wedding.id);
        res.locals.flash = { type: 'error', key: 'validation.choice' };
        return renderVendorPage(req, res, vendor, { status: 400 });
    }
    await setProposalStatus(proposal.id, req.wedding.id, status);
    setFlash(req, 'success', `proposals.marked.${status}`, { title: proposal.title });
    res.redirect(`/vendors/${proposal.vendor_id}`);
};

/** POST /proposals/:id/delete */
const processDeleteProposal = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const deleted = await deleteProposal(req.params.id, req.wedding.id);
    if (!deleted) return next();
    setFlash(req, 'success', 'proposals.removed');
    res.redirect(`/vendors/${deleted.vendor_id}`);
};

export { processAvailability, processNewProposal, processProposalStatus, processDeleteProposal };
