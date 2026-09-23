import postgres, { type Sql } from "postgres";
import { getDatabaseUrl } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var tagworksSql: Sql | undefined;
}

export const getDatabase = () => {
  if (!globalThis.tagworksSql) {
    globalThis.tagworksSql = postgres(getDatabaseUrl(), {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require",
    });
  }

  return globalThis.tagworksSql;
};
