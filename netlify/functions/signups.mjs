// Netlify Function: admin login + automatic sign-up retrieval for the volunteer roster.
//
//   POST /api/login    { email, password }  ->  { token, email }   (token valid 12 hours)
//   GET  /api/signups  Authorization: Bearer <token>  ->  { submissions: [{ id, created_at, data }] }
//
// Requires one environment variable in Netlify (Site configuration > Environment variables):
//   NETLIFY_API_TOKEN  = a Netlify personal access token (User settings > Applications > New access token)
// It's used server-side only, to read this site's form submissions and to sign login tokens.

import crypto from "node:crypto";

const FORM_NAME = "volunteer-signup";
const PBKDF2_ITERATIONS = 310000;
const TOKEN_HOURS = 12;

// Same salted hashes as CONFIG.admins in index.html (keep the two lists in sync).
const ADMINS = [
  { email: "badams@uvu.edu",        salt: "eccc1c7b5139b656ddda54f9a7acf6f4", hash: "23ba8183f83e9a6764b867ff5dd2e0dbea2083c8fadbc8118f97035c3d1828dd" },
  { email: "r.huntsmanb@gmail.com", salt: "9b5c25e578ad5309bbdd7253164e4981", hash: "703e839c8130ce6a5922034f8a448fbecc8e5b7f06053ef62aac7fae9a10b78c" }
];

export const config = { path: ["/api/login", "/api/signups"] };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const apiToken = () => process.env.NETLIFY_API_TOKEN || (globalThis.Netlify?.env?.get?.("NETLIFY_API_TOKEN")) || "";

function sameHex(a, b){
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function signToken(email){
  const body = Buffer.from(JSON.stringify({ email, exp: Date.now() + TOKEN_HOURS * 3600e3 })).toString("base64url");
  const mac = crypto.createHmac("sha256", apiToken()).update("roster-login:" + body).digest("base64url");
  return `${body}.${mac}`;
}

function verifyToken(token){
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", apiToken()).update("roster-login:" + body).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!exp || exp < Date.now()) return null;
    return ADMINS.some(x => x.email === email) ? email : null;
  } catch { return null; }
}

async function netlifyApi(path){
  const r = await fetch(`https://api.netlify.com/api/v1${path}`, { headers: { Authorization: `Bearer ${apiToken()}` } });
  if (!r.ok) throw Object.assign(new Error(`Netlify API ${r.status} on ${path}`), { status: r.status });
  return r.json();
}

async function login(req){
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let email = "", password = "";
  try { ({ email = "", password = "" } = await req.json()); } catch {}
  email = String(email).trim().toLowerCase();
  const admin = ADMINS.find(a => a.email === email);
  // Always hash, even for unknown emails, so response time doesn't reveal which emails are admins
  const hash = crypto.pbkdf2Sync(`${email}:${password}`, Buffer.from((admin || ADMINS[0]).salt, "hex"), PBKDF2_ITERATIONS, 32, "sha256").toString("hex");
  if (!admin || !sameHex(hash, admin.hash)){
    await new Promise(r => setTimeout(r, 800));
    return json({ error: "Incorrect email or password." }, 401);
  }
  return json({ token: signToken(admin.email), email: admin.email });
}

async function signups(req, context){
  const email = verifyToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  if (!email) return json({ error: "Not logged in or session expired." }, 401);
  const siteId = context?.site?.id || process.env.SITE_ID;
  if (!siteId) return json({ error: "Couldn't determine this site's ID." }, 500);

  const forms = await netlifyApi(`/sites/${siteId}/forms`);
  const form = forms.find(f => f.name === FORM_NAME);
  if (!form) return json({ submissions: [], note: `No "${FORM_NAME}" form found yet. Turn on form detection and redeploy.` });

  const submissions = [];
  for (let page = 1; page <= 50; page++){
    const batch = await netlifyApi(`/forms/${form.id}/submissions?per_page=100&page=${page}`);
    for (const s of batch) submissions.push({ id: s.id, created_at: s.created_at, data: s.data || {} });
    if (batch.length < 100) break;
  }
  return json({ submissions });
}

export default async (req, context) => {
  if (!apiToken()) return json({ error: "NETLIFY_API_TOKEN isn't set in this site's environment variables." }, 503);
  const path = new URL(req.url).pathname;
  try {
    if (path.endsWith("/login")) return await login(req);
    if (path.endsWith("/signups")) return await signups(req, context);
    return json({ error: "Not found" }, 404);
  } catch (err){
    const status = err.status === 401 || err.status === 403 ? 502 : 500;
    return json({ error: err.status === 401 || err.status === 403
      ? "Netlify rejected the access token. Check NETLIFY_API_TOKEN."
      : "Couldn't load sign-ups from Netlify. Try again shortly." }, status);
  }
};
