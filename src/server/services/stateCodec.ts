import { decodeEnvelope, decryptJson, encodeEnvelope, encryptJson } from '../crypto/envelope.js';
import type { SessionState } from '../types/models.js';

export function encodeStateForStorage(state: SessionState): string {
  return encodeEnvelope(encryptJson(state));
}

export function decodeStateFromStorage(payload: string): SessionState {
  // Explicitly reject plaintext JSON to avoid accidental unencrypted storage.
  if (payload.trim().startsWith('{')) {
    throw new Error('unencrypted_state_payload');
  }
  return decryptJson<SessionState>(decodeEnvelope(payload));
}
