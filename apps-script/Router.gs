/**
 * Entry points and the permission table.
 *
 * Every request: parse → verify the session or Google token → look up the caller's role → check the
 * role may call the action → run the handler. Writes run under the script lock.
 *
 * Deploy: Execute as "Me", Who has access "Anyone". Ship changes with
 * `npm run push:backend`, then Deploy → Manage deployments → pencil → New version.
 */

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Which roles may call each action. Anything not listed here is refused.
 * restoreTransaction is further limited in its handler: User-W only for their own delete,
 * within the undo window.
 */
const ACTIONS = {
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

function doPost(e) {
  try {
    let req;
    try { req = JSON.parse(e.postData.contents); }
    catch (_) { throw new ApiError('VALIDATION', 'Request body must be JSON'); }
    if (!req || typeof req !== 'object') throw new ApiError('VALIDATION', 'Request body must be a JSON object');

    const user = authenticate_(req.token);
    const action = req.action;
    if (typeof action !== 'string' || !has_(ACTIONS, action)) {
      throw new ApiError('VALIDATION', 'Unknown action: ' + action);
    }
    if (!ACTIONS[action].includes(user.role)) {
      throw new ApiError('FORBIDDEN', 'Your role cannot do this');
    }
    const payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
    return json_({ ok: true, data: dispatch_(action, payload, user) });
  } catch (err) {
    const code = err.code || 'SERVER';
    if (code === 'SERVER') console.error(err.stack || err);
    return json_({ ok: false, error: { code, message: code === 'SERVER' ? 'Server error' : err.message } });
  }
}

function doGet() {
  return json_({ ok: true, data: 'API is running' });
}

function dispatch_(action, payload, user) {
  switch (action) {
    case 'me':                 return { email: user.email, name: user.name, role: user.role, isOwner: user.isOwner };
    case 'startSession':       return startSession_(user);
    case 'sync':               return sync_(payload, user);
    case 'getConfig':          return getConfig_();
    case 'listTransactions':   return listTransactions_(payload, user);
    case 'getTransaction':     return getTransaction_(payload);
    case 'report':             return report_(payload);
    case 'saveTransaction':    return withLock_(() => saveTransaction_(payload, user));
    case 'setRepaid':          return withLock_(() => setRepaid_(payload, user));
    case 'deleteTransaction':  return withLock_(() => deleteTransaction_(payload, user));
    case 'restoreTransaction': return withLock_(() => restoreTransaction_(payload, user));
    case 'getHistory':         return getHistory_(payload);
    case 'listPartners':       return listPartners_();
    case 'savePartners':       return withLock_(() => savePartners_(payload, user));
    case 'saveSettings':       return withLock_(() => saveSettings_(payload, user));
    case 'listUsers':          return listUsers_();
    case 'saveUser':           return withLock_(() => saveUser_(payload, user));
    case 'removeUser':         return withLock_(() => removeUser_(payload, user));
  }
  throw new Error('No handler for action ' + action);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
