import type { Translation } from "./translations";

// Strings added with the link-based plans. Order: ja, es, de, zh.
// {name} placeholders are filled after translation.
export const PLAN_TRANSLATIONS: Record<string, Translation> = {
  // Limits and publishing errors
  "You're using all {n} links on {plan}. Upgrade for more, or unpublish a link to free a slot.": [
    "{plan}のリンク{n}件をすべて使用中です。アップグレードするか、リンクを1つ非公開にして枠を空けてください。",
    "Estás usando los {n} enlaces de {plan}. Mejora tu plan o despublica un enlace para liberar un espacio.",
    "Du nutzt alle {n} Links von {plan}. Wechsle in einen größeren Plan oder stelle einen Link privat, um Platz zu schaffen.",
    "{plan} 的 {n} 个链接已全部使用。请升级，或将一个链接设为不公开以腾出名额。",
  ],
  "Need more than {n} links? Tell us how many and we'll set it up for you.": [
    "{n}件より多くのリンクが必要ですか？必要な数を教えていただければご用意します。",
    "¿Necesitas más de {n} enlaces? Dinos cuántos y lo configuramos para ti.",
    "Mehr als {n} Links nötig? Sag uns, wie viele, und wir richten es für dich ein.",
    "需要超过 {n} 个链接？告诉我们所需数量，我们为你配置。",
  ],
  "{file} is {size}. The limit on {plan} is {limit}.": [
    "{file}は{size}です。{plan}の上限は{limit}です。",
    "{file} pesa {size}. El límite de {plan} es {limit}.",
    "{file} ist {size} groß. Das Limit in {plan} ist {limit}.",
    "{file} 为 {size}。{plan} 的上限为 {limit}。",
  ],
  "You chose {count} images. {plan} allows {limit} images per link.": [
    "画像を{count}枚選択しました。{plan}ではリンクあたり{limit}枚までです。",
    "Elegiste {count} imágenes. {plan} permite {limit} imágenes por enlace.",
    "Du hast {count} Bilder gewählt. {plan} erlaubt {limit} Bilder pro Link.",
    "你选择了 {count} 张图片。{plan} 每个链接最多 {limit} 张。",
  ],
  "This page is {size} after optimization. {plan} allows {limit} per link.": [
    "最適化後のこのページは{size}です。{plan}ではリンクあたり{limit}までです。",
    "Tras la optimización, esta página pesa {size}. {plan} permite {limit} por enlace.",
    "Nach der Optimierung ist diese Seite {size} groß. {plan} erlaubt {limit} pro Link.",
    "优化后此页面为 {size}。{plan} 每个链接最多 {limit}。",
  ],
  "Too many edits in the last hour. Try again in {minutes} min.": [
    "直近1時間の編集が多すぎます。{minutes}分後にもう一度お試しください。",
    "Demasiadas ediciones en la última hora. Vuelve a intentarlo en {minutes} min.",
    "Zu viele Änderungen in der letzten Stunde. Versuche es in {minutes} Min. erneut.",
    "最近 1 小时内修改次数过多。请在 {minutes} 分钟后重试。",
  ],
  "{file} can't be used. Save it as PNG or JPG and try again.": [
    "{file}は使用できない形式です。PNGまたはJPGで保存してください。",
    "{file} no se puede usar. Guárdalo como PNG o JPG e inténtalo de nuevo.",
    "{file} kann nicht verwendet werden. Speichere es als PNG oder JPG und versuche es erneut.",
    "{file} 无法使用。请另存为 PNG 或 JPG 后重试。",
  ],
  "Published page not found.": ["公開ページが見つかりません。", "No se encontró la página publicada.", "Veröffentlichte Seite nicht gefunden.", "未找到已发布的页面。"],
  "The upload is too large.": ["アップロード容量が大きすぎます。", "La carga es demasiado grande.", "Der Upload ist zu groß.", "上传内容过大。"],
  "Choose a valid page.": ["正しいページを選択してください。", "Elige una página válida.", "Wähle eine gültige Seite.", "请选择有效的页面。"],
  "Enter a title of up to 100 characters and a description of up to 300.": [
    "タイトルは100文字、説明は300文字以内で入力してください。",
    "Escribe un título de hasta 100 caracteres y una descripción de hasta 300.",
    "Gib einen Titel mit bis zu 100 Zeichen und eine Beschreibung mit bis zu 300 Zeichen ein.",
    "标题请在 100 字以内，描述请在 300 字以内。",
  ],
  "Choose valid images.": ["正しい画像を選択してください。", "Elige imágenes válidas.", "Wähle gültige Bilder.", "请选择有效的图片。"],
  "An image upload did not finish. Please try again.": [
    "画像のアップロードが完了していません。もう一度お試しください。",
    "Una imagen no terminó de subirse. Inténtalo de nuevo.",
    "Ein Bild-Upload wurde nicht abgeschlossen. Bitte versuche es erneut.",
    "有图片未上传完成，请重试。",
  ],
  "Could not prepare the image upload.": [
    "画像のアップロードを準備できませんでした。",
    "No se pudo preparar la carga de imágenes.",
    "Der Bild-Upload konnte nicht vorbereitet werden.",
    "无法准备图片上传。",
  ],
};
