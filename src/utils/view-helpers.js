/**
 * Small helpers exposed to every view (registered in app.js). They return HTML strings, so
 * they escape everything they output and are the only things views print with <%- %>.
 */

const escapeHtml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

/**
 * Escapes text, then turns *word* into <em>word</em> (used for the decorative page headings).
 * @param {string} text - A translation string.
 * @returns {string} Safe HTML.
 */
const emphasize = (text) => escapeHtml(text).replace(/\*([^*]+)\*/g, '<em>$1</em>');

/**
 * Accessibility attributes for an input: aria-invalid when its field has an error, and an
 * aria-describedby that points at the form's error summary and/or the field's own hint.
 * @param {Array<{field: string}>} errors
 * @param {string} field
 * @param {string} [errorsId] - id of the form's error summary.
 * @param {string} [hintId] - id of a hint that always describes the field.
 * @returns {string} Safe HTML attributes, or ''.
 */
const fieldState = (errors, field, errorsId = 'form-errors', hintId = '') => {
    const invalid = Boolean(errors?.some((error) => error.field === field));
    const describedBy = [hintId, invalid ? errorsId : ''].filter(Boolean).join(' ');
    return [invalid ? 'aria-invalid="true"' : '', describedBy ? `aria-describedby="${escapeHtml(describedBy)}"` : '']
        .filter(Boolean)
        .join(' ');
};

export { escapeHtml, emphasize, fieldState };
