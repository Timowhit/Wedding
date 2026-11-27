/** Checklist milestones worth a bigger celebration, in percent. */
const MILESTONES = Object.freeze([25, 50, 75, 100]);

/**
 * What to celebrate after a task is ticked off: the new totals, the rounded percentage (as the
 * badge shows it) and the highest milestone that this one task crossed (null when none).
 * @param {{done: number, total: number}} progress - After the task was marked done.
 * @returns {{done: number, total: number, pct: number, milestone: number|null}}
 */
const celebrationFor = ({ done, total }) => {
    const percent = (count) => (total === 0 ? 0 : Math.round((count / total) * 100));
    const pct = percent(done);
    const before = percent(done - 1);
    const crossed = MILESTONES.filter((mark) => before < mark && pct >= mark);
    return { done, total, pct, milestone: crossed.at(-1) ?? null };
};

/**
 * Takes the saved celebration for the page being rendered, so it shows exactly once and only
 * where it belongs: a page the person opened (not the offline worker saving pages in the
 * background, which marks its requests with X-FP-Background) in the wedding where the task was
 * ticked.
 * @param {import('express').Request} req
 * @param {string|undefined} weddingId - The wedding of the page being rendered.
 * @returns {{done: number, total: number, pct: number, milestone: number|null}|null}
 */
const takeCelebration = (req, weddingId) => {
    const celebration = req.session?.celebrate ?? null;
    if (!celebration || celebration.weddingId !== weddingId || req.get('x-fp-background')) return null;
    delete req.session.celebrate;
    return celebration;
};

export { MILESTONES, celebrationFor, takeCelebration };
