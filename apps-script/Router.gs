/**
 * Entry points and the permission table.
 *
 * Every request: parse → verify the Google token → look up the caller's role → check the
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

/** Which roles may call each action. Anything not listed here is refused. */
const ACTIONS = {
  me:         ['ADMIN', 'USER_W', 'USER_RO'],
  listUsers:  ['ADMIN'],
  saveUser:   ['ADMIN'],
  removeUser: ['ADMIN']
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
    case 'me':         return user;
    case 'listUsers':  return listUsers_();
    case 'saveUser':   return withLock_(() => saveUser_(payload, user));
    case 'removeUser': return withLock_(() => removeUser_(payload, user));
  }
  throw new Error('No handler for action ' + action);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
