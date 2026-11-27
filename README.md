# TagWorks

TagWorks는 HTML 원본을 격리된 고정 링크로 공개하는 Next.js 서비스입니다.
카키·파스텔 랜딩, Supabase 이메일 인증, 비공개 원본 업로드, 원본 HTML 게시,
사용자별 대시보드를 포함합니다.

## 구조

- `apps/web`: 랜딩, 회원가입·로그인, 대시보드, HTML 업로드 API
- `apps/publisher`: 인증 쿠키와 분리된 공개 HTML 전용 오리진
- `supabase/migrations`: 테이블, RLS, Storage, 공개 조회 RPC
- `site/dist`: 전환 전 정적 랜딩 보관본

공개 페이지는 앱 인증 쿠키가 전달되지 않는 별도 Vercel 프로젝트에서 제공됩니다.
원본 HTML은 `page-originals` 비공개 버킷에 보관되고, 공개 RPC는 현재 게시 버전의
HTML과 렌더링 계약만 반환합니다. 신규 원본 모드는 퍼블리셔의 인증 쿠키와 분리된
opaque-origin CSP sandbox에서 스크립트를 실행합니다.

## 로컬 실행

Node.js 20.9 이상이 필요합니다.

```sh
npm install
cp .env.example apps/web/.env.local
cp .env.example apps/publisher/.env.local
npm run dev:web
npm run dev:publisher
```

- 웹 앱: `http://localhost:3000`
- 퍼블리셔: `http://localhost:3001`

실제 값은 Git에 커밋하지 말고 각 앱의 `.env.local`에 둡니다. 웹 앱에는
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PUBLISHER_URL`, `SUPABASE_DATABASE_URL`,
`SUPABASE_ANALYTICS_DATABASE_URL`, `TAGWORKS_ANALYTICS_EVENT_SECRET`,
`PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
`PAYPAL_STARTER_MONTHLY_PLAN_ID`, `PAYPAL_STARTER_YEARLY_PLAN_ID`,
`PAYPAL_PRO_MONTHLY_PLAN_ID`, `PAYPAL_PRO_YEARLY_PLAN_ID`, `PAYPAL_WEBHOOK_ID`가
필요하고, 선택 항목으로 `RESEND_API_KEY`, `ADMIN_EMAIL`, `EMAIL_FROM`, `CRON_SECRET`이 있습니다. 퍼블리셔에는 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`TAGWORKS_ANALYTICS_EVENTS_URL`, `TAGWORKS_ANALYTICS_EVENT_SECRET`을 설정합니다.
이벤트 전달에 사용하는 대표 퍼블리셔 주소인 `NEXT_PUBLIC_PUBLISHER_URL`은 두 프로젝트에 동일하게 설정합니다.
퍼블리셔는 PostgreSQL에 직접 접속하지 않습니다. 공개 페이지에 삽입된 스크립트는
서명된 이벤트를 퍼블리셔의 무상태 릴레이로 보내고, 릴레이가 운영 웹의 `/api/events`로
전달합니다. 운영 API는 퍼블리셔 도메인의 리퍼러와 서명을 모두 검증한 뒤
`tagworks_analytics` 최소 권한 역할로 이벤트를 저장합니다.
Vercel의 `SUPABASE_DATABASE_URL`에는 두 번째 마이그레이션에서 만든 최소 권한
`tagworks_ingest` 역할의 Supabase Transaction pooler 연결 문자열을 사용합니다.
애플리케이션은 prepared statements를 비활성화하고 연결을 인스턴스당 1개로 제한합니다.

## Supabase 적용

```sh
psql "$SUPABASE_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/202609230001_tagworks_core.sql
psql "$SUPABASE_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/202609230002_ingest_role.sql
psql "$SUPABASE_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/202609230003_upload_reservations.sql
psql "$SUPABASE_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/202610150001_billing_and_upload_quotas.sql
psql "$SUPABASE_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/202610150002_super_admin_unlimited_uploads.sql
psql "$SUPABASE_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/tagworks_core_schema.sql
psql "$SUPABASE_ADMIN_DATABASE_URL" -c '\password tagworks_ingest'
```

마이그레이션과 역할 비밀번호 설정에는 관리자용 Session pooler URL을 로컬에서만
사용합니다. `\password`가 비밀번호를 가려서 두 번 입력받으므로 셸 기록에 남지 않습니다.
설정 후 `tagworks_ingest` 역할의 Transaction pooler URL만 웹 앱에 넣고, 관리자 URL은
Vercel에 절대 등록하지 않습니다.

