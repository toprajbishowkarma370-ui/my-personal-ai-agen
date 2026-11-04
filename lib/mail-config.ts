/**
 * Email delivery configuration for owner OTP sign-in codes.
 *
 * Single source of truth for "is email delivery configured?", what transport to
 * use, and what an operator can safely learn about a broken deployment.
 *
 * Why this module exists: the previous OTP route tested
 * `process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD` directly and
 * returned one fixed 503 sentence. On Render that produced
 * "Email delivery is not configured on the server" with no indication of which
 * variable was absent, so a blank value, a quoted value or a common name
 * variant (GMAIL_PASS, SMTP_PASSWORD) looked identical to a missing variable.
 *
 * Rules applied here:
 * - a value that is empty or only whitespace counts as NOT configured
 * - one pair of wrapping quotes (a common copy/paste artefact from dashboards)
 *   is stripped, so `"owner@example.com"` is usable
 * - Gmail App Passwords are normalised by removing whitespace, because Google
 *   displays them as "abcd efgh ijkl mnop" and the spaces are not part of the
 *   credential
 * - documented aliases are accepted, and the names actually used are reported
 * - nothing here ever returns, logs or serialises a secret value: diagnostics
 *   contain variable NAMES, booleans and derived non-secret facts only
 */

export type EnvLike = Record<string, string | undefined>;

export type MailProvider = "gmail" | "smtp";

export type MailConfig = {
  provider: MailProvider;
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user: string;
  pass: string;
  from: string;
  /** Environment variable names that supplied this config (never values). */
  usedVars: string[];
};

export type MailConfigDiagnostics = {
  configured: boolean;
  provider: MailProvider | null;
  /** Actionable variable names an operator must set. Empty when configured. */
  missing: string[];
  /** Canonical variable names that were observed with a non-empty value. */
  present: string[];
  /** Variable names the resolved config actually reads from. */
  usedVars: string[];
  /** Safe, actionable messages. Never contain a value or an address. */
  issues: string[];
  gmail: {
    userPresent: boolean;
    appPasswordPresent: boolean;
    appPasswordLooksValid: boolean;
  };
  smtp: {
    hostPresent: boolean;
    userPresent: boolean;
    passwordPresent: boolean;
    port: number;
    secure: boolean;
  };
};

export const GMAIL_HOST = "smtp.gmail.com";
export const GMAIL_SECURE_PORT = 465;
export const SMTP_SUBMISSION_PORT = 587;

export const GMAIL_USER_VARS = ["GMAIL_USER"] as const;
export const GMAIL_PASSWORD_VARS = ["GMAIL_APP_PASSWORD", "GMAIL_APP_PASS", "GMAIL_PASS"] as const;
export const SMTP_PASSWORD_VARS = ["SMTP_PASS", "SMTP_PASSWORD"] as const;

type Picked = { name: string; value: string; quoted: boolean };

/**
 * Trim a raw environment value, drop a UTF-8 BOM and strip one pair of
 * wrapping quotes. Returns "" when the value is effectively unset.
 */
export function cleanEnvValue(raw: string | undefined): string {
  if (typeof raw !== "string") return "";

  let value = raw.replace(/^\uFEFF/, "").trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1).trim();
    }
  }
  return value;
}

/** Google App Passwords are 16 letters, displayed as four groups of four. */
export function normalizeAppPassword(raw: string | undefined): string {
  return cleanEnvValue(raw).replace(/\s+/g, "");
}

export function looksLikeGoogleAppPassword(value: string): boolean {
  return /^[a-zA-Z]{16}$/.test(value);
}

function pick(env: EnvLike, names: readonly string[]): Picked | null {
  for (const name of names) {
    const raw = env[name];
    const value = cleanEnvValue(raw);
    if (value) {
      const trimmedRaw = typeof raw === "string" ? raw.trim() : "";
      return { name, value, quoted: trimmedRaw.length >= 2 && trimmedRaw !== value };
    }
  }
  return null;
}

function pickPassword(env: EnvLike, names: readonly string[]): Picked | null {
  for (const name of names) {
    const value = normalizeAppPassword(env[name]);
    if (value) {
      const trimmedRaw = typeof env[name] === "string" ? env[name]!.trim() : "";
      return { name, value, quoted: trimmedRaw.length >= 2 && trimmedRaw !== cleanEnvValue(env[name]) };
    }
  }
  return null;
}

function presentNames(env: EnvLike, names: readonly string[]): string[] {
  return names.filter((name) => cleanEnvValue(env[name]).length > 0);
}

