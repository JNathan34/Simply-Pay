const GOOGLE_CLIENT_ID = "664652124946-e7abvmled21k144u686pfbie60pu5giu.apps.googleusercontent.com";
const SESSION_COOKIE = "simply_pay_sync_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const MAX_PAYLOAD_BYTES = 900_000;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function readCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function verifyGoogleCredential(credential) {
  if (!credential || credential.length > 4096) return null;
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) return null;
  const profile = await response.json();
  const expiresAt = Number(profile.exp || 0);
  if (profile.aud !== GOOGLE_CLIENT_ID || !profile.sub || expiresAt <= Math.floor(Date.now() / 1000)) return null;
  return {
    sub: String(profile.sub),
    email: String(profile.email || ""),
  };
}

async function authenticate(request, env) {
  const now = Math.floor(Date.now() / 1000);
  const authorization = request.headers.get("Authorization") || "";
  const credential = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (credential) {
    const profile = await verifyGoogleCredential(credential);
    if (!profile) return null;

    const token = randomToken();
    const tokenHash = await sha256(token);
    const expiresAt = now + SESSION_SECONDS;
    await env.SYNC_DB.prepare(
      "INSERT INTO sync_sessions (token_hash, google_sub, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(tokenHash, profile.sub, profile.email, expiresAt, now).run();

    return {
      ...profile,
      setCookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
    };
  }

  const sessionToken = readCookie(request, SESSION_COOKIE);
  if (sessionToken) {
    const tokenHash = await sha256(sessionToken);
    const session = await env.SYNC_DB.prepare(
      "SELECT google_sub, email, expires_at FROM sync_sessions WHERE token_hash = ?"
    ).bind(tokenHash).first();
    if (session && Number(session.expires_at) > now) {
      return { sub: session.google_sub, email: session.email || "", setCookie: "" };
    }
  }

  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_DB) return json({ error: "Sync storage is not configured." }, 503);

  const identity = await authenticate(request, env);
  if (!identity) return json({ error: "Google sign-in is required." }, 401);

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) return json({ error: "Sync data is too large." }, 413);

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: "Invalid sync data." }, 400);
  }

  if (!body?.state || typeof body.state !== "object") return json({ error: "Sync state is required." }, 400);
  const payload = JSON.stringify(body.state);
  if (new TextEncoder().encode(payload).length > MAX_PAYLOAD_BYTES) return json({ error: "Sync data is too large." }, 413);

  const updatedAt = String(body.state.updatedAt || body.updatedAt || "");
  const parsedTime = Date.parse(updatedAt);
  const updatedMs = Number.isFinite(parsedTime) ? parsedTime : 0;
  const modifiedAt = Date.now();

  await env.SYNC_DB.prepare(`
    INSERT INTO account_sync (google_sub, email, payload, updated_at, updated_ms, modified_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(google_sub) DO UPDATE SET
      email = excluded.email,
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_ms = excluded.updated_ms,
      modified_at = excluded.modified_at
    WHERE excluded.updated_ms >= account_sync.updated_ms
  `).bind(identity.sub, identity.email, payload, updatedAt, updatedMs, modifiedAt).run();

  const saved = await env.SYNC_DB.prepare(
    "SELECT payload, updated_at FROM account_sync WHERE google_sub = ?"
  ).bind(identity.sub).first();

  let state;
  try {
    state = JSON.parse(saved?.payload || payload);
  } catch (error) {
    return json({ error: "Saved sync data could not be read." }, 500);
  }

  return json(
    { state, updatedAt: saved?.updated_at || updatedAt },
    200,
    identity.setCookie ? { "Set-Cookie": identity.setCookie } : {}
  );
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_DB) return json({ error: "Sync storage is not configured." }, 503);

  const identity = await authenticate(request, env);
  if (!identity) return json({ error: "Google sign-in is required." }, 401);

  const saved = await env.SYNC_DB.prepare(
    "SELECT payload, updated_at FROM account_sync WHERE google_sub = ?"
  ).bind(identity.sub).first();

  let state = null;
  if (saved?.payload) {
    try {
      state = JSON.parse(saved.payload);
    } catch (error) {
      return json({ error: "Saved sync data could not be read." }, 500);
    }
  }

  return json(
    { state, updatedAt: saved?.updated_at || "" },
    200,
    identity.setCookie ? { "Set-Cookie": identity.setCookie } : {}
  );
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const sessionToken = readCookie(request, SESSION_COOKIE);
  if (sessionToken && env.SYNC_DB) {
    const tokenHash = await sha256(sessionToken);
    await env.SYNC_DB.prepare("DELETE FROM sync_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  return json(
    { signedOut: true },
    200,
    { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` }
  );
}
