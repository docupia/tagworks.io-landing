import { getDatabase } from "@/lib/database";

export const PUBLIC_USERNAME_PATTERN = /^[a-z][a-z0-9-]{2,29}$/;

export async function getPublicUsername(ownerId: string): Promise<string | undefined> {
  const sql = getDatabase();
  const [profile] = await sql<{ username: string }[]>`
    select username from public.public_profiles where owner_id=${ownerId}::uuid
  `;
  return profile?.username;
}
