/* Generated from schema/health.schema.json. Run npm run gen:contract to update. */

/**
 * Body of GET /goose/health (hub) and GET /health (runner, internal). The browser derives the service state from the hub's answer.
 */
export interface Health {
  runner: "up" | "down";
  freeRunSlots: number;
  /**
   * False when the runner is down or the agent session cap is full.
   */
  agentAvailable: boolean;
}
