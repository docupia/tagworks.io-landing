const header = document.querySelector("[data-header]");
const revealItems = document.querySelectorAll("[data-reveal]");
const year = document.querySelector("[data-year]");
const sourceFilters = document.querySelectorAll("[data-source-filter]");

const analyticsData = {
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

if (year) {
  year.textContent = new Date().getFullYear();
}

const updateHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 18);
};

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

if ("IntersectionObserver" in window) {
  document.documentElement.classList.add("reveal-enabled");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const delay = entry.target.dataset.delay;
        if (delay) entry.target.style.setProperty("--delay", `${delay}ms`);
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14 }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const updateAnalytics = (source) => {
  const data = analyticsData[source];
  if (!data) return;

  document.querySelectorAll("[data-metric]").forEach((item) => {
    const value = data[item.dataset.metric];
    if (value !== undefined) item.textContent = value.toLocaleString("ko-KR");
  });

  document.querySelectorAll("[data-flow]").forEach((item) => {
    const value = data[item.dataset.flow];
    if (value !== undefined) {
      item.textContent = value.toLocaleString("ko-KR");
      item.closest(".flow-node")?.classList.toggle("is-zero", value === 0);
    }
  });

  const updateRails = (selector, keys, maxHeight) => {
    const values = keys.map((key) => data[key]);
    const maxValue = Math.max(...values, 1);

    document.querySelectorAll(selector).forEach((rail, index) => {
      const value = values[index];
      const height = value === 0 ? 0 : Math.round(13 + (value / maxValue) * maxHeight);
      rail.style.height = `${height}px`;
      rail.style.minHeight = value === 0 ? "0px" : "10px";
      rail.style.opacity = value === 0 ? "0" : "0.72";
    });
  };

  updateRails(".flow-rail-left i", ["instagram", "blog", "tagworks", "direct"], 38);
  updateRails(".flow-rail-right i", ["purchase", "inquiry", "youtube", "none"], 42);

  document.querySelectorAll("[data-table]").forEach((item) => {
    const value = data[item.dataset.table];
    item.textContent = value.toLocaleString("ko-KR");
  });

  document.querySelectorAll("[data-table-rate]").forEach((item) => {
    const value = data[item.dataset.tableRate];
    const rate = data.visits ? Math.round((value / data.visits) * 100) : 0;
    item.textContent = `${rate}%`;
  });

  document.querySelectorAll("[data-mobile-flow='source']").forEach((item) => {
    item.textContent = data.label;
  });
};

sourceFilters.forEach((button) => {
  button.addEventListener("click", () => {
    sourceFilters.forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    updateAnalytics(button.dataset.sourceFilter);
  });
});

updateAnalytics("all");
