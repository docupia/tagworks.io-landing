import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const databaseUrl = process.env.SUPABASE_E2E_DATABASE_URL;

assert.ok(url && key && databaseUrl, "Supabase E2E admin environment is required");

const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
// Supabase rejects reserved example.* domains before creating a user. This
// high-entropy address is used once, never printed, and removed in finally.
const email = `tagworks-e2e-${suffix}@gmail.com`;
const password = `Tw!${randomBytes(18).toString("base64url")}`;
const adminSql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
});

let userId;
let pageId;
let objectPath;
let authenticatedClient;
let signupMode = "Auth signup";

try {
  const signupClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signup, error: signupError } = await signupClient.auth.signUp({
    email,
    password,
  });
  if (signupError?.code === "over_email_send_rate_limit") {
    // Hosted projects have a deliberately low default email quota. Seed only
    // the disposable E2E identity when the mailer quota prevents a repeat run.
    signupMode = "rate-limit-safe SQL fixture";
    userId = randomUUID();
    await adminSql.begin(async (transaction) => {
      const tx = transaction;
      await tx`
        insert into auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          confirmation_token,
          recovery_token,
          email_change_token_new,
          email_change,
          raw_app_meta_data,
          raw_user_meta_data,
          created_at,
          updated_at
        ) values (
          '00000000-0000-0000-0000-000000000000'::uuid,
          ${userId}::uuid,
          'authenticated',
          'authenticated',
          ${email},
          extensions.crypt(${password}, extensions.gen_salt('bf')),
          now(),
          '',
          '',
          '',
          '',
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb,
          now(),
          now()
        )
      `;
      await tx`
        insert into auth.identities (
          provider_id,
          user_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        ) values (
          ${userId},
          ${userId}::uuid,
          jsonb_build_object(
            'sub', ${userId}::text,
            'email', ${email}::text,
            'email_verified', true,
            'phone_verified', false
          ),
          'email',
          now(),
          now(),
          now()
        )
      `;
    });
  } else {
    assert.ifError(signupError);
    assert.ok(signup.user?.id, "Signup must return a user id");
    userId = signup.user.id;

    await adminSql`
      update auth.users
      set email_confirmed_at = now(), updated_at = now()
      where id = ${userId}::uuid
    `;
  }

  const cookieJar = new Map();
  authenticatedClient = createServerClient(url, key, {
    cookies: {
      getAll() {
        return [...cookieJar].map(([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
        for (const cookie of cookies) cookieJar.set(cookie.name, cookie.value);
      },
    },
  });
  const { data: login, error: loginError } =
    await authenticatedClient.auth.signInWithPassword({ email, password });
  assert.ifError(loginError);
  assert.equal(login.user.id, userId);

  const bypassAttempt = await authenticatedClient.storage
    .from("page-originals")
    .upload(
      `${userId}/${randomUUID()}/unreserved.html`,
      new TextEncoder().encode("<p>must be denied</p>"),
      { contentType: "text/html", upsert: false },
    );
  assert.ok(bypassAttempt.error, "Storage uploads without a server reservation must fail");

  const form = new FormData();
  form.set("title", "TagWorks 자동 검증 페이지");
  form.set("description", "가입, 로그인, 업로드, 고정 링크 통합 검증");
  form.set(
    "file",
    new File(
      [
        `<!doctype html><html><head><style>
          .card { color:#33402b; padding:2rem; background:url(https://invalid.example/track); }
        </style></head><body>
          <main class="card"><h1 onclick="alert(1)">TagWorks E2E OK</h1></main>
          <script>globalThis.compromised=true</script>
        </body></html>`,
      ],
      "e2e.html",
      { type: "text/html" },
    ),
  );

  const cookieHeader = [...cookieJar]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  const uploadResponse = await fetch("http://localhost:3000/api/pages", {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
    },
    body: form,
  });
  const upload = await uploadResponse.json();
  assert.equal(uploadResponse.status, 201, JSON.stringify(upload));
  assert.ok(upload.page?.id && upload.page?.slug && upload.publicUrl);
  assert.ok(upload.warnings.length >= 2);
  pageId = upload.page.id;

  const [version] = await adminSql`
    select source_object_path
    from public.page_versions
    where page_id = ${pageId}::uuid
  `;
  objectPath = version?.source_object_path;
  assert.ok(objectPath, "Uploaded source object must be recorded");

  const publicResponse = await fetch(upload.publicUrl);
  const publicHtml = await publicResponse.text();
  assert.equal(publicResponse.status, 200);
  assert.match(publicHtml, /TagWorks E2E OK/);
  assert.doesNotMatch(publicHtml, /<script|onclick=|invalid\.example/i);
  assert.match(publicResponse.headers.get("content-security-policy") ?? "", /script-src 'none'/);
  assert.match(publicResponse.headers.get("content-security-policy") ?? "", /sandbox/);

  const privateObjectResponse = await fetch(
    `${url}/storage/v1/object/page-originals/${objectPath}`,
    { headers: { apikey: key } },
  );
  assert.notEqual(privateObjectResponse.status, 200);

  const anonymousClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonymousRead = await anonymousClient.from("pages").select("id");
  assert.ok(anonymousRead.error, "Anonymous callers must not query page metadata");

  console.log(
    `E2E passed (${signupMode}): login, upload, sanitize, publish, private source, and RLS`,
  );
} finally {
  if (objectPath && authenticatedClient) {
    await authenticatedClient.storage.from("page-originals").remove([objectPath]);
  }
  if (pageId) {
    await adminSql`delete from public.pages where id = ${pageId}::uuid`;
  }
  if (userId) {
    await adminSql`delete from auth.users where id = ${userId}::uuid`;
  }
  await adminSql.end({ timeout: 5 });
}
