// Key rotation utilities — thin re-export layer for architecture clarity
export type { KeyStatus, KeyState } from "./provider";
export { keyManager } from "./provider";

import { keyManager } from "./provider";
import type { KeyState } from "./provider";

/** Returns a snapshot of all key statuses */
export function getKeyStats(): KeyState[] {
  return keyManager.getStats();
}

/** Returns number of currently available (non-cooling) keys */
export function getAvailableKeyCount(): number {
  return keyManager.getAvailableCount();
}
