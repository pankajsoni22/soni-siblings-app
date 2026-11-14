/**
 * Managing who can sign in. Admin only (see ACTIONS in Router.gs).
 *
 * Users are never deleted: removing someone sets active = false, and adding the same email
 * again reactivates that row, so the history of each person stays in one place.
 */

/** All users, owner first, then active ones, then by email. */
function listUsers_() {
  const owner = ownerEmail_();
  const users = readTable_('Users').rows
    .map(r => r.record)
    .filter(u => !u.deleted)
    .map(u => Object.assign({}, u, { isOwner: u.email === owner }));

  // The owner is an admin even if their row was removed from the Sheet by hand.
  if (!users.some(u => u.isOwner)) users.push({ email: owner, role: 'ADMIN', active: true, isOwner: true });

  return users.sort((a, b) =>
    Number(b.isOwner) - Number(a.isOwner) ||
    Number(b.active) - Number(a.active) ||
    a.email.localeCompare(b.email));
}

/** Adds a person, or changes their role and reactivates them. Payload: { email, role }. */
function saveUser_(p, actor) {
  const data = validate_(TABS.Users, { email: p.email, role: p.role, active: true }, null);
  if (data.email === ownerEmail_() && data.role !== 'ADMIN') {
    throw new ApiError('VALIDATION', 'The owner is always an admin');
  }

  const table = readTable_('Users');
  const row = findUserRow_(table, data.email);
  const rec = row
    ? updateRecord_(table, row, { role: data.role, active: true }, actor)
    : insertRecord_(table, data, actor);
  return withOwnerFlag_(rec);
}

/** Ends a person's access on their next request. Payload: { email }. */
function removeUser_(p, actor) {
  const email = checkField_('email', TABS.Users.fields.email, p.email);
  if (email === ownerEmail_()) throw new ApiError('VALIDATION', 'The owner cannot be removed');

  const table = readTable_('Users');
  const row = findUserRow_(table, email);
  if (!row) throw new ApiError('NOT_FOUND', 'No user with that email');
  if (!row.record.active) return withOwnerFlag_(row.record);
  return withOwnerFlag_(updateRecord_(table, row, { active: false }, actor));
}

/** The one row for an email, active or not. */
function findUserRow_(table, email) {
  return table.rows.find(r => r.record.email === email && !r.record.deleted) || null;
}

function withOwnerFlag_(user) {
  return Object.assign({}, user, { isOwner: user.email === ownerEmail_() });
}
