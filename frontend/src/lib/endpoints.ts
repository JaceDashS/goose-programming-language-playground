// Run endpoints. The defaults are production; set NEXT_PUBLIC_HUB_URL for local development
// (for example http://localhost:8080 with the hub's ALLOWED_ORIGINS=http://localhost:3000).
const hub = (process.env.NEXT_PUBLIC_HUB_URL ?? "https://api.jace-s.com").replace(/\/$/, "");

export const endpoints = {
  primary: `${hub}/goose/run`,
  health: `${hub}/goose/health`,
  fallback: "/api/run",
};
