import type { Locale } from "@/lib/i18n";

export const brandCopy: Record<Locale, {
  title: string;
  description: string;
}> = {
  ko: {
    title: "AI로 만든 페이지를 고객에게 보내고, 누가 눌렀는지까지 보는 도구",
    description: "AI로 만든 HTML을 올리고 고객에게 링크를 보내세요. 방문 유입부터 외부 링크 클릭까지, 페이지별 통계로 확인할 수 있습니다.",
  },
  en: {
    title: "Send AI-made pages to customers and see who clicks.",
    description: "Upload your AI-made HTML and send customers a link. Track where visits come from and which outbound links get clicked with per-page analytics.",
  },
  ja: {
    title: "AIで作ったページを顧客に送り、誰がクリックしたかまでわかるツール",
    description: "AIで作ったHTMLをアップロードして顧客にリンクを送りましょう。流入元から外部リンクのクリックまで、ページごとの統計で確認できます。",
  },
  es: {
    title: "Envía páginas creadas con IA a tus clientes y descubre quién hace clic.",
    description: "Sube tu HTML creado con IA y envía un enlace a tus clientes. Consulta el origen de las visitas y los clics en enlaces externos con estadísticas por página.",
  },
  de: {
    title: "Sende KI-erstellte Seiten an Kunden und sieh, wer klickt.",
    description: "Lade dein mit KI erstelltes HTML hoch und sende Kunden einen Link. Verfolge Besucherquellen und Klicks auf externe Links mit Statistiken für jede Seite.",
  },
  zh: {
    title: "把 AI 制作的页面发给客户，还能看到谁点击了",
    description: "上传 AI 制作的 HTML，将链接发给客户。通过每个页面的统计，了解访问来源和外部链接点击情况。",
  },
};
