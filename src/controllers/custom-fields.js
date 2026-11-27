import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, MAX_CUSTOM_FIELDS } from '../constants.js';
import { addCustomField, deleteCustomField, findCustomFields } from '../models/custom-fields.js';
import { setFlash } from '../utils/flash.js';
import { isUuid } from '../validators/common.js';
import { validateCustomField, validateCustomValues } from '../validators/custom-fields.js';

const EMPTY_FIELD = Object.freeze({ entity: 'guest', label: '', type: 'text', options: '' });

const renderFields = async (req, res, { status = 200, fieldForm } = {}) => {
    const fields = await findCustomFields(req.wedding.id);
    res.status(status).render('fields', {
        title: req.t('fields.title'),
        groups: CUSTOM_FIELD_ENTITIES.map((entity) => ({
            entity,
            fields: fields.filter((field) => field.entity === entity)
        })),
        entities: CUSTOM_FIELD_ENTITIES,
        types: CUSTOM_FIELD_TYPES,
        maxFields: MAX_CUSTOM_FIELDS,
        fieldForm: fieldForm ?? { values: EMPTY_FIELD, errors: [] }
    });
};

/** GET /fields: the wedding's custom fields for guests, vendors and tasks. */
const showFields = (req, res) => renderFields(req, res);

/** POST /fields: adds a field. */
const processNewField = async (req, res) => {
    const { values, data, errors } = validateCustomField(req.body);
    if (errors.length === 0) {
        const outcome = await addCustomField(req.wedding.id, data);
        if (outcome === 'added') {
            setFlash(req, 'success', 'fields.added', { label: data.label });
            return res.redirect('/fields');
        }
        errors.push(
            outcome === 'exists'
                ? { field: 'label', key: 'fields.labelTaken' }
                : { field: 'label', key: 'fields.limit', vars: { max: MAX_CUSTOM_FIELDS } }
        );
    }
    return renderFields(req, res, { status: 400, fieldForm: { values, errors } });
};

/** POST /fields/:id/delete: the field and its values go. */
const processDeleteField = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteCustomField(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'fields.deleted');
    res.redirect('/fields');
};

/**
 * Reads a guest, vendor or task form's custom values, checked against this wedding's fields.
 * @param {import('express').Request} req
 * @param {'guest'|'vendor'|'task'} entity
 * @returns {Promise<{fields: Array<Object>, values: Object<string, string>, data: Object, errors: Array}>}
 */
const readCustomForm = async (req, entity) => {
    const fields = await findCustomFields(req.wedding.id, entity);
    return { fields, ...validateCustomValues(req.body, fields) };
};

export { showFields, processNewField, processDeleteField, readCustomForm };
