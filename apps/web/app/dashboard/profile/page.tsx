import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicUsername } from "@/lib/public-username";
import { getLocale } from "@/lib/i18n-server";
import { savePublicUsername } from "./actions";
import styles from "../dashboard.module.css";

export default async function ProfilePage({ searchParams }: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  const labels = {
    en: ["Public username", "3–30 characters: lowercase letters, numbers and hyphens. Start with a letter. Previous names remain reserved to your account.", "Save", "This username is unavailable.", "Invalid username.", "Saved."],
    ko: ["공개 사용자명", "영문 소문자로 시작하는 3~30자의 소문자·숫자·하이픈을 사용하세요. 이전 이름은 내 계정에 계속 예약됩니다.", "저장", "사용할 수 없는 사용자명입니다.", "사용자명 형식을 확인해 주세요.", "저장했습니다."],
    ja: ["公開ユーザー名", "英小文字で始まる3〜30文字。小文字・数字・ハイフンを使えます。旧名は自分のアカウントに予約されます。", "保存", "使用できない名前です。", "形式を確認してください。", "保存しました。"],
    es: ["Nombre público", "3–30 caracteres: minúsculas, números y guiones. Empieza con una letra. Los nombres anteriores siguen reservados.", "Guardar", "Nombre no disponible.", "Formato inválido.", "Guardado."],
    de: ["Öffentlicher Benutzername", "3–30 Zeichen: Kleinbuchstaben, Zahlen und Bindestriche. Mit einem Buchstaben beginnen. Alte Namen bleiben reserviert.", "Speichern", "Name nicht verfügbar.", "Ungültiger Name.", "Gespeichert."],
    zh: ["公开用户名", "3–30 个小写字母、数字或连字符，须以字母开头。历史用户名仍保留给您的账号。", "保存", "此用户名不可用。", "用户名格式有误。", "已保存。"],
  }[locale];
  const username = await getPublicUsername(user.id);
  const params = await searchParams;
  return <main className={styles.main}>
    <h1>{labels[0]}</h1>
    <p>{labels[1]}</p>
    {params.error ? <p className={styles.error} role="alert">{params.error === "taken" ? labels[3] : labels[4]}</p> : null}
    {params.saved ? <p role="status">{labels[5]}</p> : null}
    <form className={styles.form} action={savePublicUsername}>
      <label className={styles.field}>{labels[0]}
        <input name="username" defaultValue={username} minLength={3} maxLength={30} pattern="[a-z][a-z0-9-]{2,29}" required />
      </label>
      <button className={styles.primaryButton}>{labels[2]}</button>
    </form>
  </main>;
}
