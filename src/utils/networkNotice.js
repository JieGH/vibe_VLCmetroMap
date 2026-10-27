// Which corner notice to show, if any. When neither the trains nor the buses load, the visitor should hear that
// the cause is most likely their connection or the transport provider, put kindly and without blame.
// Pure logic; the hook in services/useNetworkNotice.js feeds it.

/**
 * @param {{ outsideSpain: boolean, trainOk: boolean, busOk: boolean }} input
 * @returns {null | 'outsideSpain' | 'noLiveOutside' | 'noLiveProvider'}
 *   noLiveOutside: no live data and a connection outside Spain (the address may not be reachable by the provider)
 *   noLiveProvider: no live data from inside Spain (the provider may be down)
 *   outsideSpain: data still loads, but times may be wrong
 */
export function pickNetworkNotice({ outsideSpain, trainOk, busOk }) {
  const noLiveData = !trainOk && !busOk;
  if (noLiveData) return outsideSpain ? 'noLiveOutside' : 'noLiveProvider';
  return outsideSpain ? 'outsideSpain' : null;
}
