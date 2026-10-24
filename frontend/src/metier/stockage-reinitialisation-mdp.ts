type ResetCodeEntry = {
  code: string;
  expiresAt: number;
  attempts: number;
  verifiedAt: number | null;
};

const CODE_TTL_MS = 10 * 60 * 1000; // 10 min
const MAX_ATTEMPTS = 5;

declare global {
  // eslint-disable-next-line no-var
  var passwordResetStore: Map<string, ResetCodeEntry> | undefined;
}

function getStore() {
  if (!globalThis.passwordResetStore) {
    globalThis.passwordResetStore = new Map<string, ResetCodeEntry>();
  }
  return globalThis.passwordResetStore;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function cleanExpiredCodes() {
  const now = Date.now();
  const store = getStore();
  for (const [email, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(email);
    }
  }
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function issuePasswordResetCode(email: string) {
  cleanExpiredCodes();
  const store = getStore();
  const key = normalizeEmail(email);
  const code = generateCode();

  store.set(key, {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    verifiedAt: null
  });

  return {
    code,
    expiresInMinutes: Math.floor(CODE_TTL_MS / 60000)
  };
}

export function clearPasswordResetCode(email: string) {
  const store = getStore();
  store.delete(normalizeEmail(email));
}

export function verifyPasswordResetCode(email: string, code: string) {
  cleanExpiredCodes();
  const store = getStore();
  const key = normalizeEmail(email);
  const entry = store.get(key);

  if (!entry) {
    return { ok: false, error: "Code introuvable ou expire." };
  }

  if (entry.code !== code.trim()) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      store.delete(key);
      return { ok: false, error: "Trop de tentatives. Demandez un nouveau code." };
    }
    store.set(key, entry);
    return { ok: false, error: "Code incorrect." };
  }

  entry.verifiedAt = Date.now();
  store.set(key, entry);
  return { ok: true };
}

export function consumePasswordResetCode(email: string, code: string) {
  const checked = verifyPasswordResetCode(email, code);
  if (!checked.ok) {
    return checked;
  }

  const store = getStore();
  const key = normalizeEmail(email);
  store.delete(key);
  return { ok: true };
}
