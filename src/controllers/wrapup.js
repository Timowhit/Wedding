import { WRAPUP_TASKS } from '../constants.js';
import { addChecklistItems } from '../models/templates.js';
import { setWeddingArchived } from '../models/weddings.js';
import { setFlash } from '../utils/flash.js';
import { toIsoDate } from '../utils/format.js';
import { dueDateFrom } from '../validators/templates.js';

/** POST /checklist/wrap-up: adds the after-the-wedding tasks, dated from the wedding day. */
const processWrapUpTasks = async (req, res) => {
    const weddingIso = toIsoDate(req.wedding.wedding_date) || null;
    const items = WRAPUP_TASKS.map(({ key, daysAfter }) => ({
        text: req.t(key),
        category: 'Other',
        dueDate: dueDateFrom(weddingIso, -daysAfter)
    }));
    const { added } = await addChecklistItems(req.wedding.id, items);
    if (added > 0) setFlash(req, 'success', 'wrapup.tasksAdded', { count: added });
    else setFlash(req, 'info', 'wrapup.tasksNone');
    res.redirect('/');
};

/** POST /wedding/archive and /wedding/unarchive (owner). */
const processArchive = (archived) => async (req, res) => {
    await setWeddingArchived(req.wedding.id, archived);
    setFlash(req, 'success', archived ? 'wrapup.archived' : 'wrapup.unarchived', { name: req.wedding.name });
    res.redirect('/');
};

export { processWrapUpTasks, processArchive };
