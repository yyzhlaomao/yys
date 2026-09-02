import {
  ensureAppSchema,
  getBindings,
  getRuntimeText,
  type UserRecord,
} from '@/db/app';

const SESSION_COOKIE = 'yys_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const PASSWORD_HASH_ALGORITHM = 'pbkdf2-sha256';
const PASSWORD_ITERATIONS = 40_000;
const LEGACY_PASSWORD_ITERATIONS = 120_000;

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: UserRecord['role'];
  status: UserRecord['status'];
  applicationNote: string | null;
  createdAt: number;
  approvedAt: number | null;
  lastLoginAt: number | null;
};

function bytesToBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    '',
  );
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(value: string) {
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function randomToken(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePasswordHash(
  password: string,
  saltBytes: BufferSource,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBytes,
      iterations,
    },
    key,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

function readStoredPasswordHash(value: string) {
  const [algorithm, iterationsText, digest, extra] = value.split('$');
  const iterations = Number(iterationsText);
  if (
    algorithm === PASSWORD_HASH_ALGORITHM &&
    !extra &&
    digest &&
    Number.isSafeInteger(iterations) &&
    iterations >= 10_000 &&
    iterations <= 1_000_000
  ) {
    return { digest, iterations };
  }
  return { digest: value, iterations: LEGACY_PASSWORD_ITERATIONS };
}

export async function hashPassword(password: string) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derivePasswordHash(
    password,
    saltBytes,
    PASSWORD_ITERATIONS,
  );
  return {
    hash: `${PASSWORD_HASH_ALGORITHM}$${PASSWORD_ITERATIONS}$${digest}`,
    salt: bytesToBase64Url(saltBytes),
  };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: string,
) {
  const stored = readStoredPasswordHash(expectedHash);
  const result = await derivePasswordHash(
    password,
    base64UrlToBytes(salt),
    stored.iterations,
  );
  if (result.length !== stored.digest.length) return false;
  let mismatch = 0;
  for (let index = 0; index < result.length; index += 1) {
    mismatch |= result.charCodeAt(index) ^ stored.digest.charCodeAt(index);
  }
  return mismatch === 0;
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? '';
  for (const pair of cookie.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    }
  }
  return null;
}

export function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
    status: user.status,
    applicationNote: user.application_note,
    createdAt: user.created_at,
    approvedAt: user.approved_at,
    lastLoginAt: user.last_login_at,
  };
}

export async function createSession(userId: string) {
  await ensureAppSchema();
  const { db } = getBindings();
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = Date.now();
  await db.batch([
    db
      .prepare(`INSERT INTO sessions (
        id, token_hash, user_id, created_at, expires_at, last_used_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(
        crypto.randomUUID(),
        tokenHash,
        userId,
        now,
        now + SESSION_MAX_AGE_SECONDS * 1000,
        now,
      ),
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?1').bind(now),
  ]);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function deleteSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  await ensureAppSchema();
  const { db } = getBindings();
  await db
    .prepare('DELETE FROM sessions WHERE token_hash = ?1')
    .bind(await sha256(token))
    .run();
}

export async function getCurrentUser(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  await ensureAppSchema();
  const { db } = getBindings();
  const now = Date.now();
  const user = await db
    .prepare(`SELECT u.id, u.username, u.display_name, u.email,
      u.password_hash, u.password_salt, u.role, u.status,
      u.application_note, u.created_at, u.approved_at, u.approved_by,
      u.last_login_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?1 AND s.expires_at > ?2 LIMIT 1`)
    .bind(await sha256(token), now)
    .first<UserRecord>();
  return user ?? null;
}

export async function requireApprovedUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user || user.status !== 'approved') return null;
  return user;
}

export async function requireAdmin(request: Request) {
  const user = await requireApprovedUser(request);
  if (!user || user.role !== 'admin') return null;
  return user;
}

export function normalizeUsername(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function validUsername(value: string) {
  return /^[\p{L}\p{N}_-]{3,32}$/u.test(value);
}

export function validPassword(value: unknown) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128;
}

export async function validateTurnstile(request: Request, token: unknown) {
  const secret = getRuntimeText('TURNSTILE_SECRET_KEY');
  if (!secret) return true;
  if (typeof token !== 'string' || !token) return false;
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  const remoteIp = request.headers.get('CF-Connecting-IP');
  if (remoteIp) body.set('remoteip', remoteIp);
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
