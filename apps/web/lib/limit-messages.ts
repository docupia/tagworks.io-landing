import { text, type Locale } from "@/lib/i18n";
import { fill, formatBytes } from "@/lib/plans";

export type LimitCode =
  | "link_limit"
  | "custom_needed"
  | "file_too_large"
  | "too_many_images"
  | "link_too_large"
  | "edit_rate"
  | "image_type";

export type LimitValues = Record<string, string | number>;

/** Turns a limit error into the localized message shown next to the action. */
export function limitMessage(locale: Locale, code: LimitCode, values: LimitValues) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const v = { ...values };
  for (const key of ["size", "limit"]) {
    if (typeof v[key] === "number") v[key] = formatBytes(v[key] as number);
  }
  switch (code) {
    case "link_limit":
      return fill(tx(
        "You're using all {n} links on {plan}. Upgrade for more, or unpublish a link to free a slot.",
        "{plan}의 링크 {n}개를 모두 쓰고 있어요. 업그레이드하거나 링크 하나를 비공개로 바꿔 자리를 비워 주세요.",
      ), v);
    case "custom_needed":
      return fill(tx(
        "Need more than {n} links? Tell us how many and we'll set it up for you.",
        "링크가 {n}개보다 더 필요하세요? 필요한 개수를 알려 주시면 맞춰 드릴게요.",
      ), v);
    case "file_too_large":
      return fill(tx("{file} is {size}. The limit on {plan} is {limit}.", "{file}은(는) {size}예요. {plan}의 한도는 {limit}입니다."), v);
    case "too_many_images":
      return fill(tx(
        "You chose {count} images. {plan} allows {limit} images per link.",
        "이미지를 {count}장 골랐어요. {plan}은 링크당 {limit}장까지예요.",
      ), { ...v, limit: values.limit });
    case "link_too_large":
      return fill(tx(
        "This page is {size} after optimization. {plan} allows {limit} per link.",
        "최적화 후 이 페이지는 {size}예요. {plan}은 링크당 {limit}까지예요.",
      ), v);
    case "edit_rate":
      return fill(tx(
        "Too many edits in the last hour. Try again in {minutes} min.",
        "최근 1시간 동안 수정이 너무 많았어요. {minutes}분 뒤에 다시 시도해 주세요.",
      ), v);
    case "image_type":
      return fill(tx(
        "{file} can't be used. Save it as PNG or JPG and try again.",
        "{file}은(는) 쓸 수 없는 형식이에요. PNG·JPG로 저장해 주세요.",
      ), v);
  }
}
