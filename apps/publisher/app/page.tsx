export default function PublisherHome() {
  return (
    <main className="shell">
      <section className="card" aria-labelledby="publisher-title">
        <div className="mark">tagworks</div>
        <h1 id="publisher-title">페이지 퍼블리셔</h1>
        <p>
          이 주소는 Tagworks에서 발행한 HTML 페이지를 전달하는 전용 서비스입니다.
          발행 링크를 통해 페이지를 열어 주세요.
        </p>
        <span className="status">서비스 정상 운영 중</span>
      </section>
    </main>
  );
}