/**
 * Split "smtp.example.com:587" / "smtps://smtp.example.com" into host + port so
 * a host field that includes the port still works.
 */
function normalizeHost(raw: string): { host: string; port: number | null } {
  let host = raw.trim().replace(/^smtps?:\/\//i, "").replace(/\/+$/, "");
  const match = host.match(/^(\[[^\]]+\]|[^:]+):(\d{1,5})$/);
  if (match) {
    const port = Number(match[2]);
    host = match[1];
    return { host, port: Number.isInteger(port) && port > 0 && port < 65536 ? port : null };
  }
  return { host, port: null };
}

function resolvePort(env: EnvLike, fallback: number, hostPort: number | null, issues: string[]) {
  const raw = cleanEnvValue(env.SMTP_PORT);
  let port = fallback;

  if (raw) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
      port = parsed;
    } else {
      issues.push(`SMTP_PORT is not a valid TCP port; using ${fallback}.`);
    }
  } else if (hostPort) {
    port = hostPort;
  }

  const explicit = cleanEnvValue(env.SMTP_SECURE).toLowerCase();
  const secure =
    explicit === "true" || explicit === "1" ? true : explicit === "false" || explicit === "0" ? false : port === GMAIL_SECURE_PORT;

  // Port 587 is SMTP submission and must be upgraded with STARTTLS; never send
  // credentials over a plaintext session.
  return { port, secure, requireTLS: port === SMTP_SUBMISSION_PORT && !secure };
}

/**
 * Resolve the transport that would actually be used, plus secret-free
 * diagnostics describing what the running process can see.
 */
