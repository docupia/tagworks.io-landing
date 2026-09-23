# TagWorks

TagWorks는 정적 HTML을 안전하게 검사해 고정 링크로 공개하는 Next.js 서비스입니다.
카키·파스텔 랜딩, Supabase 이메일 인증, 비공개 원본 업로드, 정제된 HTML 게시,
사용자별 대시보드를 포함합니다.

## 구조

- `apps/web`: 랜딩, 회원가입·로그인, 대시보드, HTML 업로드 API
- `apps/publisher`: 인증 쿠키와 분리된 공개 HTML 전용 오리진
- `supabase/migrations`: 테이블, RLS, Storage, 공개 조회 RPC
- `site/dist`: 전환 전 정적 랜딩 보관본

공개 페이지는 앱 인증 쿠키가 전달되지 않는 별도 Vercel 프로젝트에서 제공됩니다.
원본 HTML은 `page-originals` 비공개 버킷에 저장되고, 공개 RPC는 현재 게시된
정제 결과만 반환합니다.

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
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PUBLISHER_URL`, `SUPABASE_DATABASE_URL`이
필요합니다. 퍼블리셔에는 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`만 필요합니다.
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
  -f supabase/tests/tagworks_core_schema.sql
psql "$SUPABASE_ADMIN_DATABASE_URL" -c '\password tagworks_ingest'
```

마이그레이션과 역할 비밀번호 설정에는 관리자용 Session pooler URL을 로컬에서만
사용합니다. `\password`가 비밀번호를 가려서 두 번 입력받으므로 셸 기록에 남지 않습니다.
설정 후 `tagworks_ingest` 역할의 Transaction pooler URL만 웹 앱에 넣고, 관리자 URL은
Vercel에 절대 등록하지 않습니다.

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

업로드는 UTF-8 `.html`/`.htm`, 최대 1MiB로 제한됩니다. 스크립트, 이벤트 핸들러,
폼, iframe, SVG/MathML, 외부 CSS 리소스는 제거되며, 퍼블리셔는 별도의 강한 CSP와
sandbox 헤더를 적용합니다.

## Vercel

한 저장소에서 프로젝트 두 개를 만듭니다.

1. 웹 프로젝트는 저장소 루트의 `vercel.json`을 사용해 배포할 수 있습니다.
   이 설정은 `@tagworks/web`만 빌드하고 `apps/web/.next`를 결과물로 사용합니다.
   또는 Vercel의 Root Directory를 `apps/web`으로 설정하고 Build/Output Directory
   override를 모두 끈 상태로 Next.js 기본값을 사용해도 됩니다.
2. 퍼블리셔 프로젝트 Root Directory: `apps/publisher`
   Framework Preset은 `Next.js`, Build Command와 Output Directory는 기본값을 사용합니다.
3. 퍼블리셔를 먼저 배포하고 그 URL을 웹 프로젝트의
   `NEXT_PUBLIC_PUBLISHER_URL`로 설정
4. 웹 프로젝트의 실제 URL을 `NEXT_PUBLIC_SITE_URL` 및 Supabase Auth Redirect URL에 설정

Vercel이 `/vercel/path0/.next`를 찾는 오류는 저장소 루트에서 전체 workspace 빌드를
실행하면서 실제 결과물이 `apps/web/.next`에 생성될 때 발생합니다. 이 저장소의
`vercel.json`이 웹 앱 빌드 명령과 결과 경로를 명시해 해당 불일치를 방지합니다.

모든 환경변수는 Development, Preview, Production에 동일한 Supabase 프로젝트 값을
사용합니다. 단, 로컬 테스트도 같은 운영 데이터에 반영되므로 테스트 페이지 이름을
구분해 사용하는 것을 권장합니다.
