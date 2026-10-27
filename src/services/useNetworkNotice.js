// Feeds pickNetworkNotice from the live stores: the visitor's country and whether each feed is answering.
import { useEffect, useState } from 'react';
import arrivalStore from './arrivalStore';
import { emtRefusal } from './emtArrivalService';
import { getApiHealth, subscribeApiStatus } from '../utils/diagnostics';
import { computeServiceStatus } from '../utils/serviceStatus';
import { pickNetworkNotice } from '../utils/networkNotice';
import { useOutsideSpain } from './regionCheck';

const readFeeds = () => {
  const status = computeServiceStatus({
    health: getApiHealth(),
    trainRefused: arrivalStore.isApiRefused(),
    busRefused: emtRefusal.isRefused(),
  });
  return { trainOk: status.train.state === 'ok', busOk: status.bus.state === 'ok' };
};

// `npm run dev` only: ?feeds=down shows the no-live-data notice without a real outage.
const devFeedsDown = () =>
  import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('feeds') === 'down';

export function useNetworkNotice() {
  const outsideSpain = useOutsideSpain();
  const [feeds, setFeeds] = useState(readFeeds);
  useEffect(() => {
    const update = () => setFeeds(readFeeds());
    const offs = [arrivalStore.subscribe(update), emtRefusal.subscribe(update), subscribeApiStatus(update)];
    return () => offs.forEach((off) => off());
  }, []);
  return pickNetworkNotice({ outsideSpain, ...(devFeedsDown() ? { trainOk: false, busOk: false } : feeds) });
}
