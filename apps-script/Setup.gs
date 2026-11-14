/**
 * Run once from the editor (select "setup" → Run) after setting the Script Properties.
 * Safe to run again: it only adds missing tabs, columns and default rows.
 *
 * It creates every tab in TABS with its headers, formats them as plain text, removes the
 * empty default "Sheet1", adds the owner to Users as ADMIN, and writes default settings.
 */
function setup() {
  const owner = ownerEmail_();
  const ss = SpreadsheetApp.getActive();
  for (const [name, def] of Object.entries(TABS)) ensureTab_(ss, name, columnsOf_(def));
  removeEmptyDefaultSheet_(ss);

  const actor = { email: owner };
  withLock_(() => {
    const users = readTable_('Users');
    if (!findUserRow_(users, owner)) insertRecord_(users, { email: owner, role: 'ADMIN', active: true }, actor);

    const settings = readTable_('Settings');
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (!settings.rows.some(r => r.record.key === key)) insertRecord_(settings, { key, value }, actor);
    }
  });
}

function ensureTab_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const lastCol = sheet.getLastColumn();
  const existing = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  const missing = headers.filter(h => !existing.includes(h));
  if (missing.length) sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);

  const width = sheet.getLastColumn();
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold');
  // Plain text everywhere, so Sheets never turns ISO dates or IDs into date/number cells.
  sheet.getRange(1, 1, sheet.getMaxRows(), width).setNumberFormat('@');
}

function removeEmptyDefaultSheet_(ss) {
  const sheet = ss.getSheetByName('Sheet1');
  if (sheet && ss.getSheets().length > 1 && sheet.getLastRow() === 0 && sheet.getLastColumn() === 0) {
    ss.deleteSheet(sheet);
  }
}
