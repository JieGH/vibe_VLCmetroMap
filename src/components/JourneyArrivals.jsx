import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../i18n';
import { createJourneyArrivals } from '../services/journeyArrivals';
import './JourneyArrivals.css';

export function JourneyArrivalContent({ snapshot, onRefresh }) {
  const { t, language } = useTranslation();
  if (!snapshot?.stop) return null;
  const scheduledTime = Number.isFinite(snapshot.scheduledTime) ? new Intl.DateTimeFormat(language, {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  }).format(new Date(snapshot.scheduledTime)) : null;
  return (
    <section className="journey-arrivals" aria-label={t('navigation.journeyArrivals')}>
      <h3>{t('navigation.journeyArrivalsAt', { stop: snapshot.stop.name })}</h3>
      {scheduledTime && <p data-arrival-source="scheduled" className="journey-muted">
        {t('navigation.scheduled')}{' · '}
        <time dateTime={new Date(snapshot.scheduledTime).toISOString()}>{scheduledTime}</time>
      </p>}
      <div aria-live="polite" aria-busy={snapshot.isLoading}>
        {snapshot.error && <p className="journey-muted" role="status">{t('navigation.journeyArrivalsUnavailable')}</p>}
        {snapshot.predictions.length ? (
          <>
            <ul className="journey-arrival-predictions">
              {snapshot.predictions.slice(0, 3).map((prediction, index) => (
                <li key={`${prediction.targetTimestamp}-${index}`} data-arrival-source={prediction.source}>
                  <span>{prediction.line}{' · '}{prediction.destination}</span>
                  <strong>{t('navigation.journeyPredictionCountdown', { minutes: Math.ceil(prediction.seconds / 60) })}</strong>
                  <span className="journey-muted">{t(prediction.source === 'live' ? 'navigation.live' : 'navigation.stale')}</span>
                </li>
              ))}
            </ul>
            <p className="journey-muted">{t('navigation.journeyPredictionUnconfirmed')}</p>
          </>
        ) : <p className="journey-muted">{t('navigation.noJourneyPredictions')}</p>}
      </div>
      <button type="button" name="refreshJourneyArrivals" className="journey-secondary-action"
        disabled={snapshot.isLoading} onClick={onRefresh}>
        {t(snapshot.isLoading ? 'navigation.refreshingJourneyArrivals' : 'navigation.refreshJourneyArrivals')}
      </button>
    </section>
  );
}

export default function JourneyArrivals({ journey, legIndex = 0, callIndex = 0, controllerFactory = createJourneyArrivals }) {
  const controller = useMemo(() => {
    const created = controllerFactory();
    created.select({ journey, legIndex, callIndex });
    return created;
  }, [controllerFactory, journey, legIndex, callIndex]);
  const [view, setView] = useState(() => ({ controller, snapshot: controller.getSnapshot() }));
  const snapshot = view.controller === controller ? view.snapshot : controller.getSnapshot();
  useEffect(() => {
    const update = () => setView({ controller, snapshot: controller.getSnapshot() });
    const unsubscribe = controller.subscribe(update);
    update();
    // The clock only projects Arrival Memory; it never calls refresh or fetch.
    const timer = setInterval(() => { if (!document.hidden) update(); }, 1000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [controller]);
  return <JourneyArrivalContent snapshot={snapshot} onRefresh={() => { void controller.refresh(); }} />;
}
