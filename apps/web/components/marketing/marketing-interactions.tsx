"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark } from "./brand-mark";

type SourceKey = "all" | "instagram" | "blog" | "tagworks";

type AnalyticsRow = {
  label: string;
  visits: number;
  clickSessions: number;
  rate: number;
  contribution: number;
  instagram: number;
  blog: number;
  tagworks: number;
  direct: number;
  purchase: number;
  inquiry: number;
  youtube: number;
  none: number;
};

const analyticsData: Record<SourceKey, AnalyticsRow> = {
  all: {
    label: "전체 채널 · 300",
    visits: 300,
    clickSessions: 165,
    rate: 55,
    contribution: 60,
    instagram: 120,
    blog: 80,
    tagworks: 60,
    direct: 40,
    purchase: 90,
    inquiry: 45,
    youtube: 30,
    none: 135,
  },
  instagram: {
    label: "인스타그램 · 120",
    visits: 120,
    clickSessions: 72,
    rate: 60,
    contribution: 0,
    instagram: 120,
    blog: 0,
    tagworks: 0,
    direct: 0,
    purchase: 46,
    inquiry: 18,
    youtube: 8,
    none: 48,
  },
  blog: {
    label: "블로그 · 80",
    visits: 80,
    clickSessions: 40,
    rate: 50,
    contribution: 0,
    instagram: 0,
    blog: 80,
    tagworks: 0,
    direct: 0,
    purchase: 20,
    inquiry: 11,
    youtube: 9,
    none: 40,
  },
  tagworks: {
    label: "태그웍스 탐색 · 60",
    visits: 60,
    clickSessions: 36,
    rate: 60,
    contribution: 60,
    instagram: 0,
    blog: 0,
    tagworks: 60,
    direct: 0,
    purchase: 19,
    inquiry: 9,
    youtube: 8,
    none: 24,
  },
};

const format = new Intl.NumberFormat("ko-KR");

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 18);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="nav-shell">
        <Link className="brand" href="/#top" aria-label="TagWorks 홈">
          <BrandMark />
          <span>TagWorks</span>
        </Link>

        <nav className="desktop-nav" aria-label="주요 메뉴">
          <a href="#workflow">작동 방식</a>
          <a href="#product-view">제품 화면</a>
          <a href="#principles">지원 범위</a>
        </nav>

        <div className="header-actions">
          <Link className="header-login" href="/login">
            로그인
          </Link>
          <Link className="button button-small button-primary" href="/signup">
            무료로 시작하기
            <ArrowIcon />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function RevealController() {
  useEffect(() => {
    const root = document.documentElement;
    const items = document.querySelectorAll<HTMLElement>("[data-reveal]");

    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    root.classList.add("reveal-enabled");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14 },
    );

    items.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      root.classList.remove("reveal-enabled");
    };
  }, []);

  return null;
}

function railHeight(value: number, values: number[], maxHeight: number) {
  if (!value) return 0;
  const maximum = Math.max(...values, 1);
  return Math.round(13 + (value / maximum) * maxHeight);
}

function FlowNode({ tone, label, value }: { tone: string; label: string; value: number }) {
  return (
    <div className={`flow-node ${tone}${value === 0 ? " is-zero" : ""}`}>
      <span>{label}</span>
      <strong>{format.format(value)}</strong>
    </div>
  );
}

