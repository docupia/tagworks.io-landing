import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { PricingSection } from "./pricing/section";
import styles from "./home.module.css";

const sampleSources = [
  { english: "Instagram", korean: "인스타그램", visits: 142, clicks: 31 },
  { english: "Blog", korean: "블로그", visits: 58, clicks: 9 },
  { english: "Direct", korean: "직접 방문", visits: 20, clicks: 2 },
];

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  // Supabase can return to the Site URL when it cannot use the requested callback.
  if (typeof code === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(code)) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }
  const locale = await getLocale();
  const user = await getCurrentUser();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const maxVisits = Math.max(...sampleSources.map((row) => row.visits));

  const faq: Array<[string, string]> = [
    [tx("Do I need to know how to code?", "코딩을 몰라도 되나요?"), tx("No. Upload the file your AI made, or ask your AI to publish it for you.", "네. AI가 만든 파일을 올리거나, AI에게 대신 게시해 달라고 하면 돼요.")],
    [tx("Does editing a page count against my plan?", "페이지를 수정하면 한도가 줄어드나요?"), tx("No. Edit as often as you like; your URL and QR code stay the same.", "아니요. 원하는 만큼 수정하세요. 주소와 QR 코드도 그대로예요.")],
    [tx("Can I upload images?", "이미지도 올릴 수 있나요?"), tx("Yes. PNG, JPG, WebP and GIF. We resize and compress them automatically.", "네. PNG, JPG, WebP, GIF를 지원하고, 크기 조정과 압축은 자동으로 해요.")],
    [tx("What if my page gets a lot of visitors?", "방문자가 아주 많으면 어떻게 되나요?"), tx("Your page stays online. If you pass your plan's monthly views, we'll suggest an upgrade or reach out.", "페이지는 계속 공개돼요. 플랜의 월 조회수를 넘으면 업그레이드를 제안하거나 연락드릴게요.")],
  ];
  const moreFaq: Array<[string, string]> = [
    [tx("What counts as a link?", "링크는 어떻게 세나요?"), tx("A page that is live. Unpublish or delete one to free a slot.", "공개 중인 페이지 하나가 링크 하나예요. 비공개로 바꾸거나 삭제하면 자리가 돌아와요.")],
    [tx("Can I upload any file?", "아무 파일이나 올릴 수 있나요?"), tx("One HTML file and the images it uses. Local CSS files are not uploaded, so keep styles inside the HTML or link them over HTTPS. Publishing from an AI tool through MCP or the API keeps everything in one file.", "HTML 파일 하나와 그 페이지가 쓰는 이미지를 올릴 수 있어요. 로컬 CSS 파일은 함께 올라가지 않으니 스타일은 HTML 안에 넣거나 HTTPS 주소로 연결해 주세요. AI 도구에서 MCP나 API로 게시하면 한 파일로 깔끔하게 올릴 수 있어요.")],
    [tx("What happens to my old images when I edit?", "수정하면 예전 이미지는 어떻게 되나요?"), tx("When you publish an edit, the previous images are removed and replaced by the ones you upload with it. Upload every image the page uses each time.", "수정본을 게시하면 이전 이미지는 지워지고 함께 올린 이미지로 바뀌어요. 매번 페이지에 쓰는 이미지를 모두 올려 주세요.")],
    [tx("Will my HTML look and behave the same?", "HTML 디자인이 그대로 공개되나요?"), tx("Your original HTML, head scripts, and external styles are preserved. It runs inside a sandboxed publishing environment, so browser-restricted capabilities may still be unavailable.", "원본 HTML과 헤더 스크립트, 외부 CSS를 유지합니다. 다만 격리된 공개 환경에서 실행되므로 브라우저가 제한하는 기능은 사용할 수 없습니다.")],
    [tx("Can I cancel anytime?", "언제든 해지할 수 있나요?"), tx("Yes. You keep your plan until the end of the period you paid for.", "네. 결제한 기간이 끝날 때까지 플랜을 그대로 쓸 수 있어요.")],
    [tx("Is my login information sent to the public page?", "로그인 정보가 공개 페이지로 전달되나요?"), tx("No. The dashboard and public page are served separately. The public page receives only the content and minimum public configuration it needs.", "아닙니다. 관리 화면과 공개 페이지는 분리해 제공하고, 공개 페이지에는 정제된 콘텐츠와 공개에 필요한 최소 정보만 전달합니다.")],
  ];

  return (
    <div className={styles.page}>
      <a className="skip-link" href="#main">{tx("Skip to content", "본문으로 바로가기")}</a>
      <SiteHeader locale={locale} member={user ? user.email ?? "Member" : undefined} />

      <main id="main">
        <section className={`${styles.shell} ${styles.hero}`} id="top" aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.badge}>{tx("Free forever for your first link", "첫 링크는 계속 무료")}</span>
            <h1 id="hero-title">{tx("Turn AI-made pages into links. See who clicks.", "AI로 만든 페이지를 링크로. 누가 눌렀는지까지.")}</h1>
            <p className={styles.lead}>{tx("Ask your AI to publish your page to TagWorks, or drop in the HTML file. Get a permanent link, a QR code and click tracking in seconds.", "AI에게 TagWorks로 게시해 달라고 하거나 HTML 파일을 올리세요. 고정 링크와 QR 코드, 클릭 분석이 바로 준비돼요.")}</p>
            <div className={styles.ctaRow}>
              <Link prefetch={false} className={styles.primary} href={user ? "/pages/new" : "/signup"}>{user ? tx("Upload HTML", "HTML 업로드") : tx("Start free", "무료로 시작하기")}</Link>
              <a className={styles.secondary} href="#api-mcp">{tx("Connect your AI", "AI 연결하기")}</a>
            </div>
            <p className={styles.small}>{tx("No card needed · Unlimited edits · Images included", "카드 등록 없음 · 수정 무제한 · 이미지 포함")}</p>
          </div>

          <div className={styles.demo} aria-label={tx("Example: publishing a page with AI", "예시: AI로 페이지 게시하기")} role="img">
            <p className={styles.bubbleUser}>{tx("Publish this class signup page to TagWorks.", "이 클래스 모집 페이지를 TagWorks에 게시해 줘.")}</p>
            <p className={styles.bubbleAi}>
              {tx("Done. Your page is live:", "완료했어요. 페이지가 공개됐어요:")}<br />
              <strong>tagworks.io/p/spring-class</strong>
            </p>
            <div className={styles.statCard}>
              <div className={styles.statHead}>
                <span>{tx("Last 7 days · sample", "최근 7일 · 샘플")}</span>
                <span>spring-class</span>
              </div>
              <dl className={styles.stats}>
                <div><dt>{tx("visits", "방문")}</dt><dd>220</dd></div>
                <div><dt>{tx("clicked “Apply”", "‘신청하기’ 클릭")}</dt><dd>42</dd></div>
                <div><dt>{tx("top source", "최다 유입")}</dt><dd>Instagram</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section className={styles.band} id="how" aria-labelledby="how-title">
          <div className={styles.shell}>
            <h2 id="how-title">{tx("Three steps. No hosting, no code.", "세 단계면 끝. 호스팅도 코드도 필요 없어요.")}</h2>
            <ol className={styles.steps}>
              <li>
                <span className={styles.stepNo}>1</span>
                <h3>{tx("Make it with AI", "AI로 만들기")}</h3>
                <p>{tx("Any tool that writes HTML works: Claude, ChatGPT, Gemini, Cursor.", "HTML을 만드는 도구라면 무엇이든 좋아요. Claude, ChatGPT, Gemini, Cursor.")}</p>
              </li>
              <li>
                <span className={styles.stepNo}>2</span>
                <h3>{tx("Publish in one step", "한 번에 게시")}</h3>
                <p>{tx("Ask your AI to publish it through TagWorks MCP, or drag and drop the file with its images.", "AI에게 TagWorks MCP로 게시해 달라고 하거나, 파일과 이미지를 끌어다 놓으세요.")}</p>
              </li>
              <li>
                <span className={styles.stepNo}>3</span>
                <h3>{tx("Share and see who clicks", "공유하고 클릭 확인")}</h3>
                <p>{tx("Post the link or QR code anywhere. See which source brings visitors and which buttons they click.", "링크나 QR 코드를 어디든 올리세요. 어느 채널에서 방문자가 오고 어떤 버튼을 누르는지 볼 수 있어요.")}</p>
              </li>
            </ol>
          </div>
        </section>

        <section className={`${styles.shell} ${styles.split}`} aria-labelledby="insights-title">
          <div className={styles.splitCopy}>
            <h2 id="insights-title">{tx("Know which post actually works.", "어떤 게시물이 효과 있는지 알 수 있어요.")}</h2>
            <p>{tx("Every link shows where visitors came from and which links they clicked next. Spend your time on the channel that brings sign-ups.", "링크마다 방문자가 어디서 왔고 다음에 무엇을 눌렀는지 보여 줘요. 신청이 들어오는 채널에 시간을 쓰세요.")}</p>
          </div>
          <div className={styles.sources}>
            <div className={styles.sourcesHead}><span>{tx("Source", "유입 출처")}</span><span>{tx("Visits → clicks", "방문 → 클릭")}</span></div>
            {sampleSources.map((row) => (
              <div className={styles.sourceRow} key={row.english}>
                <div className={styles.sourceLine}>
                  <span>{tx(row.english, row.korean)}</span>
                  <span>{row.visits} → <strong>{row.clicks}</strong></span>
                </div>
                <div className={styles.bar} aria-hidden="true"><i style={{ width: `${Math.round((row.visits / maxVisits) * 100)}%` }} /></div>
              </div>
            ))}
            <p className={styles.small}>{tx("Sample data", "샘플 데이터")}</p>
          </div>
        </section>

        <div className={styles.band}>
          <Suspense fallback={<section id="pricing" className={styles.shell} aria-busy="true"><h2>{tx("Pricing", "요금제")}</h2></section>}>
            <PricingSection />
          </Suspense>
        </div>

        <section className={`${styles.shell} ${styles.split}`} id="api-mcp" aria-labelledby="api-mcp-title">
          <div className={styles.splitCopy}>
            <h2 id="api-mcp-title">API &amp; MCP</h2>
            <p>{tx("Publish HTML from your own scripts with the REST API, or from a compatible AI client with MCP. Both return a link you can share.", "REST API로 스크립트에서, MCP로 호환되는 AI 도구에서 HTML을 게시하고 공유 링크를 받을 수 있습니다.")}</p>
          </div>
          <div className={styles.apiCard}>
            <dl>
              <dt>MCP · Streamable HTTP</dt>
              <dd><code>https://tagworks.io/api/mcp</code></dd>
              <dt>{tx("HTML publishing API", "HTML 게시 API")}</dt>
              <dd><code>POST https://tagworks.io/api/v1/deploy</code></dd>
            </dl>
            <p>{tx("Both require a personal API key. Sign in to create one under Dashboard → API & MCP.", "두 기능 모두 개인 API 키가 필요합니다. 로그인 후 대시보드 → API & MCP에서 키를 발급할 수 있습니다.")}</p>
            <Link prefetch={false} className={styles.textLink} href="/login?next=%2Fdashboard%2Fapi-keys">{tx("Log in to manage API keys", "로그인하여 API 키 관리")}</Link>
          </div>
        </section>

        <section className={`${styles.narrow} ${styles.faq}`} id="faq" aria-labelledby="faq-title">
          <h2 id="faq-title">{tx("Questions", "자주 묻는 질문")}</h2>
          <div className={styles.faqList}>
            {faq.map(([question, answer]) => (
              <div className={styles.faqItem} key={question}><h3>{question}</h3><p>{answer}</p></div>
            ))}
          </div>
          <details className={styles.moreFaq}>
            <summary>{tx("See all questions", "질문 더 보기")}</summary>
            <div className={styles.faqList}>
              {moreFaq.map(([question, answer]) => (
                <div className={styles.faqItem} key={question}><h3>{question}</h3><p>{answer}</p></div>
              ))}
            </div>
          </details>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div className={styles.shell}>
            <h2 id="closing-title">{tx("Your page is ready. Give it a link.", "만든 페이지, 이제 링크로 공유하세요.")}</h2>
            <p>{tx("Free forever for your first link. No card needed.", "첫 링크는 계속 무료예요. 카드 등록도 필요 없어요.")}</p>
            <Link prefetch={false} className={styles.closingButton} href={user ? "/pages/new" : "/signup"}>{user ? tx("Upload HTML", "HTML 업로드") : tx("Start free", "무료로 시작하기")}</Link>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
