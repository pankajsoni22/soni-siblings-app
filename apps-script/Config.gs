/**
 * Schema and constants shared by every backend file.
 *
 * Only plain data lives at the top level of any .gs file. Apps Script loads the files one after
 * another, so top-level code must never depend on something defined in another file. Functions
 * may call each other freely, because they only run after every file has loaded.
 *
 * Keep the tabs and fields in sync with src/api/types.ts.
 */

const ROLES = ['ADMIN', 'USER_W', 'USER_RO'];
const REPAID_STATUSES = ['PENDING', 'REPAID'];

/** Columns the server owns on every `system` tab. The browser never writes these. */
const SYSTEM_FIELDS = ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deleted', 'deletedAt', 'deletedBy'];

/**
 * One entry per Sheet tab. `system: true` tabs start with SYSTEM_FIELDS, then their own fields.
 * Tabs without system fields name their unique `key` column.
 *
 * Field types: string {max}, number {min, max, integer}, boolean, enum {values},
 * date (YYYY-MM-DD), email, url. Common options: required, default.
 */
const TABS = {
  Users: {
    system: true,
    fields: {
      email:  { type: 'email', required: true },
      role:   { type: 'enum', values: ROLES, required: true },
      active: { type: 'boolean', default: true }
    }
  },
  Partners: {
    system: true,
    fields: {
      name:            { type: 'string', required: true, max: 60 },
      defaultSharePct: { type: 'number', required: true, min: 0, max: 100 },
      active:          { type: 'boolean', default: true },
      sortOrder:       { type: 'number', integer: true, min: 0, default: 0 }
    }
  },
  Transactions: {
    system: true,
    fields: {
      txnDate:           { type: 'date', required: true },
      customerName:      { type: 'string', required: true, max: 100 },
      amount:            { type: 'number', required: true, min: 0.01 },
      commissionRatePct: { type: 'number', required: true, min: 0, max: 100 },
      commission:        { type: 'number', min: 0 },
      repaidStatus:      { type: 'enum', values: REPAID_STATUSES, required: true, default: 'PENDING' },
      notes:             { type: 'string', max: 500 }
    }
  },
  Shares: {
    system: true,
    fields: {
      transactionId: { type: 'string', required: true, max: 64 },
      partnerId:     { type: 'string', required: true, max: 64 },
      partnerName:   { type: 'string', required: true, max: 60 },
      sharePct:      { type: 'number', required: true, min: 0, max: 100 },
      earning:       { type: 'number', min: 0 }
    }
  },
  Settings: {
    system: false,
    key: 'key',
    fields: {
      key:   { type: 'string', required: true, max: 64 },
      value: { type: 'string', max: 1000 }
    }
  },
  AuditLog: {
    system: false,
    key: 'timestamp',
    fields: {
      timestamp: { type: 'string' },
      email:     { type: 'string' },
      action:    { type: 'string' },     // create, update, delete, restore
      entity:    { type: 'string' },
      recordId:  { type: 'string' },
      changes:   { type: 'string', max: 49000 }   // old and new values as JSON
    }
  }
};

const AUDIT_TAB = 'AuditLog';

/** Written to the Settings tab by `setup` when missing. Values are stored as text. */
const DEFAULT_SETTINGS = {
  defaultCommissionRatePct: '0.30'
};
