/** Adapters must honor abort remotely too. A UI timeout is never proof of no delivery. */
export async function withDeadline<T>(operation: () => Promise<T>, controller: AbortController, timeoutMs: number): Promise<T> {
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(controller.signal.reason ?? new Error('Recognition interrupted.'));
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Recognition timed out. Delivery is unconfirmed; pending input was interrupted.')), timeoutMs);
  try {
    if (controller.signal.aborted) throw controller.signal.reason ?? new Error('Recognition interrupted.');
    let work: Promise<T>;
    try { work = operation(); } catch (e) { work = Promise.reject(e); }
    return await Promise.race([work, aborted]);
  } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', onAbort); }
}
