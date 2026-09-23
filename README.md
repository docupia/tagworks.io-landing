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
Vercel의 `SUPABASE_DATABASE_URL`에는 Supabase Transaction pooler 연결 문자열을
사용하고 prepared statements를 비활성화합니다.

## Supabase 적용

```sh
psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/202609230001_tagworks_core.sql
psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/tagworks_core_schema.sql
```

Supabase Auth의 Site URL과 Redirect URLs에는 로컬 웹 주소와 실제 Vercel 웹 주소의
`/auth/callback`을 등록해야 이메일 확인 후 대시보드로 돌아옵니다.

## 검증

```sh
npm run typecheck
npm test
npm run build
```

업로드는 UTF-8 `.html`/`.htm`, 최대 1MiB로 제한됩니다. 스크립트, 이벤트 핸들러,
폼, iframe, SVG/MathML, 외부 CSS 리소스는 제거되며, 퍼블리셔는 별도의 강한 CSP와
sandbox 헤더를 적용합니다.

## Vercel

한 저장소에서 프로젝트 두 개를 만듭니다.

1. 웹 프로젝트 Root Directory: `apps/web`
2. 퍼블리셔 프로젝트 Root Directory: `apps/publisher`
3. 퍼블리셔를 먼저 배포하고 그 URL을 웹 프로젝트의
   `NEXT_PUBLIC_PUBLISHER_URL`로 설정
4. 웹 프로젝트의 실제 URL을 `NEXT_PUBLIC_SITE_URL` 및 Supabase Auth Redirect URL에 설정

모든 환경변수는 Development, Preview, Production에 동일한 Supabase 프로젝트 값을
사용합니다. 단, 로컬 테스트도 같은 운영 데이터에 반영되므로 테스트 페이지 이름을
구분해 사용하는 것을 권장합니다.