export function AnalyticsDemo() {
  const [source, setSource] = useState<SourceKey>("all");
  const data = analyticsData[source];
  const sourceValues = [data.instagram, data.blog, data.tagworks, data.direct];
  const targetValues = [data.purchase, data.inquiry, data.youtube, data.none];
  const filters: Array<[SourceKey, string]> = [
    ["all", "전체"],
    ["instagram", "인스타그램"],
    ["blog", "블로그"],
    ["tagworks", "태그웍스"],
  ];

  return (
    <div className="analytics-window" data-reveal>
      <div className="analytics-toolbar">
        <div className="analytics-title-group">
          <span className="sample-badge">향후 분석 기능 · 샘플 데이터</span>
          <div>
            <h3>봄 클래스 모집 페이지</h3>
            <span>예시 기간 · 최근 7일</span>
          </div>
        </div>
        <div className="source-filters" aria-label="유입 출처 필터">
          {filters.map(([key, label]) => (
            <button
              className={source === key ? "is-active" : undefined}
              type="button"
              key={key}
              aria-pressed={source === key}
              onClick={() => setSource(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="metric-grid" aria-live="polite">
        <article className="metric-card metric-visits">
          <span>방문 세션</span>
          <strong>{format.format(data.visits)}</strong>
          <small>선택한 기간에 시작된 세션</small>
        </article>
        <article className="metric-card metric-clicks">
          <span>외부 클릭 세션</span>
          <strong>{format.format(data.clickSessions)}</strong>
          <small>한 번 이상 외부 링크 클릭</small>
        </article>
        <article className="metric-card metric-rate">
          <span>외부 클릭 비율</span>
          <strong>
            {data.rate}
            <em>%</em>
          </strong>
          <small>클릭 세션 ÷ 방문 세션</small>
        </article>
        <article className="metric-card metric-contribution">
          <span>태그웍스 기여 방문</span>
          <strong>{format.format(data.contribution)}</strong>
          <small>탐색·태그 목록에서 유입</small>
        </article>
      </div>

      <div className="flow-panel">
        <div className="flow-panel-head">
          <div>
            <h4>출처 → 페이지 → 첫 외부 클릭</h4>
            <p>세션마다 처음 관측된 외부 클릭 한 번만 연결합니다.</p>
          </div>
          <span className="updated-chip">
            <i aria-hidden="true" /> 분석 기능 미리보기
          </span>
        </div>

        <div className="flow-map" aria-label="유입 출처에서 페이지를 거쳐 첫 외부 클릭으로 이어지는 샘플 흐름">
          <div className="flow-column flow-sources">
            <span className="flow-column-label">유입 출처</span>
            <FlowNode tone="peach-node" label="인스타그램" value={data.instagram} />
            <FlowNode tone="sky-node" label="블로그" value={data.blog} />
            <FlowNode tone="lilac-node" label="태그웍스 탐색" value={data.tagworks} />
            <FlowNode tone="khaki-node" label="직접·출처 불명" value={data.direct} />
          </div>

          <div className="flow-rail flow-rail-left" aria-hidden="true">
            {sourceValues.map((value, index) => (
              <i
                key={index}
                className={["rail-peach", "rail-sky", "rail-lilac", "rail-khaki"][index]}
                style={{ height: railHeight(value, sourceValues, 38), opacity: value ? 0.72 : 0 }}
              />
            ))}
          </div>

          <div className="flow-center">
            <span className="flow-column-label">공개 페이지</span>
            <div className="page-node">
              <span>봄 클래스 모집</span>
              <strong>{format.format(data.visits)} 세션</strong>
              <code>/p/spring-class</code>
            </div>
          </div>

          <div className="flow-rail flow-rail-right" aria-hidden="true">
            {targetValues.map((value, index) => (
              <i
                key={index}
                className={["rail-sage", "rail-peach-out", "rail-sky-out", "rail-empty"][index]}
                style={{ height: railHeight(value, targetValues, 42), opacity: value ? 0.72 : 0 }}
              />
            ))}
          </div>

          <div className="flow-column flow-targets">
            <span className="flow-column-label">첫 외부 클릭 결과</span>
            <FlowNode tone="sage-node" label="신청하기" value={data.purchase} />
            <FlowNode tone="peach-node" label="문의하기" value={data.inquiry} />
            <FlowNode tone="sky-node" label="소개 영상" value={data.youtube} />
            <FlowNode tone="empty-node" label="외부 클릭 미관측" value={data.none} />
          </div>
        </div>

        <div className="mobile-flow" aria-label="모바일 방문 흐름 요약">
          <div className="mobile-flow-stage">
            <span>선택한 출처</span>
            <strong>{data.label}</strong>
          </div>
          <span className="mobile-flow-arrow" aria-hidden="true">↓</span>
          <div className="mobile-flow-stage mobile-page-stage">
            <span>공개 페이지</span>
            <strong>봄 클래스 모집</strong>
          </div>
          <span className="mobile-flow-arrow" aria-hidden="true">↓</span>
          <div className="mobile-result-grid">
            <div><span>신청하기</span><strong>{data.purchase}</strong></div>
            <div><span>문의하기</span><strong>{data.inquiry}</strong></div>
            <div><span>소개 영상</span><strong>{data.youtube}</strong></div>
            <div><span>클릭 미관측</span><strong>{data.none}</strong></div>
          </div>
        </div>

        <details className="data-table-details">
          <summary>같은 데이터를 표로 보기</summary>
          <div className="table-scroll">
            <table>
              <caption>첫 외부 클릭 결과 샘플 데이터</caption>
              <thead><tr><th scope="col">결과</th><th scope="col">세션 수</th><th scope="col">비율</th></tr></thead>
              <tbody>
                {[
                  ["신청하기", data.purchase],
                  ["문의하기", data.inquiry],
                  ["소개 영상", data.youtube],
                  ["외부 클릭 미관측", data.none],
                ].map(([label, value]) => (
                  <tr key={String(label)}>
                    <th scope="row">{label}</th>
                    <td>{value}</td>
                    <td>{data.visits ? Math.round((Number(value) / data.visits) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <p className="analytics-note">
        <span aria-hidden="true">i</span>
        분석 영역은 앞으로 제공할 기능의 샘플입니다. 현재 서비스는 계정, HTML 검사·업로드, 고정 공개 링크에 집중합니다.
      </p>
    </div>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m6 3 5 5-5 5" />
    </svg>
  );
}
