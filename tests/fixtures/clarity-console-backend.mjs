// LOCAL SYNTHETIC FIXTURE ONLY: real local SQL, fake Auth and fake AI.
// Never point an app with real users/credentials at this process.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
if (!process.argv.includes("--synthetic-only")) throw new Error("Pass --synthetic-only");
const edition = process.argv.includes("--student") ? "student" : "adult";
const port = edition === "student" ? 3158 : 3148;
const database = `clarity_ui_${edition}`;
const socket = process.env.ARIZE_TEST_SOCKET;
if (!socket || !/^\/private\/tmp\/arize-phase3\.[\w]+$/.test(socket)) throw new Error("Use the documented fresh local test socket only");
const args = ["-h", socket, "-p", "55441", "-U", "arize_phase3_test", "-d", database];
const id = "c1000000-0000-4000-8000-000000000001";
const now = new Date().toISOString();
const user = { id, aud: "authenticated", role: "authenticated", email: "clarity-admin@example.test", email_confirmed_at: now, created_at: now, updated_at: now, last_sign_in_at: now, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [], factors: [], is_anonymous: false };
const created = spawnSync("createdb", ["-h", socket, "-p", "55441", "-U", "arize_phase3_test", database], { encoding: "utf8" });
if (created.status !== 0) throw new Error("Fresh fixture database creation failed. Do not reuse or overwrite a database.");
const migration = readFileSync(new URL("../../supabase/migrations/20261122163011_clarity_configuration_console.sql", import.meta.url), "utf8");
const bootstrap = `
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key,email text);
create table auth.mfa_factors(id uuid primary key,user_id uuid,status text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid(),auth.jwt() to authenticated;
insert into auth.users values('${id}','clarity-admin@example.test');
${edition === "student" ? `create table public.student_schools(id uuid);alter table public.student_schools enable row level security;create schema student_admin_private;create function student_admin_private.is_operator() returns boolean language sql stable as $$select auth.uid()='${id}'::uuid$$;` : ""}
${migration}
${edition === "adult" ? `insert into public.clarity_admins values('${id}',true);` : ""}`;
const boot = spawnSync("psql", [...args, "-X", "-q", "-v", "ON_ERROR_STOP=1"], { input: bootstrap, encoding: "utf8" });
if (boot.status !== 0) throw new Error("Synthetic fixture schema creation failed");
const literal = value => value === null || value === undefined ? "null" : `'${String(value).replaceAll("'", "''")}'`;
function rpc(name, body) {
  const calls = {
    clarity_console_allowed: () => `public.clarity_console_allowed(${literal(body.p_edition)})`,
    clarity_console_state: () => `public.clarity_console_state(${literal(body.p_edition)},${literal(body.p_page ?? 0)}::integer)`,
    clarity_active_config: () => `public.clarity_active_config(${literal(body.p_edition)})`,
    clarity_claim_preview: () => `public.clarity_claim_preview(${literal(body.p_edition)},${literal(body.p_request)}::uuid)`,
    clarity_change_config: () => `public.clarity_change_config(${literal(body.p_edition)},${literal(body.p_action)},${literal(JSON.stringify(body.p_config))}::jsonb,${literal(body.p_note)},${literal(body.p_version)}::uuid,${literal(body.p_expected)}::uuid)`,
  };
  if (!calls[name]) return null;
  const sql = `begin;set local role authenticated;set local request.jwt.claim.sub='${id}';select to_jsonb(${calls[name]()});commit;`;
  const result = spawnSync("psql", [...args, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  if (result.status !== 0) return { error: true, code: result.stderr.includes("Configuration changed") ? "40001" : "42501" };
  return { data: JSON.parse(result.stdout.trim() || "null") };
}
const json = (res, status, value) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": `http://127.0.0.1:${port + 1}`, "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-supabase-api-version", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" }); res.end(JSON.stringify(value)); };
createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}`) return json(res, 403, {});
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (req.method === "OPTIONS") return json(res, 200, {});
  let text = ""; for await (const chunk of req) { text += chunk; if (text.length > 65536) return json(res, 413, {}); }
  let body = {}; try { if (text) body = JSON.parse(text); } catch { return json(res, 400, {}); }
  if (url.pathname === "/auth/v1/token") {
    if (body.email !== user.email || body.password !== "synthetic-console-only") return json(res, 400, { msg: "Only the documented synthetic account is accepted." });
    const issued = Math.floor(Date.now() / 1000);
    const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", email: user.email, iat: issued, exp: issued + 3600, aal: "aal1", amr: [{ method: "password", timestamp: issued }], session_id: "synthetic-console", app_metadata: user.app_metadata, user_metadata: {} })).toString("base64url");
    const token = `${head}.${payload}.${createHmac("sha256", "synthetic-not-a-real-key").update(`${head}.${payload}`).digest("base64url")}`;
    return json(res, 200, { access_token: token, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, expires_at: issued + 3600, user });
  }
  if (url.pathname === "/auth/v1/user") return json(res, 200, user);
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const result = rpc(url.pathname.split("/").at(-1), body);
    if (!result) return json(res, 404, { code: "PGRST202" });
    return result.error ? json(res, 400, { code: result.code, message: "Synthetic database request rejected" }) : json(res, 200, result.data);
  }
  if (url.pathname === "/v1/moderations") {
    const flagged = String(body.input).includes("FIXTURE_SELF_HARM");
    return json(res, 200, { id: "fixture-moderation", model: "fixture", results: [{ flagged, categories: { "self-harm/intent": flagged }, category_scores: {} }] });
  }
  if (url.pathname === "/v1/chat/completions") {
    const tone = body.messages?.[0]?.content?.match(/"tone":"([^"\n]+)"/)?.[1] ?? "supportive";
    return json(res, 200, { id: "fixture-chat", object: "chat.completion", model: "fixture", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: `Synthetic preview · ${tone}. Let’s choose one small step you can try today. What feels manageable?` } }] });
  }
  return json(res, 404, { error: "No production tables or external services are available in this fixture." });
}).listen(port, "127.0.0.1", () => console.log(`Synthetic ${edition} console backend on 127.0.0.1:${port}; real LOCAL SQL, fake Auth and AI.`));
