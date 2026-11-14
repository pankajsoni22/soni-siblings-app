/**
 * Types shared with the Apps Script backend (apps-script/*.gs).
 * Keep in sync with TABS in apps-script/Config.gs and ACTIONS in apps-script/Router.gs;
 * apps-script/test/sync.test.cjs checks the action list and permissions.
 *
 * Money is in rupees with up to 2 decimals. Dates are 'YYYY-MM-DD' (India time);
 * timestamps are ISO 8601.
 */

export type Role = 'ADMIN' | 'USER_W' | 'USER_RO';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  USER_W: 'User-W',
  USER_RO: 'User-RO'
};

export type RepaidStatus = 'PENDING' | 'REPAID';

export const REPAID_LABELS: Record<RepaidStatus, string> = {
  PENDING: 'Pending',
  REPAID: 'Repaid'
};

/** Columns the server sets on every record. The browser never writes these. */
export interface SystemFields {
  id: string;
  createdAt: string;
  createdBy: string;      // email
  updatedAt: string;      // send back as expectedUpdatedAt on update
  updatedBy: string;
  deleted: boolean;
  deletedAt: string;      // '' when not deleted
  deletedBy: string;
}

/** The signed-in user, as verified by the backend. */
export interface Me {
  email: string;
  name: string;
  role: Role;
  isOwner: boolean;
}

/** A row of the Users tab. The owner may appear without system fields if their row was removed by hand. */
export interface AppUser extends Partial<SystemFields> {
  email: string;
  role: Role;
  active: boolean;
  isOwner: boolean;
}

export interface Partner extends SystemFields {
  name: string;
  defaultSharePct: number;
  active: boolean;
  sortOrder: number;
}

/** What savePartners takes, in display order. Omit id for a new partner. */
export interface PartnerInput {
  id?: string;
  name: string;
  defaultSharePct: number;
  active: boolean;
}

/** Everything the transaction form needs on load. */
export interface AppConfig {
  defaultCommissionRatePct: number;
  rateWarningAbovePct: number;
  /** Active partners in partner order. */
  partners: Pick<Partner, 'id' | 'name' | 'defaultSharePct' | 'sortOrder'>[];
  /** Today in India time, from the server. */
  today: string;
}

export interface Share {
  partnerId: string;
  partnerName: string;     // copied at save time
  sharePct: number;
  earning: number;
}

export interface Transaction extends SystemFields {
  txnDate: string;
  customerName: string;
  amount: number;
  commissionRatePct: number;
  commission: number;      // calculated by the server
  repaidStatus: RepaidStatus;
  notes: string | null;
  /** In partner order. */
  shares: Share[];
}

/** The fields a user enters. Commission and earnings are always recalculated by the server. */
export interface TransactionInput {
  txnDate: string;
  customerName: string;
  amount: number;
  commissionRatePct: number;
  repaidStatus: RepaidStatus;
  notes: string;
}

export interface ShareInput {
  partnerId: string;
  sharePct: number;
}

export interface DeleteResult {
  id: string;
  deletedAt: string;
  deletedBy: string;
}

export interface HistoryEntry {
  timestamp: string;
  email: string;
  action: 'create' | 'update' | 'delete' | 'restore';
  /** create: { new: {...} }; others: { field: { old, new } } */
  changes: Record<string, unknown>;
}

export interface Report {
  from: string;
  to: string;
  totals: {
    lent: number;
    commission: number;
    count: number;
    /** null when nothing was lent in the period */
    averageRatePct: number | null;
    pendingAmount: number;
    pendingCount: number;
  };
  /** Active partners (even at zero), then inactive partners who earned in the period. */
  byPartner: { partnerId: string; partnerName: string; active: boolean; earning: number }[];
  /** Every month the period touches, oldest first. 'YYYY-MM'. */
  byMonth: { month: string; lent: number; commission: number; count: number }[];
}

export type Action =
  | 'me' | 'getConfig' | 'listTransactions' | 'report'
  | 'saveTransaction' | 'setRepaid' | 'deleteTransaction' | 'restoreTransaction'
  | 'getHistory' | 'listPartners' | 'savePartners' | 'saveSettings'
  | 'listUsers' | 'saveUser' | 'removeUser';

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'SERVER'
  | 'NETWORK';      // client-side only: the request never reached the server

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ApiErrorCode; message: string } };