export function resolveMailConfig(env: EnvLike = process.env): {
  config: MailConfig | null;
  diagnostics: MailConfigDiagnostics;
} {
  const issues: string[] = [];

  const gmailUserVar = pick(env, GMAIL_USER_VARS);
  const smtpHostVar = pick(env, ["SMTP_HOST"]);
  const smtpUserVar = pick(env, ["SMTP_USER"]);
  const gmailPassVar = pickPassword(env, GMAIL_PASSWORD_VARS);
  const smtpPassVar = pickPassword(env, SMTP_PASSWORD_VARS);

  const smtpHostIsGmail = smtpHostVar ? /^(smtp\.)?gmail\.com$/i.test(normalizeHost(smtpHostVar.value).host) : false;
  const smtpUserIsGmail = smtpUserVar ? /@(gmail|googlemail)\.com$/i.test(smtpUserVar.value) : false;

  // A Gmail address in SMTP_USER with no relay host (or the Gmail host) is a
  // Gmail account: use it rather than treating the setup as incomplete.
  const gmailUser =
    gmailUserVar ?? (smtpUserIsGmail && (!smtpHostVar || smtpHostIsGmail) ? smtpUserVar : null);
  const gmailPass =
    gmailPassVar ?? (gmailUser && (!smtpHostVar || smtpHostIsGmail) ? smtpPassVar : null);

  const present = [
    ...presentNames(env, GMAIL_USER_VARS),
    ...presentNames(env, GMAIL_PASSWORD_VARS),
    ...presentNames(env, ["SMTP_HOST"]),
    ...presentNames(env, ["SMTP_USER"]),
    ...presentNames(env, SMTP_PASSWORD_VARS),
  ];

  let config: MailConfig | null = null;

  if (gmailUser && gmailPass) {
    const hostPort = smtpHostVar && smtpHostIsGmail ? normalizeHost(smtpHostVar.value).port : null;
    const { port, secure, requireTLS } = resolvePort(env, GMAIL_SECURE_PORT, hostPort, issues);

    if (gmailUser.value.includes("@") === false) {
      issues.push("The Gmail user is not a full email address; set the whole address, e.g. owner@gmail.com.");
    }
    if (gmailPass.quoted) {
      issues.push(`${gmailPass.name} was wrapped in quotes; the quotes were removed automatically.`);
    }
    if (gmailUser.quoted) {
      issues.push(`${gmailUser.name} was wrapped in quotes; the quotes were removed automatically.`);
    }
    if (!looksLikeGoogleAppPassword(gmailPass.value)) {
      issues.push(
        "The Gmail password is not 16 letters after removing spaces. Google App Passwords are 16 letters; regenerate one at https://myaccount.google.com/apppasswords (a normal account password cannot be used).",
      );
    }

    config = {
      provider: "gmail",
      host: GMAIL_HOST,
      port,
      secure,
      requireTLS,
      user: gmailUser.value,
      pass: gmailPass.value,
      // Gmail only accepts the authenticated account as the sender; SMTP_FROM is
      // deliberately ignored here so an outreach "from" address cannot break OTP.
      from: gmailUser.value,
      usedVars: [gmailUser.name, gmailPass.name],
    };
  } else if (smtpHostVar && smtpUserVar && smtpPassVar) {
    const normalized = normalizeHost(smtpHostVar.value);
    const { port, secure, requireTLS } = resolvePort(env, SMTP_SUBMISSION_PORT, normalized.port, issues);
    const fromVar = pick(env, ["SMTP_FROM"]);

    if (!normalized.host) {
      issues.push("SMTP_HOST is empty after trimming.");
    }
    if (smtpPassVar.quoted) {
      issues.push(`${smtpPassVar.name} was wrapped in quotes; the quotes were removed automatically.`);
    }

    config = {
      provider: "smtp",
      host: normalized.host,
      port,
      secure,
      requireTLS,
      user: smtpUserVar.value,
      pass: smtpPassVar.value,
      from: fromVar ? fromVar.value : smtpUserVar.value,
      usedVars: [smtpHostVar.name, smtpUserVar.name, smtpPassVar.name, ...(fromVar ? [fromVar.name] : [])],
    };
  }

  const missing: string[] = [];
  if (!config) {
    const hasGmailIdentity = Boolean(gmailUser || gmailPassVar);
    const hasSmtpHost = Boolean(smtpHostVar);

    if (hasGmailIdentity) {
      if (!gmailUser) missing.push(GMAIL_USER_VARS[0]);
      if (!gmailPass) missing.push(GMAIL_PASSWORD_VARS[0]);
    } else if (hasSmtpHost || smtpUserVar || smtpPassVar) {
      if (!smtpHostVar) {
        missing.push("SMTP_HOST");
        issues.push("SMTP_USER and/or SMTP_PASS are set but SMTP_HOST is missing, so no relay can be used.");
      }
      if (!smtpUserVar) missing.push("SMTP_USER");
      if (!smtpPassVar) missing.push(SMTP_PASSWORD_VARS[0]);
      if (!hasSmtpHost && !smtpUserVar) missing.push(GMAIL_USER_VARS[0], GMAIL_PASSWORD_VARS[0]);
    } else {
      missing.push(GMAIL_USER_VARS[0], GMAIL_PASSWORD_VARS[0]);
    }
  }

  const diagnostics: MailConfigDiagnostics = {
    configured: Boolean(config),
    provider: config ? config.provider : null,
    missing,
    present,
    usedVars: config ? config.usedVars : [],
    issues,
    gmail: {
      userPresent: Boolean(gmailUser),
      appPasswordPresent: Boolean(gmailPass),
      appPasswordLooksValid: gmailPass ? looksLikeGoogleAppPassword(gmailPass.value) : false,
    },
    smtp: {
      hostPresent: Boolean(smtpHostVar),
      userPresent: Boolean(smtpUserVar),
      passwordPresent: Boolean(smtpPassVar),
      port: config && config.provider === "smtp" ? config.port : SMTP_SUBMISSION_PORT,
      secure: config && config.provider === "smtp" ? config.secure : portIsSecureFallback(env),
    },
  };

  return { config, diagnostics };
}

function portIsSecureFallback(env: EnvLike): boolean {
  const explicit = cleanEnvValue(env.SMTP_SECURE).toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  return Number(cleanEnvValue(env.SMTP_PORT)) === GMAIL_SECURE_PORT;
}

/** True when OTP codes can be delivered with the current environment. */
export function isMailConfigured(env: EnvLike = process.env): boolean {
  return resolveMailConfig(env).config !== null;
}

/** Human-readable, secret-free summary suitable for a server log line. */
export function formatMailDiagnostics(diagnostics: MailConfigDiagnostics): string {
  const parts = [
    `configured=${diagnostics.configured}`,
    `provider=${diagnostics.provider ?? "none"}`,
    `present=[${diagnostics.present.join(", ")}]`,
    `missing=[${diagnostics.missing.join(", ")}]`,
  ];
  if (diagnostics.usedVars.length > 0) parts.push(`using=[${diagnostics.usedVars.join(", ")}]`);
  if (diagnostics.issues.length > 0) parts.push(`issues=[${diagnostics.issues.join(" | ")}]`);
  return parts.join(" ");
}
