// Run endpoints. The defaults are production; set NEXT_PUBLIC_HUB_URL for local development
// (for example http://localhost:8080 with the hub's ALLOWED_ORIGINS=http://localhost:3000).
const hub = (process.env.NEXT_PUBLIC_HUB_URL ?? "https://api.jace-s.com").replace(/\/$/, "");

export const endpoints = {
  primary: `${hub}/goose/run`,
  health: `${hub}/goose/health`,
  fallback: "/api/run",
  /** Agent session socket (wss://api.jace-s.com/goose/session). */
  session: `${hub.replace(/^http/, "ws")}/goose/session`,
  /** Hub MCP endpoint: the starter prompt calls it with curl; AI apps with MCP support may also register it. */
  mcp: `${hub}/goose/mcp`,
  /** jace-s account API (login, Google sign-in). The hub shares this host, so the login cookie reaches it. */
  account: hub,
  /** Main site pages for sign-up and password reset. */
  site: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://jace-s.com").replace(/\/$/, ""),
};
