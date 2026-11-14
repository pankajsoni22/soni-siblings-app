/**
 * Types shared with the Apps Script backend (apps-script/*.gs).
 * Keep in sync with TABS in apps-script/Config.gs and ACTIONS in apps-script/Router.gs.
 */

export type Role = 'ADMIN' | 'USER_W' | 'USER_RO';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  USER_W: 'User-W',
  USER_RO: 'User-RO'
};

/** Columns the server sets on every record. The browser never writes these. */
export interface SystemFields {
  id: string;
  createdAt: string;      // ISO 8601
  createdBy: string;      // email
  updatedAt: string;      // ISO 8601; send back as expectedUpdatedAt on update
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

export type Action = 'me' | 'listUsers' | 'saveUser' | 'removeUser';

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
