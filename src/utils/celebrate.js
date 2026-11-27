/** Checklist milestones worth a bigger celebration, in percent. */
const MILESTONES = Object.freeze([25, 50, 75, 100]);

/**
 * What to celebrate after a task is ticked off: the new totals and the highest milestone that
 * this one task crossed (null when none).
 * @param {{done: number, total: number}} progress - After the task was marked done.
 * @returns {{done: number, total: number, milestone: number|null}}
 */
const celebrationFor = ({ done, total }) => {
    const pct = total === 0 ? 0 : (done / total) * 100;
    const before = total === 0 ? 0 : ((done - 1) / total) * 100;
    const crossed = MILESTONES.filter((mark) => before < mark && pct >= mark);
    return { done, total, milestone: crossed.at(-1) ?? null };
};

/**
 * Takes the celebration saved by the last request, so it shows exactly once.
 * @param {import('express').Request} req
 * @returns {{done: number, total: number, milestone: number|null}|null}
 */
const takeCelebration = (req) => {
    const celebration = req.session?.celebrate ?? null;
    if (celebration) delete req.session.celebrate;
    return celebration;
};

export { MILESTONES, celebrationFor, takeCelebration };
