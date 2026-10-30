// In-memory state for the victim site. Everything lives in process memory and
// resets when the server restarts; this is a demo, not a real account system.
import { randomUUID } from "node:crypto";

export type Account = {
  username: string;
  password: string;
  /** false once the account has been deleted via the 退会 (withdraw) button. */
  exists: boolean;
  /** ISO timestamp of the most recent deletion, or null if the account is active. */
  deletedAt: string | null;
  /** How many times this account has been deleted across the demo session. */
  deleteCount: number;
};

// A single seeded demo account. Credentials are shown on the login page on
// purpose so anyone can reproduce the demo.
const account: Account = {
  username: "alice",
  password: "password123",
  exists: true,
  deletedAt: null,
  deleteCount: 0,
};

// sessionId -> username
const sessions = new Map<string, string>();

export const getAccount = (): Account => account;

export const checkCredentials = (username: string, password: string): boolean =>
  account.exists && username === account.username && password === account.password;

export const createSession = (username: string): string => {
  const id = randomUUID();
  sessions.set(id, username);
  return id;
};

export const getSessionUser = (sessionId: string | undefined): string | undefined =>
  sessionId ? sessions.get(sessionId) : undefined;

export const destroySession = (sessionId: string | undefined): void => {
  if (sessionId) sessions.delete(sessionId);
};

/** Delete the account. Returns false if it was already gone. */
export const deleteAccount = (): boolean => {
  if (!account.exists) return false;
  account.exists = false;
  account.deletedAt = new Date().toISOString();
  account.deleteCount += 1;
  // Every session is now invalid, just like a real deletion would log you out.
  sessions.clear();
  return true;
};

/** Restore the account so the demo can be run again. */
export const resetAccount = (): void => {
  account.exists = true;
  account.deletedAt = null;
  sessions.clear();
};
