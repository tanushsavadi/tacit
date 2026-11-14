import type { AirpodsStatus } from '../../../shared/protocol.ts';
import type { SilentSpeechAvailability } from './port.ts';

export type InputSource = 'airpods' | 'camera' | 'combined';
export type Observation = 'yes' | 'no' | 'unknown' | 'unavailable';
/** Each fact has its own provenance. Streaming never implies articulation or words. */
export interface InputCapability {
  id: InputSource; label: string;
  device: Observation; streaming: Observation; articulation: Observation;
  recognition: Observation; validated: Observation; automaticSpeech: Observation;
  detail: string;
}
export interface CameraObservation { connected: boolean; streaming: boolean; articulation: boolean; supported: boolean }
export function inputCapabilities(airpods: AirpodsStatus | null, serverNow: number | null, camera: CameraObservation, recognition: SilentSpeechAvailability | null = null, authorizedInput: InputSource | null = null): InputCapability[] {
  const motionAge = serverNow !== null && airpods?.lastMotionAt != null ? serverNow - airpods.lastMotionAt : null;
  const streaming = !!airpods?.connected && airpods.helper === 'running' && motionAge !== null && motionAge >= 0 && motionAge < 1500;
  const capabilities: InputCapability[] = [
    { id: 'airpods', label: 'AirPods', device: airpods?.helper === 'running' ? airpods.connected ? 'yes' : 'no' : 'unknown',
      streaming: airpods?.helper === 'running' ? streaming ? 'yes' : 'no' : 'unavailable', articulation: 'unavailable', recognition: 'unavailable', validated: 'no', automaticSpeech: 'no',
      detail: `Camera-free research. Motion streaming does not establish word recognition. Native helper: ${airpods?.helper.replaceAll('_', ' ') ?? 'not reported'}.` },
    { id: 'camera', label: 'Camera', device: camera.supported ? camera.connected ? 'yes' : 'unknown' : 'unavailable',
      streaming: camera.streaming ? 'yes' : 'no', articulation: camera.articulation ? 'yes' : 'no', recognition: 'unavailable', validated: 'no', automaticSpeech: 'no',
      detail: 'Optional local visual check. Mouth movement is experimental; it may also be smiling or swallowing. Silent-word reliability needs separate validation.' },
    { id: 'combined', label: 'Combined sensing', device: 'unavailable', streaming: 'unavailable', articulation: 'unavailable', recognition: 'unavailable', validated: 'no', automaticSpeech: 'no',
      detail: 'Future camera and AirPods fusion. No synchronized input service is published.' },
  ];
  return capabilities.map(c => {
    const ready = recognition?.connected && recognition.recognitionReady && recognition.supportedInputs.includes(c.id);
    const validated = ready && recognition?.automaticSpeechValidated && !!recognition.validationEvidence && recognition.validatedInputs.includes(c.id);
    return { ...c, recognition: ready ? 'yes' : 'unavailable', validated: validated ? 'yes' : 'no', automaticSpeech: validated && authorizedInput === c.id ? 'yes' : 'no' };
  });
}