PayPal 비밀키는 웹 앱의 서버 환경 변수에만 저장합니다. 요금제는 공개 링크 수 기준입니다
(Free 1개, Starter 5개 $5/월·$48/년, Pro 30개 $15/월·$144/년, 31개 이상은 관리자가 정하는 Custom).
PayPal 플랜 4개는 기존 상품 아래에 아래 스크립트로 만들고, 반환된 ID를 같은 이름의 환경 변수에 넣습니다.
두 번째 인자부터는 비활성화할 예전 플랜 ID($20 월간)입니다. 예전 $100 선불 팩은 PayPal 화면에서 직접 비활성화합니다.

```sh
printf '%s\n%s\n' "$PAYPAL_CLIENT_ID" "$PAYPAL_CLIENT_SECRET" | \
  node scripts/setup-paypal-link-plans.mjs <product-id> <old-monthly-plan-id>
```

운영 웹훅 주소는 `https://tagworks.io/api/paypal/webhook`으로 등록한 뒤 반환된 ID를
`PAYPAL_WEBHOOK_ID`에 설정합니다. 웹훅 이벤트에는 `BILLING.SUBSCRIPTION.*`와
`PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.DENIED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`를 포함합니다.

플랜 개편 마이그레이션은 아래 순서로 적용합니다.

```sh
for f in 202611280001_link_based_plans 202611280002_page_version_assets \
         202611280003_plan_analytics 202611280004_paypal_link_plans \
         202611280005_custom_plans_and_usage; do
  psql "$SUPABASE_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f "supabase/migrations/$f.sql"
done
```

메일은 선택 사항입니다. `RESEND_API_KEY`가 있으면 Resend로 보내고, 없으면 보내지 않습니다.
`ADMIN_EMAIL`(기본값 `info@tagworks.io`)은 Custom 문의와 페이지뷰 300% 알림을 받는 주소이고,
`EMAIL_FROM`(기본값 `TagWorks <noreply@tagworks.io>`)은 Resend에서 인증한 도메인의 발신 주소여야 합니다.

매일 한 번 실행하는 예약 작업 `/api/cron/daily`는 기간이 끝난 다운그레이드의 링크 정리,
다운그레이드 7일·1일 전 안내 메일, 월간 페이지뷰 알림(80%·100%는 계정 주인, 300%는 관리자)을 처리합니다.
`CRON_SECRET`을 설정한 경우에만 동작하며, Vercel Cron을 쓰려면 웹 앱 프로젝트에 아래 `vercel.json`을 추가합니다.
페이지뷰가 한도를 넘어도 공개 페이지는 막지 않습니다.

```json
{ "crons": [{ "path": "/api/cron/daily", "schedule": "0 0 * * *" }] }
```

Supabase Auth의 Site URL과 Redirect URLs에는 로컬 웹 주소와 실제 Vercel 웹 주소의
`/auth/callback`을 등록해야 이메일 확인 후 대시보드로 돌아옵니다.
불특정 사용자의 공개 회원가입을 운영하려면 Supabase 기본 테스트 메일러 대신 별도의
Custom SMTP도 연결해야 합니다.

## 검증

```sh
npm run typecheck
npm test
npm run build
```

실제 E2E 검증은 별도 로컬 전용 `SUPABASE_E2E_DATABASE_URL`을 사용합니다. 이 값은
테스트 계정 확인과 즉시 정리에만 쓰며 Vercel에는 설정하지 않습니다.

업로드는 UTF-8 `.html`/`.htm`, 최대 1MiB로 제한됩니다. 원본 `<head>`, 제목,
인라인·외부 스크립트, 이벤트 핸들러, 외부 CSS를 그대로 게시합니다. 퍼블리셔는
`allow-same-origin`이 없는 CSP sandbox를 적용해 업로드 코드가 퍼블리셔 오리진의
쿠키와 저장소에 접근하지 못하도록 격리합니다. HTTP 혼합 콘텐츠와 외부 서버의
CORS 정책은 브라우저 보안 규칙에 따라 여전히 차단될 수 있습니다.

## Vercel

한 저장소에서 프로젝트 두 개를 만듭니다.

1. 웹 프로젝트 Root Directory: `apps/web`
   Framework Preset은 `Next.js`, Build Command와 Output Directory는 기본값을 사용합니다.
2. 퍼블리셔 프로젝트 Root Directory: `apps/publisher`
   Framework Preset은 `Next.js`, Build Command와 Output Directory는 기본값을 사용합니다.
3. 퍼블리셔를 먼저 배포하고 그 URL을 웹 프로젝트의
   `NEXT_PUBLIC_PUBLISHER_URL`로 설정
4. 웹 프로젝트의 실제 URL을 `NEXT_PUBLIC_SITE_URL` 및 Supabase Auth Redirect URL에 설정

