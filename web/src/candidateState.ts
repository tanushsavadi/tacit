import { SELECTABLE_PHASES, type Snapshot } from '../../shared/protocol.ts';

export function canSelect(s: Snapshot | null, connected: boolean): boolean {
  return Boolean(connected && s?.sessionId && s.candidateSet && SELECTABLE_PHASES.includes(s.phase));
}
export function validProposal(s: Snapshot | null, connected: boolean, serverNow: number): boolean {
  return Boolean(connected && s?.sessionId && s.phase === 'AWAITING_CONFIRMATION' && s.proposal &&
    s.proposal.candidateSetId === s.candidateSet?.id && serverNow < s.proposal.expiresAt);
}
export function canConfirm(s: Snapshot | null, connected: boolean, serverNow: number): boolean {
  return Boolean(validProposal(s, connected, serverNow) && serverNow >= s!.proposal!.confirmableAt);
}
