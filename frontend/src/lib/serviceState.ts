// Service state shown to the user (Normal, Degraded, Outage).
import type { Health, ServiceState } from "./contract";

/**
 * Derive the state from the hub's health answer.
 * - health null: the hub did not answer, so runs go to the fallback (degraded),
 *   unless the fallback has also failed (outage).
 * - runner down, or no free run slot: degraded; the AI connection is unavailable.
 */
export function stateFromHealth(health: Health | null, fallbackDown: boolean): ServiceState {
  if (health && health.runner === "up" && health.freeRunSlots > 0) return "normal";
  return fallbackDown ? "outage" : "degraded";
}

/** Whether the AI connection panel may offer a connection. */
export function agentAllowed(state: ServiceState, health: Health | null): boolean {
  return state === "normal" && !!health?.agentAvailable;
}

export const BANNER: Record<ServiceState, string | null> = {
  normal: null,
  degraded: "The server is busy, so the AI connection (MCP) is unavailable. You can still use the playground.",
  outage: "Temporary service outage.",
};
