import Link from "next/link";

import { LanguageSwitcher } from "./components/language-switcher";
import { BrandMark } from "../components/marketing/brand-mark";
import {
  AnalyticsDemo,
  ArrowIcon,
  MarketingHeader,
  RevealController,
} from "../components/marketing/marketing-interactions";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export default async function HomePage() {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  return (
    <>
      <a className="skip-link" href="#main">{tx("Skip to content", "본문으로 바로가기")}</a>
      <MarketingHeader locale={locale} />
      <RevealController />

      <main id="main">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-haze haze-one" aria-hidden="true" />
          <div className="hero-haze haze-two" aria-hidden="true" />
          <div className="shell hero-grid">
            <div className="hero-copy" data-reveal>
              <div className="eyebrow">
                <span className="eyebrow-dot" aria-hidden="true" />
                {tx("Your AI-made HTML is ready to share", "AI로 만든 HTML, 이제 공유할 차례")}
              </div>
              <h1 id="hero-title">
                {tx("Upload your HTML and publish it", "만든 HTML을 올리고,")}<br />
                <span>{tx("with one permanent link.", "하나의 링크로 공개하세요.")}</span>
              </h1>
              <p className="hero-description">
                {tx(
                  "TagWorks publishes your HTML at a permanent URL. Create an account, upload your file, and share it—no server setup required.",
                  "태그웍스는 홍보용 HTML을 안전하게 검사해 고정 링크로 공개합니다. 별도 서버 설정 없이 가입하고, 파일을 올리고, 바로 공유하세요.",
                )}
              </p>
              <div className="hero-actions">
                <Link className="button button-primary" href="/signup">
                  {tx("Start free", "무료로 시작하기")}
                  <ArrowIcon />
                </Link>
                <Link className="text-link" href="/login">
                  {tx("I already have an account", "이미 계정이 있어요")}
                  <span aria-hidden="true">↘</span>
                </Link>
              </div>
              <ul className="hero-proof" aria-label={tx("Available features", "현재 제공 기능")}>
                <li><span aria-hidden="true">✓</span> {tx("Simple signup", "간편 회원가입")}</li>
                <li><span aria-hidden="true">✓</span> {tx("HTML validation", "HTML 안전 검사")}</li>
                <li><span aria-hidden="true">✓</span> {tx("Permanent public link", "고정 공개 링크")}</li>
              </ul>
              <p className="concept-note service-note">
                <strong>{tx("Beta is open", "베타 서비스 운영 중")}</strong>
                {tx("Create an account to upload HTML and generate a public link right away.", "계정을 만들면 HTML 업로드부터 공개 링크 생성까지 바로 사용할 수 있습니다.")}
              </p>
            </div>

            <div className="hero-product" data-reveal>
              <div className="note-tab" aria-hidden="true">LIVE PRODUCT FLOW</div>
              <div className="product-window">
                <div className="window-bar">
                  <div className="window-dots" aria-hidden="true"><span /><span /><span /></div>
                  <div className="window-title">{tx("Add a new page", "새 페이지 등록")}</div>
                  <div className="window-status"><span aria-hidden="true" /> {tx("Service available", "서비스 이용 가능")}</div>
                </div>

                <div className="upload-card">
                  <div className="file-icon" aria-hidden="true">
                    <svg viewBox="0 0 32 38"><path d="M5 2h14l8 8v26H5z" /><path d="M19 2v9h8" /><path d="M10 21h12M10 27h8" /></svg>
                  </div>
                  <div className="file-info">
                    <strong>product-page.html</strong>
                    <span>824 KB · {tx("Static HTML", "정적 HTML")}</span>
                  </div>
                  <div className="check-badge"><span aria-hidden="true">✓</span> {tx("Check passed", "검사 통과")}</div>
                </div>

                <div className="publish-line" aria-label={tx("Permanent public URL example", "고정 공개 주소 예시")}>
                  <div>
                    <span className="mini-label">{tx("Permanent public URL", "고정 공개 주소")}</span>
                    <code>/p/slow-morning</code>
                  </div>
                  <span className="live-pill"><i aria-hidden="true" /> {tx("Published", "공개됨")}</span>
                </div>

                <div className="mini-dashboard">
                  <div className="mini-dashboard-head">
                    <div>
                      <span className="mini-label">{tx("Ready to publish", "공개 준비 완료")}</span>
                      <strong>{tx("Copy the page link and share it", "페이지 링크를 복사해 공유하세요")}</strong>
                    </div>
                    <span className="percent-pill">{tx("Check complete", "안전 검사 완료")}</span>
                  </div>

                  <div className="flow-preview" aria-label={tx("HTML processing steps", "HTML 처리 단계")}>
                    <div className="flow-row">
                      <span>{tx("File upload", "파일 업로드")}</span><div className="bar-track"><i style={{ width: "100%", background: "var(--peach)" }} /></div><b>{tx("Done", "완료")}</b>
                    </div>
                    <div className="flow-row">
                      <span>{tx("Safety check", "안전 검사")}</span><div className="bar-track"><i style={{ width: "100%", background: "var(--sky)" }} /></div><b>{tx("Done", "완료")}</b>
                    </div>
                    <div className="flow-row">
                      <span>{tx("Link creation", "링크 생성")}</span><div className="bar-track"><i style={{ width: "100%", background: "var(--lilac)" }} /></div><b>{tx("Done", "완료")}</b>
                    </div>
                  </div>

                  <div className="click-summary">
                    <span className="signal-dot signal-sage" aria-hidden="true" />
                    <div><strong>{tx("Published page", "공개 페이지")}</strong><small>{tx("Anyone with the link can visit", "누구나 링크로 방문 가능")}</small></div>
                    <span className="summary-arrow" aria-hidden="true">→</span>
                    <span className="summary-number" aria-label={tx("Published", "공개 완료")}>✓</span>
                  </div>
                </div>
              </div>
              <div className="floating-tag tag-fixed" aria-hidden="true">{tx("One permanent URL", "한 번 만든 고정 주소")}</div>
              <div className="floating-tag tag-source" aria-hidden="true">{tx("Isolated publishing", "안전한 공개 환경")}</div>
            </div>
          </div>
        </section>

        <section className="value-strip" aria-label={tx("TagWorks core value", "TagWorks 핵심 가치")}>
          <div className="shell value-grid">
            <article><span className="value-number">01</span><div><h2>{tx("Sign up", "가입")}</h2><p>{tx("Just use your email", "이메일로 간단하게")}</p></div></article>
            <article><span className="value-number">02</span><div><h2>{tx("Upload", "업로드")}</h2><p>{tx("One HTML file is enough", "HTML 한 장이면 충분")}</p></div></article>
            <article><span className="value-number">03</span><div><h2>{tx("Check", "검사")}</h2><p>{tx("Validate before publishing", "위험 요소는 안전하게 제거")}</p></div></article>
            <article><span className="value-number">04</span><div><h2>{tx("Publish", "공개")}</h2><p>{tx("Share a permanent link", "고정 링크를 바로 공유")}</p></div></article>
          </div>
        </section>

        <section className="section workflow" id="workflow" aria-labelledby="workflow-title">
          <div className="shell">
            <div className="section-heading" data-reveal>
              <span className="section-kicker">{tx("From one file to one link", "한 장에서 링크까지")}</span>
              <h2 id="workflow-title">{tx("Skip complicated deployment.", "복잡한 배포 대신,")}<br />{tx("Follow three clear steps.", "세 번의 명확한 단계.")}</h2>
              <p>{tx("No need to learn code or server setup. Sign up, upload your file, and share the link.", "코드나 서버 설정을 다시 배우지 않아도 됩니다. 가입하고, 파일을 확인하고, 링크를 공유하세요.")}</p>
            </div>

            <ol className="steps-grid">
              <li className="step-card step-upload" data-reveal>
                <div className="step-topline"><span>STEP 01</span><i aria-hidden="true" /></div>
                <div className="step-visual upload-visual" aria-hidden="true">
                  <div className="drop-zone">
                    <svg viewBox="0 0 32 32"><path d="M16 22V7m0 0-6 6m6-6 6 6M7 20v5h18v-5" /></svg>
                    <span>{tx("HTML file", "HTML 파일")}</span>
                  </div>
                </div>
                <h3>{tx("Upload your file", "파일을 올려요")}</h3>
                <p>{tx("Log in, add a management title and description, then choose the HTML file to publish.", "로그인 후 제목과 설명을 적고, 공개할 정적 HTML 파일을 선택합니다.")}</p>
              </li>
              <li className="step-card step-publish" data-reveal>
                <div className="step-topline"><span>STEP 02</span><i aria-hidden="true" /></div>
                <div className="step-visual version-visual" aria-hidden="true">
                  <div className="version-card version-old"><span>HTML</span><b>{tx("Original saved", "원본 보관")}</b></div>
                  <div className="version-arrow">→</div>
                  <div className="version-card version-new"><span>SAFE</span><b>{tx("Safety check", "안전 검사")}</b></div>
                  <code>{tx("isolated execution", "격리 환경에서 실행")}</code>
                </div>
                <h3>{tx("Validate it for publishing", "안전하게 검사해요")}</h3>
                <p>{tx("We inspect the document and publish it in an isolated environment that keeps your account separate.", "문서를 검사한 뒤 계정 정보와 분리된 격리 환경에서 공개합니다.")}</p>
              </li>
              <li className="step-card step-measure" data-reveal>
                <div className="step-topline"><span>STEP 03</span><i aria-hidden="true" /></div>
                <div className="step-visual measure-visual" aria-hidden="true">
                  <div><span>{tx("Upload", "업로드")}</span><i style={{ width: "100%" }} /></div>
                  <div><span>{tx("Check", "검사")}</span><i style={{ width: "100%" }} /></div>
                  <div><span>{tx("Publish", "공개")}</span><i style={{ width: "100%" }} /></div>
                </div>
                <h3>{tx("Publish at a permanent URL", "고정 주소로 공개해요")}</h3>
                <p>{tx("As soon as the upload finishes, a unique shareable URL is created and saved to your dashboard.", "업로드가 끝나면 바로 공유할 수 있는 고유 주소가 만들어지고 대시보드에 보관됩니다.")}</p>
              </li>
            </ol>

            <div className="workflow-action" data-reveal>
              <Link className="button button-primary" href="/signup">{tx("Publish my HTML", "내 HTML 공개하기")} <ArrowIcon /></Link>
            </div>
          </div>
        </section>

        <section className="section insights" id="product-view" aria-labelledby="insights-title">
          <div className="shell">
            <div className="insights-heading" data-reveal>
              <div>
                <span className="section-kicker">{tx("Per-page visit flow analytics", "페이지별 방문 흐름 분석")}</span>
                <h2 id="insights-title">{tx("See the journey,", "숫자보다 흐름이")}<br />{tx("not just the numbers.", "먼저 보이게.")}</h2>
              </div>
              <p>
                {tx("See where visits started and which external links they reached in analytics for each page.", "방문 세션이 어디에서 시작되어 어떤 외부 링크로 이어졌는지 페이지별 분석 화면에서 확인할 수 있습니다.")}
              </p>
            </div>
            <AnalyticsDemo locale={locale} />
          </div>
        </section>

        <section className="section principles" id="principles" aria-labelledby="principles-title">
          <div className="shell principles-grid">
            <div className="principles-copy" data-reveal>
              <span className="section-kicker">{tx("Publishing principles", "공개 원칙")}</span>
              <h2 id="principles-title">{tx("Publish in isolation.", "안전하게 공개하고,")}<br />{tx("Keep the original private.", "원본은 따로 지킵니다.")}</h2>
              <p>
                {tx("We inspect each document before publishing and serve it in an environment separated from your login and management data.", "모든 HTML을 그대로 실행하는 호스팅이 아닙니다. 공개 전 지원 범위를 검사하고, 로그인 정보와 분리된 환경에서 정제된 버전만 제공합니다.")}
              </p>
              <a className="text-link" href="#faq">{tx("Read the FAQ", "자주 묻는 질문 보기")} <span aria-hidden="true">↓</span></a>
            </div>

            <div className="principle-board" data-reveal>
              <div className="board-head">
                <span>STATIC HTML CHECK</span>
                <span className="secure-state"><i aria-hidden="true" /> {tx("Check complete", "검사 완료")}</span>
              </div>
              <div className="board-file">
                <div className="board-file-icon" aria-hidden="true">HTML</div>
                <div><strong>class-intro.html</strong><span>{tx("Isolated public copy · original stored privately", "정제된 공개본 · 원본은 비공개 보관")}</span></div>
              </div>
              <div className="check-groups">
                <article className="allowed-group">
                  <div className="check-group-title"><span aria-hidden="true">✓</span><strong>{tx("Supported", "지원해요")}</strong></div>
                  <ul>
                    <li>{tx("HTML content and layout", "정적 HTML 본문과 레이아웃")}</li>
                    <li>{tx("Inline and external CSS", "파일 안에 포함된 CSS")}</li>
                    <li>{tx("Standard HTTPS links", "일반 HTTPS 외부 링크")}</li>
                    <li>{tx("Embedded PNG and JPG images", "파일에 포함된 PNG·JPG 이미지")}</li>
                  </ul>
                </article>
                <article className="blocked-group">
                  <div className="check-group-title"><span aria-hidden="true">×</span><strong>{tx("Restricted", "제거하거나 막아요")}</strong></div>
                  <ul>
                    <li>{tx("Unsafe browser capabilities", "위험한 브라우저 기능")}</li>
                    <li>{tx("Account or publisher data access", "계정·퍼블리셔 데이터 접근")}</li>
                    <li>{tx("Server, database, or API secrets", "서버·DB·API 비밀키")}</li>
                    <li>{tx("Missing local file paths", "누락된 로컬 파일 경로")}</li>
                  </ul>
                </article>
              </div>
              <div className="board-foot">
                <span>{tx("Dashboard", "관리 화면")}</span><i aria-hidden="true" /><span>{tx("Isolated public environment", "분리된 공개 환경")}</span><i aria-hidden="true" /><span>{tx("Visitor", "방문자")}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section use-cases" aria-labelledby="use-cases-title">
          <div className="shell">
            <div className="use-cases-head" data-reveal>
              <div>
                <span className="section-kicker">{tx("Who is it for?", "누구를 위한 도구인가요?")}</span>
                <h2 id="use-cases-title">{tx("You made the page.", "페이지는 만들었지만,")}<br />{tx("Deployment shouldn't get in the way.", "배포가 낯선 사람들.")}</h2>
              </div>
              <p>{tx("Built for independent creators who want to turn an AI-made page into a link real customers can visit.", "AI 도구로 완성한 홍보 페이지를 실제 고객이 만나는 링크로 바꾸고 싶은 1인 운영자부터 시작합니다.")}</p>
            </div>
            <div className="use-case-grid">
              <article className="use-case-card" data-reveal>
                <span className="use-case-index">01</span>
                <div className="use-case-signal signal-product" aria-hidden="true">
                  <span>PRODUCT PAGE</span><strong>{tx("Product story", "상품 소개")}</strong><code>fixed · link</code>
                </div>
                <h3>{tx("Introduce a small product", "작은 상품을 소개할 때")}</h3>
                <p>{tx("Upload your product page and share its public link on Instagram, your blog, or anywhere else.", "상품 설명 HTML을 올리고, 발급된 공개 링크를 인스타그램과 블로그에서 바로 공유합니다.")}</p>
                <div className="tag-row"><span>{tx("Product page", "상품 소개")}</span><span>{tx("Permanent link", "고정 링크")}</span></div>
              </article>
              <article className="use-case-card" data-reveal>
                <span className="use-case-index">02</span>
                <div className="use-case-signal signal-republish" aria-hidden="true">
                  <span>CLASS OPEN</span><strong>HTML → URL</strong><code>/p/my-class</code>
                </div>
                <h3>{tx("Open a class or service", "강의·서비스를 모집할 때")}</h3>
                <p>{tx("Turn a finished signup page into one URL without configuring a separate hosting service.", "완성된 모집 페이지를 별도의 호스팅 설정 없이 하나의 주소로 만들어 안내합니다.")}</p>
                <div className="tag-row"><span>{tx("Publish fast", "빠른 공개")}</span><span>{tx("Share easily", "쉬운 공유")}</span></div>
              </article>
              <article className="use-case-card" data-reveal>
                <span className="use-case-index">03</span>
                <div className="use-case-signal signal-flow" aria-hidden="true">
                  <span>SAFE PUBLISH</span><strong>check → live</strong><code>static · html</code>
                </div>
                <h3>{tx("Share in an isolated environment", "안전하게 전달하고 싶을 때")}</h3>
                <p>{tx("We inspect each upload and serve the public copy separately from your authenticated dashboard.", "지원하지 않는 동작을 검사하고 정제된 공개본을 로그인 환경과 분리해 제공합니다.")}</p>
                <div className="tag-row"><span>{tx("Validation", "안전 검사")}</span><span>{tx("Isolated publishing", "분리 공개")}</span></div>
              </article>
            </div>
          </div>
        </section>

        <section className="section faq" id="faq" aria-labelledby="faq-title">
          <div className="shell faq-grid">
            <div className="faq-heading" data-reveal>
              <span className="section-kicker">{tx("Frequently asked questions", "자주 묻는 질문")}</span>
              <h2 id="faq-title">{tx("Clear answers.", "약속할 수 있는 것만,")}<br />{tx("No vague promises.", "분명하게 말합니다.")}</h2>
            </div>
            <div className="faq-list" data-reveal>
              <details open>
                <summary><span>{tx("Will my HTML look and behave the same?", "HTML 디자인이 그대로 공개되나요?")}</span><i aria-hidden="true" /></summary>
                <p>{tx("Your original HTML, head scripts, and external styles are preserved. It runs inside a sandboxed publishing environment, so browser-restricted capabilities may still be unavailable.", "원본 HTML과 헤더 스크립트, 외부 CSS를 유지합니다. 다만 격리된 공개 환경에서 실행되므로 브라우저가 제한하는 기능은 사용할 수 없습니다.")}</p>
              </details>
              <details>
                <summary><span>{tx("When is the URL created?", "업로드하면 주소는 언제 만들어지나요?")}</span><i aria-hidden="true" /></summary>
                <p>{tx("A permanent URL is created as soon as validation and storage finish. You can reopen it or download its QR code from your dashboard.", "안전 검사와 저장이 끝나면 해당 페이지 전용 고정 주소가 즉시 만들어집니다. 대시보드에서 언제든 다시 복사할 수 있습니다.")}</p>
              </details>
              <details>
                <summary><span>{tx("Can I upload any file?", "아무 파일이나 올릴 수 있나요?")}</span><i aria-hidden="true" /></summary>
                <p>{tx("The beta supports one HTML file within the size limit. Local image or CSS files are not uploaded with it, so use HTTPS URLs or resources embedded in the document.", "현재 베타는 용량 제한 안의 단일 HTML 파일을 지원합니다. 로컬 폴더의 이미지나 CSS 파일은 함께 올라가지 않으므로 HTTPS 주소나 문서에 포함된 리소스를 사용해 주세요.")}</p>
              </details>
              <details>
                <summary><span>{tx("Is my login information sent to the public page?", "로그인 정보가 공개 페이지로 전달되나요?")}</span><i aria-hidden="true" /></summary>
                <p>{tx("No. The dashboard and public page are served separately. The public page receives only the content and minimum public configuration it needs.", "아닙니다. 관리 화면과 공개 페이지는 분리해 제공하고, 공개 페이지에는 정제된 콘텐츠와 공개에 필요한 최소 정보만 전달합니다.")}</p>
              </details>
            </div>
          </div>
        </section>

        <section className="closing-section" aria-labelledby="closing-title">
          <div className="shell closing-card" data-reveal>
            <div className="closing-tag" aria-hidden="true">BETA IS OPEN</div>
            <span className="section-kicker">{tx("Take your HTML to the next step", "당신의 HTML, 다음 단계로")}</span>
            <h2 id="closing-title">{tx("Your page is ready.", "만들어둔 페이지가 있다면,")}<br />{tx("Now give it a link.", "이제 링크로 만날 차례예요.")}</h2>
            <p>{tx("Create an account and upload your HTML to get a permanent public link right away.", "계정을 만들고 HTML 파일을 올리면, 안전 검사 후 고정 공개 링크를 바로 받을 수 있습니다.")}</p>
            <div className="closing-actions">
              <Link className="button button-primary" href="/signup">{tx("Start free", "무료로 시작하기")} <ArrowIcon /></Link>
              <Link className="text-link" href="/login">{tx("Log in", "로그인")} <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <a className="brand" href="#top" aria-label={tx("TagWorks home", "TagWorks 홈")}>
            <BrandMark />
            <span>TagWorks</span>
          </a>
          <p>{tx("The simplest way to turn HTML into a public link.", "HTML을 공개 링크로 바꾸는 가장 단순한 방법.")}</p>
          <LanguageSwitcher locale={locale} />
          <div className="footer-links"><a href="#workflow">{tx("How it works", "작동 방식")}</a><a href="#principles">{tx("What we support", "지원 범위")}</a><a href="#faq">FAQ</a></div>
          <span>© {new Date().getFullYear()} TagWorks</span>
        </div>
      </footer>
    </>
  );
}
