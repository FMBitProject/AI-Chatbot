export { db, pg } from "./security-test-db.mjs";
import { db } from "./security-test-db.mjs";
export const withTransaction = (fn) => db.transaction(fn);
export const state = { user: null, alerts: [] };
export const requireAdmin = async () => ({ ok: true, user: state.user });
export const consumeRateLimit = async () => ({ ok: true });
export const alertOps = async (alert) => { state.alerts.push(alert); };
