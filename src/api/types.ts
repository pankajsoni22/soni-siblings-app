/**
 * Types shared with the Apps Script backend (apps-script/Code.gs).
 * Keep `Entities` in sync with ENTITIES there: same names, same fields.
 * Optional fields come back as `null` when empty; optional booleans come back as `false`.
 */
export interface Entities {
  Items: {
    title: string;
    status: 'Open' | 'Done';
  };
}

export type EntityName = keyof Entities;

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

export type StoredRecord<E extends EntityName> = Entities[E] & SystemFields;

/** The signed-in user, as verified by the backend. */
export interface Me {
  email: string;
  name: string;
  isAdmin: boolean;
}

export type Action = 'me' | 'list' | 'get' | 'create' | 'update' | 'delete' | 'restore';

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
