export type ReadinessLevel = 'ready' | 'setup' | 'experimental' | 'unavailable' | 'unknown';
export const READINESS_TEXT: Record<ReadinessLevel, string> = {
  ready: 'Ready', setup: 'Needs setup', experimental: 'Experimental', unavailable: 'Unavailable', unknown: 'Unknown',
};
export interface ReadinessItem { id: string; label: string; level: ReadinessLevel; detail: string }
export interface ReadinessFacts {
  connected: boolean;
  recognitionReady: boolean;
  camera: 'off' | 'starting' | 'tracked' | 'searching' | 'blocked' | 'error' | 'unsupported';
  routeState: 'unconfigured' | 'starting' | 'ready' | 'unavailable' | 'error' | null;
  deviceName: string | null;
  readers: string[] | null;
  outputAuthorized: boolean;
  /** Published gate. The client must not treat a missing value as permission. */
  automaticPermitted: boolean;
}
const device = (name: string | null) => name ?? 'the TACIT virtual microphone';

/** Client summary of published status. It does not decide that a remote person heard anything. */
export function demoReadiness(facts: ReadinessFacts): ReadinessItem[] {
  const mic = device(facts.deviceName);
  const faceTime = facts.readers?.includes('com.apple.FaceTime') ?? false;
  const route = ((): ReadinessItem => {
    if (!facts.connected || !facts.routeState) return { id: 'route', label: 'Virtual microphone', level: 'unknown', detail: 'The backend has not reported a voice route.' };
    if (facts.routeState !== 'ready') return { id: 'route', label: 'Virtual microphone', level: 'unavailable', detail: `${mic} is ${facts.routeState}. Open the TACIT Mac companion, then reconnect.` };
    if (facts.readers == null) return { id: 'route', label: 'Virtual microphone', level: 'unknown', detail: `${mic} is ready on this Mac. Whether a calling app selected it is not reported.` };
    if (!facts.readers.length) return { id: 'route', label: 'Virtual microphone', level: 'setup', detail: `Select ${mic} as the microphone in FaceTime or Zoom. No calling app is reading it, so this is not a connected call. Remote audibility is not verified.` };
    return { id: 'route', label: 'Virtual microphone', level: 'ready', detail: `${faceTime ? 'FaceTime is' : `${facts.readers.join(', ')} is`} reading ${mic}. Remote audibility is not verified.` };
  })();
  const camera = ((): ReadinessItem => {
    switch (facts.camera) {
      case 'unsupported': return { id: 'camera', label: 'Camera', level: 'unavailable', detail: 'This browser cannot open a camera. Typed speech remains available.' };
      case 'error': return { id: 'camera', label: 'Camera', level: 'setup', detail: 'The camera stopped or permission was denied. Choose Retry Live preview and allow the camera.' };
      case 'blocked': return { id: 'camera', label: 'Camera', level: 'setup', detail: 'More than one face is visible. Capture stays off until only one face is in view.' };
      case 'tracked': return { id: 'camera', label: 'Camera', level: 'ready', detail: 'One face is tracked. No microphone is used.' };
      case 'starting':
      case 'searching': return { id: 'camera', label: 'Camera', level: 'setup', detail: 'Keep one face and your mouth in view.' };
      default: return { id: 'camera', label: 'Camera', level: 'setup', detail: 'Choose Start Live preview and allow the camera.' };
    }
  })();
  return [
    { id: 'connection', label: 'TACIT connection', level: facts.connected ? 'ready' : 'setup', detail: facts.connected ? 'Authenticated and connected.' : 'Connect with your private TACIT link.' },
    { id: 'recognition', label: 'Display-only recognition', level: facts.recognitionReady ? 'ready' : 'unavailable', detail: facts.recognitionReady ? 'The visual model can show raw words. They are not spoken.' : 'The visual recognition service is not available.' },
    { id: 'silent', label: 'Silent-speech reliability', level: 'experimental', detail: 'Not measured on your silent speech. Voiced recordings are not this measurement.' },
    camera,
    { id: 'automatic', label: 'Automatic transmission', level: facts.automaticPermitted ? 'ready' : 'unavailable', detail: facts.automaticPermitted ? 'The backend permits automatic recognized speech for this session.' : 'Not permitted. Recognized words stay on screen.' },
    route,
    { id: 'typed', label: 'Typed voice output', level: !facts.connected || facts.routeState !== 'ready' ? 'unavailable' : facts.outputAuthorized ? 'ready' : 'setup', detail: facts.outputAuthorized ? 'This browser may send words you type. Remote audibility is not verified.' : 'Enable typed voice output before sending words you write. Recognition text is never copied there.' },
    { id: 'audibility', label: 'Remote audibility', level: 'unknown', detail: 'No person has confirmed what the other side heard.' },
  ];
}
export function readinessAction(items: ReadinessItem[]): string {
  return items.find(item => item.id === 'camera' && item.level !== 'ready')?.detail
    ?? items.find(item => item.id === 'route' && item.level !== 'ready')?.detail
    ?? 'Display-only recognition can run. Automatic speech stays off. Remote audibility is not verified.';
}
