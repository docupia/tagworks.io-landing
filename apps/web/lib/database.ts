import postgres, { type Sql } from "postgres";
import { getAnalyticsDatabaseUrl, getDatabaseUrl } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var tagworksSql: Sql | undefined;
  var tagworksAnalyticsSql: Sql | undefined;
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

export const getAnalyticsDatabase = () => {
  if (!globalThis.tagworksAnalyticsSql) {
    globalThis.tagworksAnalyticsSql = postgres(getAnalyticsDatabaseUrl(), {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require",
    });
  }

  return globalThis.tagworksAnalyticsSql;
};