Vercel이 `/vercel/path0/.next`를 찾는 오류는 Root Directory가 저장소 루트로 남아
전체 workspace 빌드 결과를 잘못 찾을 때 발생합니다. 각 프로젝트의 Root Directory를
위와 같이 지정하고 Build/Output Directory override를 끄면 `.next`를 앱 기준으로
자동 인식합니다. 저장소 루트에 웹 전용 `vercel.json`을 두면 퍼블리셔 프로젝트에도
적용될 수 있으므로 사용하지 않습니다.

모든 환경변수는 Development, Preview, Production에 동일한 Supabase 프로젝트 값을
사용합니다. 단, 로컬 테스트도 같은 운영 데이터에 반영되므로 테스트 페이지 이름을
구분해 사용하는 것을 권장합니다.

## Personal API Keys and MCP

Apply `supabase/migrations/202610170001_personal_api_keys.sql` with the local-only
admin connection before deploying this release. The web runtime continues to use
only `tagworks_ingest`; no Supabase service-role key is needed.

Sign in and open **Dashboard → API & MCP** (`/dashboard/api-keys`). Create a named
Personal API Key and copy it immediately. Only its SHA-256 hash is stored. Each
account can have 10 active keys, and an owner can revoke any of their keys.
Keys authorize publishing and reading allowance only; they do not authorize
access to other users' pages, billing changes or key management.

```sh
curl https://tagworks.io/api/v1/deploy \
  -H "Authorization: Bearer $TAGWORKS_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Example","html":"<!doctype html><html><head></head><body><h1>Hello</h1></body></html>"}'
```

The response contains `page`, `publicUrl`, `pathUrl`, `subdomainUrl` and `warnings`.
`title` is required (1–100 characters), `description` is optional (up to 300), and
`html` accepts at most 2 MB of UTF-8. Vercel additionally imposes its platform
request-body limit, including JSON escaping overhead. Each successful call
creates a **new** live link and counts toward the plan's live-link limit
(Free 1, Starter 5, Pro 30, Custom as set by an admin). `PUT /api/v1/pages/{pageId}`
with `{ "html": "..." }` replaces an existing page at the same URL; edits are
unlimited but capped at 20 per hour per link. There is no automatic retry or
idempotency key: after a network timeout, check the dashboard before retrying.
Limits apply to API and browser uploads equally, including the super-admin
exemption. Requests are limited to 120 per minute per owner across all keys.
Errors use HTTP 400/413/415 for invalid bodies, 401 for invalid/revoked keys,
402 when all live links are in use (`code: link_limit` or `custom_needed`),
413 for size limits, 429 for rate limits and the hourly edit cap (with `Retry-After`), and 503 for service failure.
API originals are stored in immutable `page_versions.original_html` with
`source_storage='database'`; their `source_object_path` is a logical identifier,
not an object in the Storage bucket. Browser uploads continue to use Storage.

The authenticated MCP endpoint is `/api/mcp`, using stateless Streamable HTTP
with JSON responses, pinned to protocol revisions `2025-11-25`, `2025-06-18`,
and `2025-03-26`. It provides `deploy_html`, `update_html` and `get_plan_usage`, plus
`initialize`, `ping` and `tools/list`. Configure a compatible MCP client with:

```json
{
  "mcpServers": {
    "tagworks": {
      "url": "https://tagworks.io/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

Client configuration syntax varies. Supply the key through the client's secret
store or environment interpolation where supported. This is Personal API Key
authentication, not OAuth; OAuth-only clients cannot connect. POST requests must
accept both `application/json` and `text/event-stream`. GET returns 405 because
this server does not provide a standalone SSE stream. No session ID is required.
Transport reference: [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

### Optional per-page subdomains

By default deployments return the existing isolated publisher `/p/<slug>` URL.
To activate `https://<slug>.<publishing-domain>`, attach a wildcard domain such as
`*.pages.example.net` to the **publisher** Vercel project, configure its DNS and
TLS, then set `TAGWORKS_PUBLISHING_DOMAIN=pages.example.net` in both web and
publisher environments. Prefer a separate registrable domain from the
authenticated application. Never route uploaded HTML to the web app project.
Domain registration, DNS and wildcard certificates are external prerequisites;
setting the environment variable alone does not provision them.

The publisher rewrites each subdomain root to its assigned slug while preserving
query strings and the existing HTML sandbox, analytics relay and corner link.
`pathUrl` remains available as a fallback. The default does not fabricate an
unconfigured or unreachable subdomain URL.

Run `supabase/tests/personal_api_keys_behavior.sql` using the admin connection to
check key owner isolation, hash privacy and immediate revocation in a rolled-back
transaction.

The HTTP integration check is `scripts/e2e-api.mjs` (requires a built web server
on port 3110, publisher on 3111, and the local E2E database credentials). It seeds
and removes a disposable account, verifies API-key creation and revocation,
publishing, original-source retention, plan enforcement and MCP tool calls.
