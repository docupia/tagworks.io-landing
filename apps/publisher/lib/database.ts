import postgres, { type Sql } from "postgres";

import { getAnalyticsDatabaseUrl } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var tagworksAnalyticsSql: Sql | undefined;
}

export function getAnalyticsDatabase(): Sql {
  if (!globalThis.tagworksAnalyticsSql) {
    globalThis.tagworksAnalyticsSql = postgres(getAnalyticsDatabaseUrl(), {
      connect_timeout: 10,
      idle_timeout: 20,
      max: 1,
      prepare: false,
      ssl: "require",
    });
  }

  return globalThis.tagworksAnalyticsSql;
}
