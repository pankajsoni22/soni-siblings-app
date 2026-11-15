import type { Action, Role } from '../api/types.ts';

/**
 * Which roles may call each action. A copy of ACTIONS in apps-script/Router.gs, used only to
 * decide what to show: the server enforces the real rules on every request.
 * apps-script/test/sync.test.cjs fails if the two tables differ.
 */
export const PERMISSIONS: Record<Action, readonly Role[]> = {
  me:                 ['ADMIN', 'USER_W', 'USER_RO'],
  startSession:       ['ADMIN', 'USER_W', 'USER_RO'],
  sync:               ['ADMIN', 'USER_W', 'USER_RO'],
  getConfig:          ['ADMIN', 'USER_W', 'USER_RO'],
  listTransactions:   ['ADMIN', 'USER_W', 'USER_RO'],
  getTransaction:     ['ADMIN', 'USER_W', 'USER_RO'],
  report:             ['ADMIN', 'USER_W', 'USER_RO'],
  saveTransaction:    ['ADMIN', 'USER_W'],
  setRepaid:          ['ADMIN', 'USER_W'],
  deleteTransaction:  ['ADMIN', 'USER_W'],
  restoreTransaction: ['ADMIN', 'USER_W'],
  getHistory:         ['ADMIN'],
  listPartners:       ['ADMIN'],
  savePartners:       ['ADMIN'],
  saveSettings:       ['ADMIN'],
  listUsers:          ['ADMIN'],
  saveUser:           ['ADMIN'],
  removeUser:         ['ADMIN']
};

export function can(role: Role | null | undefined, action: Action): boolean {
  return role != null && PERMISSIONS[action].includes(role);
}
