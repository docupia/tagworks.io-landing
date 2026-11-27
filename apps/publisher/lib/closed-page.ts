// Notice shown at the URL of a link its owner made private (or that was
// closed after a plan change). The URL comes back unchanged when the link is
// published again.

const MESSAGES = {
  en: ["This page is closed for now", "The owner has made this page private for the moment. The same link will work again once it is reopened."],
  ko: ["이 페이지는 잠시 닫혀 있어요", "페이지 주인이 지금은 비공개로 두었어요. 다시 공개되면 같은 링크로 그대로 볼 수 있어요."],
  ja: ["このページは現在非公開です", "ページの所有者が一時的に非公開にしています。再公開されると同じリンクで見られます。"],
  es: ["Esta página está cerrada por ahora", "Su propietario la ha hecho privada de momento. El mismo enlace volverá a funcionar cuando se reabra."],
  de: ["Diese Seite ist vorübergehend geschlossen", "Die Inhaberin oder der Inhaber hat die Seite vorerst privat gestellt. Sobald sie wieder veröffentlicht ist, funktioniert derselbe Link wieder."],
  zh: ["此页面暂时关闭", "页面所有者暂时将其设为不公开。重新公开后，同一链接即可再次访问。"],
} as const;

type Language = keyof typeof MESSAGES;

export function preferredLanguage(acceptLanguage: string | null): Language {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (code in MESSAGES) return code as Language;
  }
  return "en";
}

export function renderClosedPage(acceptLanguage: string | null) {
  const language = preferredLanguage(acceptLanguage);
  const [title, message] = MESSAGES[language];
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f3e8;color:#30352a;font-family:system-ui,-apple-system,sans-serif}.card{width:min(34rem,calc(100% - 3rem));box-sizing:border-box;border:1px solid #d8d4c6;border-radius:1.5rem;background:#fffdf7;padding:clamp(1.75rem,5vw,3rem);box-shadow:0 1.25rem 4rem rgb(54 61 43 / 10%)}.icon{display:grid;place-items:center;width:3rem;height:3rem;margin-bottom:1.2rem;border-radius:999px;background:#ebe7da;font-size:1.4rem}h1{margin:0 0 .8rem;font-size:clamp(1.6rem,6vw,2.4rem);letter-spacing:-.04em;line-height:1.2}p{margin:0;color:#707565;line-height:1.7}a{display:inline-block;margin-top:1.6rem;color:#596248;font-weight:700}</style></head><body><main class="card"><div class="icon" aria-hidden="true">⏸</div><h1>${title}</h1><p>${message}</p><a href="https://tagworks.io/">TagWorks</a></main></body></html>`;
}
