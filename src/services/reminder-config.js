/** Same rule as the web service (src/app.js): the secret also signs unsubscribe links. */
const SESSION_SECRET_MIN = 32;

/**
 * Settings the reminder job must share with the web service. Without the same SESSION_SECRET
 * every unsubscribe link would be rejected; without APP_URL the links would point nowhere.
 * @param {Record<string, string|undefined>} env
 * @returns {string[]} Names of missing or invalid settings (empty when ready).
 */
const reminderConfigProblems = (env) => [
    ...((env.SESSION_SECRET ?? '').length >= SESSION_SECRET_MIN ? [] : ['SESSION_SECRET']),
    ...(/^https?:\/\//.test(env.APP_URL ?? '') ? [] : ['APP_URL'])
];

/**
 * The job's exit code: a refused address is an expected, per-person failure (retried tomorrow),
 * so only a run where nothing could be sent counts as a failed job.
 * @param {{sent: number, failed: number}} result
 * @returns {0|1}
 */
const exitCodeFor = ({ sent, failed }) => (failed > 0 && sent === 0 ? 1 : 0);

export { reminderConfigProblems, exitCodeFor };
