import { ApiError } from "@/lib/api-http";

export const MCP_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const tools = [
  { name: "deploy_html", description: "Publish a new HTML page at a permanent public URL. Uses one live link from the user's plan (Free 1, Starter 5, Pro 30). Each call creates a new link; to change an existing page use update_html instead.", inputSchema: { type: "object", properties: { html: { type: "string", description: "Complete HTML source, at most 2 MB UTF-8." }, title: { type: "string", minLength: 1, maxLength: 100 }, description: { type: "string", maxLength: 300 } }, required: ["html", "title"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } },
  { name: "update_html", description: "Replace the HTML of one of the user's existing pages. The URL and QR code stay the same and edits do not use a link. Limited to 20 edits per page per hour.", inputSchema: { type: "object", properties: { pageId: { type: "string", description: "page.id returned by deploy_html." }, html: { type: "string", description: "Complete HTML source, at most 2 MB UTF-8." } }, required: ["pageId", "html"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true } },
  { name: "get_plan_usage", description: "Read the user's plan, how many links are live and how many are still available.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];
type Dependencies = { deploy: (input: unknown) => Promise<unknown>; update?: (input: unknown) => Promise<unknown>; allowance: () => Promise<unknown> };
export async function handleMcpMessage(input: unknown, dependencies: Dependencies) {
  const message = input as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: Record<string, unknown> } | null;
  const validId = typeof message?.id === "string" || (typeof message?.id === "number" && Number.isFinite(message.id));
  const id = validId ? message!.id : null;
  const error = (code: number, text: string) => ({ jsonrpc: "2.0", id, error: { code, message: text } });
  if (!message || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string" || (message.id !== undefined && !validId)) return error(-32600, "Invalid Request");
  if (message.params !== undefined && (!message.params || typeof message.params !== "object" || Array.isArray(message.params))) return error(-32602, "Invalid params");
  if (message.id === undefined) {
    // Notifications never execute tools or other mutations.
    return null;
  }
  const result = (value: unknown) => ({ jsonrpc: "2.0", id, result: value });
  switch (message.method) {
    case "initialize": {
      if (typeof message.params?.protocolVersion !== "string" || !message.params.clientInfo || !message.params.capabilities) return error(-32602, "Invalid initialize params");
      const requested = message.params.protocolVersion;
      return result({ protocolVersion: MCP_VERSIONS.includes(requested) ? requested : MCP_VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: "tagworks", version: "1.0.0" }, instructions: "Publish HTML using deploy_html, which uses one live link from the plan. To change a page, call update_html with its pageId: edits are free and keep the same URL. Check get_plan_usage before creating links. Never include API keys in published HTML." });
    }
    case "ping": return result({});
    case "tools/list": return result({ tools });
    case "tools/call": {
      const name = message.params?.name;
      if (!tools.some(tool => tool.name === name)) return error(-32602, "Unknown tool");
      try {
        if (name === "get_plan_usage" && message.params?.arguments && Object.keys(message.params.arguments as object).length) throw new ApiError(400, "This tool takes no arguments.");
        const args = message.params?.arguments;
        const data = name === "deploy_html" ? await dependencies.deploy(args)
          : name === "update_html" ? await (dependencies.update ?? (() => { throw new ApiError(400, "update_html is not available."); }))(args)
            : await dependencies.allowance();
        return result({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: false });
      } catch (cause) {
        return result({ content: [{ type: "text", text: cause instanceof ApiError ? cause.message : "Service temporarily unavailable." }], isError: true });
      }
    }
    default: return error(-32601, "Method not found");
  }
}
