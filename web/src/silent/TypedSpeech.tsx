import { useState } from 'react';
import { Button } from '../components/ui/button.tsx';
import { describeSpeechDelivery, type SpeechOutputPort } from './speechOutput.ts';

export function TypedSpeech({ output }: { output: SpeechOutputPort }) {
  const [draft, setDraft] = useState('');
  const status = output.status;
  const delivery = output.delivery ? describeSpeechDelivery(output.delivery, status?.route.deviceName ?? null) : null;
  return <section className="typed-speech" aria-labelledby="typed-title"><div className="section-heading"><h2 id="typed-title">Typed speech</h2><span>User-authored AAC</span></div><p>Write your own words. Sending speaks them through the authorized voice route. Recognition results are never copied here.</p>
    <form onSubmit={e => { e.preventDefault(); output.speakTyped(draft); }}><label htmlFor="typed-words">Your message</label><textarea id="typed-words" value={draft} maxLength={500} rows={3} onChange={e => setDraft(e.target.value)} aria-describedby="typed-route" /><p id="typed-route">{status ? `Output ${status.state} · ${status.route.deviceName ?? 'no device'} · ${status.voice}` : 'Typed voice output is not connected. Use your calling app’s chat or an existing AAC tool.'}</p>
    <div className="typed-controls">{!output.authorized && <Button type="button" variant="secondary" disabled={!status || status.route.state !== 'ready' || !!output.controlling} onClick={() => output.control(status?.state === 'paused' ? 'resume' : 'enable')}>{output.controlling ? 'Waiting for output…' : 'Enable typed voice output'}</Button>}<Button type="submit" disabled={!output.canSpeak || !draft.trim()}>Send typed message</Button>{status && status.state !== 'off' && <Button type="button" variant="secondary" onClick={() => output.control('stop')}>Stop voice output</Button>}</div></form>
    {(output.notice || delivery) && <div className="typed-status" role="status" aria-live="polite">{delivery ? <><strong>{delivery.title}</strong><p>{delivery.detail}</p><p>{output.delivery?.voice ?? 'Voice not yet reported'} · typed message</p></> : output.notice}</div>}
  </section>;
}
