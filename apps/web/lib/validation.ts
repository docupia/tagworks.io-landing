export type UploadFields = {
  title: string;
  description: string | null;
};

const plainText = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.trim() : "";

export function validateUploadFields(formData: FormData): UploadFields {
  const title = plainText(formData.get("title"));
  const description = plainText(formData.get("description"));

  if (title.length < 1 || title.length > 100) {
    throw new Error("제목은 1자 이상 100자 이하로 입력해 주세요.");
  }

  if (description.length > 300) {
    throw new Error("설명은 300자 이하로 입력해 주세요.");
  }

  return { title, description: description || null };
}
