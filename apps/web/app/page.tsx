import Link from "next/link";

import { BrandMark } from "../components/marketing/brand-mark";
import {
  AnalyticsDemo,
  ArrowIcon,
  MarketingHeader,
  RevealController,
} from "../components/marketing/marketing-interactions";

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main">본문으로 바로가기</a>
      <MarketingHeader />
      <RevealController />

      <main id="main">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-haze haze-one" aria-hidden="true" />
          <div className="hero-haze haze-two" aria-hidden="true" />
          <div className="shell hero-grid">
            <div className="hero-copy" data-reveal>
              <div className="eyebrow">
                <span className="eyebrow-dot" aria-hidden="true" />
                AI로 만든 HTML, 이제 공유할 차례
              </div>
              <h1 id="hero-title">
                만든 HTML을 올리고,<br />
                <span>하나의 링크</span>로 공개하세요.
              </h1>
              <p className="hero-description">
                태그웍스는 홍보용 HTML을 안전하게 검사해 고정 링크로 공개합니다.
                별도 서버 설정 없이 가입하고, 파일을 올리고, 바로 공유하세요.
              </p>
              <div className="hero-actions">
                <Link className="button button-primary" href="/signup">
                  무료로 시작하기
                  <ArrowIcon />
                </Link>
                <Link className="text-link" href="/login">
                  이미 계정이 있어요
                  <span aria-hidden="true">↘</span>
                </Link>
              </div>
              <ul className="hero-proof" aria-label="현재 제공 기능">
                <li><span aria-hidden="true">✓</span> 간편 회원가입</li>
                <li><span aria-hidden="true">✓</span> HTML 안전 검사</li>
                <li><span aria-hidden="true">✓</span> 고정 공개 링크</li>
              </ul>
              <p className="concept-note service-note">
                <strong>베타 서비스 운영 중</strong>
                계정을 만들면 HTML 업로드부터 공개 링크 생성까지 바로 사용할 수 있습니다.
              </p>
            </div>

            <div className="hero-product" data-reveal>
              <div className="note-tab" aria-hidden="true">LIVE PRODUCT FLOW</div>
              <div className="product-window">
                <div className="window-bar">
                  <div className="window-dots" aria-hidden="true"><span /><span /><span /></div>
                  <div className="window-title">새 페이지 등록</div>
                  <div className="window-status"><span aria-hidden="true" /> 서비스 이용 가능</div>
                </div>

                <div className="upload-card">
                  <div className="file-icon" aria-hidden="true">
                    <svg viewBox="0 0 32 38"><path d="M5 2h14l8 8v26H5z" /><path d="M19 2v9h8" /><path d="M10 21h12M10 27h8" /></svg>
                  </div>
                  <div className="file-info">
                    <strong>product-page.html</strong>
                    <span>824 KB · 정적 HTML</span>
                  </div>
                  <div className="check-badge"><span aria-hidden="true">✓</span> 검사 통과</div>
                </div>

                <div className="publish-line" aria-label="고정 공개 주소 예시">
                  <div>
                    <span className="mini-label">고정 공개 주소</span>
                    <code>/p/slow-morning</code>
                  </div>
                  <span className="live-pill"><i aria-hidden="true" /> 공개됨</span>
                </div>

                <div className="mini-dashboard">
                  <div className="mini-dashboard-head">
                    <div>
                      <span className="mini-label">공개 준비 완료</span>
                      <strong>페이지 링크를 복사해 공유하세요</strong>
                    </div>
                    <span className="percent-pill">안전 검사 완료</span>
                  </div>

                  <div className="flow-preview" aria-label="HTML 처리 단계">
                    <div className="flow-row">
                      <span>파일 업로드</span><div className="bar-track"><i style={{ width: "100%", background: "var(--peach)" }} /></div><b>완료</b>
                    </div>
                    <div className="flow-row">
                      <span>안전 검사</span><div className="bar-track"><i style={{ width: "100%", background: "var(--sky)" }} /></div><b>완료</b>
                    </div>
                    <div className="flow-row">
                      <span>링크 생성</span><div className="bar-track"><i style={{ width: "100%", background: "var(--lilac)" }} /></div><b>완료</b>
                    </div>
                  </div>

                  <div className="click-summary">
                    <span className="signal-dot signal-sage" aria-hidden="true" />
                    <div><strong>공개 페이지</strong><small>누구나 링크로 방문 가능</small></div>
                    <span className="summary-arrow" aria-hidden="true">→</span>
                    <span className="summary-number" aria-label="공개 완료">✓</span>
                  </div>
                </div>
              </div>
              <div className="floating-tag tag-fixed" aria-hidden="true">한 번 만든 고정 주소</div>
              <div className="floating-tag tag-source" aria-hidden="true">안전한 공개 환경</div>
            </div>
          </div>
        </section>

        <section className="value-strip" aria-label="TagWorks 핵심 가치">
          <div className="shell value-grid">
            <article><span className="value-number">01</span><div><h2>가입</h2><p>이메일로 간단하게</p></div></article>
            <article><span className="value-number">02</span><div><h2>업로드</h2><p>HTML 한 장이면 충분</p></div></article>
            <article><span className="value-number">03</span><div><h2>검사</h2><p>위험 요소는 안전하게 제거</p></div></article>
            <article><span className="value-number">04</span><div><h2>공개</h2><p>고정 링크를 바로 공유</p></div></article>
          </div>
        </section>

        <section className="section workflow" id="workflow" aria-labelledby="workflow-title">
          <div className="shell">
            <div className="section-heading" data-reveal>
              <span className="section-kicker">한 장에서 링크까지</span>
              <h2 id="workflow-title">복잡한 배포 대신,<br />세 번의 명확한 단계.</h2>
              <p>코드나 서버 설정을 다시 배우지 않아도 됩니다. 가입하고, 파일을 확인하고, 링크를 공유하세요.</p>
            </div>

            <ol className="steps-grid">
              <li className="step-card step-upload" data-reveal>
                <div className="step-topline"><span>STEP 01</span><i aria-hidden="true" /></div>
                <div className="step-visual upload-visual" aria-hidden="true">
                  <div className="drop-zone">
                    <svg viewBox="0 0 32 32"><path d="M16 22V7m0 0-6 6m6-6 6 6M7 20v5h18v-5" /></svg>
                    <span>HTML 파일</span>
                  </div>
                </div>
                <h3>파일을 올려요</h3>
                <p>로그인 후 제목과 설명을 적고, 공개할 정적 HTML 파일을 선택합니다.</p>
              </li>
              <li className="step-card step-publish" data-reveal>
                <div className="step-topline"><span>STEP 02</span><i aria-hidden="true" /></div>
                <div className="step-visual version-visual" aria-hidden="true">
                  <div className="version-card version-old"><span>HTML</span><b>원본 보관</b></div>
                  <div className="version-arrow">→</div>
                  <div className="version-card version-new"><span>SAFE</span><b>안전 검사</b></div>
                  <code>script · form 제거</code>
                </div>
                <h3>안전하게 검사해요</h3>
                <p>스크립트와 임의 폼 등 지원하지 않는 요소는 제거하고, 공개 가능한 정적 문서로 정리합니다.</p>
              </li>
              <li className="step-card step-measure" data-reveal>
                <div className="step-topline"><span>STEP 03</span><i aria-hidden="true" /></div>
                <div className="step-visual measure-visual" aria-hidden="true">
                  <div><span>업로드</span><i style={{ width: "100%" }} /></div>
                  <div><span>검사</span><i style={{ width: "100%" }} /></div>
                  <div><span>공개</span><i style={{ width: "100%" }} /></div>
                </div>
                <h3>고정 주소로 공개해요</h3>
                <p>업로드가 끝나면 바로 공유할 수 있는 고유 주소가 만들어지고 대시보드에 보관됩니다.</p>
              </li>
            </ol>

            <div className="workflow-action" data-reveal>
              <Link className="button button-primary" href="/signup">내 HTML 공개하기 <ArrowIcon /></Link>
            </div>
          </div>
        </section>

        <section className="section insights" id="product-view" aria-labelledby="insights-title">
          <div className="shell">
            <div className="insights-heading" data-reveal>
              <div>
                <span className="section-kicker">다음으로 준비하는 기능</span>
                <h2 id="insights-title">숫자보다 흐름이<br />먼저 보이게.</h2>
              </div>
              <p>
                태그웍스는 업로드와 공개 링크에서 시작해, 방문 세션을 유입 출처부터 첫 외부 클릭까지 연결하는 분석을 준비하고 있습니다.
              </p>
            </div>
            <AnalyticsDemo />
          </div>
        </section>

        <section className="section principles" id="principles" aria-labelledby="principles-title">
          <div className="shell principles-grid">
            <div className="principles-copy" data-reveal>
              <span className="section-kicker">공개 원칙</span>
              <h2 id="principles-title">안전하게 공개하고,<br />원본은 따로 지킵니다.</h2>
              <p>
                모든 HTML을 그대로 실행하는 호스팅이 아닙니다. 공개 전 지원 범위를 검사하고,
                로그인 정보와 분리된 환경에서 정제된 버전만 제공합니다.
              </p>
              <a className="text-link" href="#faq">자주 묻는 질문 보기 <span aria-hidden="true">↓</span></a>
            </div>

            <div className="principle-board" data-reveal>
              <div className="board-head">
                <span>STATIC HTML CHECK</span>
                <span className="secure-state"><i aria-hidden="true" /> 검사 완료</span>
              </div>
              <div className="board-file">
                <div className="board-file-icon" aria-hidden="true">HTML</div>
                <div><strong>class-intro.html</strong><span>정제된 공개본 · 원본은 비공개 보관</span></div>
              </div>
              <div className="check-groups">
                <article className="allowed-group">
                  <div className="check-group-title"><span aria-hidden="true">✓</span><strong>지원해요</strong></div>
                  <ul>
                    <li>정적 HTML 본문과 레이아웃</li>
                    <li>파일 안에 포함된 CSS</li>
                    <li>일반 HTTPS 외부 링크</li>
                    <li>파일에 포함된 PNG·JPG 이미지</li>
                  </ul>
                </article>
                <article className="blocked-group">
                  <div className="check-group-title"><span aria-hidden="true">×</span><strong>제거하거나 막아요</strong></div>
                  <ul>
                    <li>사용자 JavaScript와 이벤트</li>
                    <li>iframe·임의 폼·자동 이동</li>
                    <li>서버·DB·API 비밀키</li>
                    <li>누락된 로컬 파일 경로</li>
                  </ul>
                </article>
              </div>
              <div className="board-foot">
                <span>관리 화면</span><i aria-hidden="true" /><span>분리된 공개 환경</span><i aria-hidden="true" /><span>방문자</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section use-cases" aria-labelledby="use-cases-title">
          <div className="shell">
            <div className="use-cases-head" data-reveal>
              <div>
                <span className="section-kicker">누구를 위한 도구인가요?</span>
                <h2 id="use-cases-title">페이지는 만들었지만,<br />배포가 낯선 사람들.</h2>
              </div>
              <p>AI 도구로 완성한 홍보 페이지를 실제 고객이 만나는 링크로 바꾸고 싶은 1인 운영자부터 시작합니다.</p>
            </div>
            <div className="use-case-grid">
              <article className="use-case-card" data-reveal>
                <span className="use-case-index">01</span>
                <div className="use-case-signal signal-product" aria-hidden="true">
                  <span>PRODUCT PAGE</span><strong>상품 소개</strong><code>fixed · link</code>
                </div>
                <h3>작은 상품을 소개할 때</h3>
                <p>상품 설명 HTML을 올리고, 발급된 공개 링크를 인스타그램과 블로그에서 바로 공유합니다.</p>
                <div className="tag-row"><span>상품 소개</span><span>고정 링크</span></div>
              </article>
              <article className="use-case-card" data-reveal>
                <span className="use-case-index">02</span>
                <div className="use-case-signal signal-republish" aria-hidden="true">
                  <span>CLASS OPEN</span><strong>HTML → URL</strong><code>/p/my-class</code>
                </div>
                <h3>강의·서비스를 모집할 때</h3>
                <p>완성된 모집 페이지를 별도의 호스팅 설정 없이 하나의 주소로 만들어 안내합니다.</p>
                <div className="tag-row"><span>빠른 공개</span><span>쉬운 공유</span></div>
              </article>
              <article className="use-case-card" data-reveal>
                <span className="use-case-index">03</span>
                <div className="use-case-signal signal-flow" aria-hidden="true">
                  <span>SAFE PUBLISH</span><strong>check → live</strong><code>static · html</code>
                </div>
                <h3>안전하게 전달하고 싶을 때</h3>
                <p>지원하지 않는 동작을 검사하고 정제된 공개본을 로그인 환경과 분리해 제공합니다.</p>
                <div className="tag-row"><span>안전 검사</span><span>분리 공개</span></div>
              </article>
            </div>
          </div>
        </section>

        <section className="section faq" id="faq" aria-labelledby="faq-title">
          <div className="shell faq-grid">
            <div className="faq-heading" data-reveal>
              <span className="section-kicker">자주 묻는 질문</span>
              <h2 id="faq-title">약속할 수 있는 것만,<br />분명하게 말합니다.</h2>
            </div>
            <div className="faq-list" data-reveal>
              <details open>
                <summary><span>HTML 디자인이 그대로 공개되나요?</span><i aria-hidden="true" /></summary>
                <p>정적 HTML과 포함된 CSS를 우선 지원합니다. 사용자 스크립트, iframe, 임의 폼처럼 안전하게 제공하기 어려운 요소는 제거하며 결과는 원본과 일부 달라질 수 있습니다.</p>
              </details>
              <details>
                <summary><span>업로드하면 주소는 언제 만들어지나요?</span><i aria-hidden="true" /></summary>
                <p>안전 검사와 저장이 끝나면 해당 페이지 전용 고정 주소가 즉시 만들어집니다. 대시보드에서 언제든 다시 복사할 수 있습니다.</p>
              </details>
              <details>
                <summary><span>아무 파일이나 올릴 수 있나요?</span><i aria-hidden="true" /></summary>
                <p>현재 베타는 용량 제한 안의 단일 HTML 파일을 지원합니다. 로컬 폴더의 이미지나 CSS 파일은 함께 올라가지 않으므로 HTTPS 주소나 문서에 포함된 리소스를 사용해 주세요.</p>
              </details>
              <details>
                <summary><span>로그인 정보가 공개 페이지로 전달되나요?</span><i aria-hidden="true" /></summary>
                <p>아닙니다. 관리 화면과 공개 페이지는 분리해 제공하고, 공개 페이지에는 정제된 콘텐츠와 공개에 필요한 최소 정보만 전달합니다.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="closing-section" aria-labelledby="closing-title">
          <div className="shell closing-card" data-reveal>
            <div className="closing-tag" aria-hidden="true">BETA IS OPEN</div>
            <span className="section-kicker">당신의 HTML, 다음 단계로</span>
            <h2 id="closing-title">만들어둔 페이지가 있다면,<br />이제 링크로 만날 차례예요.</h2>
            <p>계정을 만들고 HTML 파일을 올리면, 안전 검사 후 고정 공개 링크를 바로 받을 수 있습니다.</p>
            <div className="closing-actions">
              <Link className="button button-primary" href="/signup">무료로 시작하기 <ArrowIcon /></Link>
              <Link className="text-link" href="/login">로그인 <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <a className="brand" href="#top" aria-label="TagWorks 홈">
            <BrandMark />
            <span>TagWorks</span>
          </a>
          <p>HTML을 공개 링크로 바꾸는 가장 단순한 방법.</p>
          <div className="footer-links"><a href="#workflow">작동 방식</a><a href="#principles">지원 범위</a><a href="#faq">FAQ</a></div>
          <span>© {new Date().getFullYear()} TagWorks</span>
        </div>
      </footer>
    </>
  );
}
