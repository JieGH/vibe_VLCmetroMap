import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import gtfsData from '../data/gtfs_expanded.json';
import { useTranslation } from '../i18n';
import { createJourneyPlanner } from '../services/journeyPlanner';
import './JourneyPlanner.css';

const stations = gtfsData.features
  .filter(feature => feature.geometry.type === 'Point')
  .map(feature => ({
    name: feature.properties.name,
    coordinates: feature.geometry.coordinates,
    stopId: feature.properties.stop_id,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const modeKeys = { WALK: 'walk', METRO: 'metro', TRAM: 'tram', BUS: 'bus' };
const provenanceKeys = { scheduled: 'scheduled', live: 'live', stale: 'stale', estimated: 'estimated' };

export function JourneyResults({ result, onStartJourney, onAllowLongerWalk }) {
  const { t, language } = useTranslation();
  const time = value => new Intl.DateTimeFormat(language, {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  }).format(new Date(value));
  if (!result) return null;
  if (!result.journeys.length) {
    return (
      <div className="journey-status" role="status">
        <p>{t(result.status === 'walking-limit' ? 'navigation.walkingLimit' : 'navigation.noJourney')}</p>
        {result.status === 'walking-limit' && onAllowLongerWalk && (
          <button type="button" name="allowLongerWalk" className="journey-primary-action" onClick={onAllowLongerWalk}>
            {t('navigation.allowLongerWalk')}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="journey-options">
      {result.journeys.map(journey => (
        <article className="journey-option" key={journey.id}>
          <div className="journey-option-summary">
            <strong>{t('navigation.journeyDuration', { minutes: Math.ceil(journey.durationSeconds / 60) })}</strong>
            <span>{t('navigation.walkingDistance', { metres: Math.round(journey.walkDistanceMetres) })}</span>
            <span>{t('navigation.transfers', { count: journey.transfers })}</span>
          </div>
          <ol className="journey-legs">
            {journey.legs.map(leg => {
              const provenance = provenanceKeys[leg.departureSource] || 'estimated';
              return (
                <li key={leg.id}>
                  <div className="journey-leg-heading">
                    <strong>{t(`navigation.${modeKeys[leg.mode] || 'walk'}`)} {leg.route?.shortName}</strong>
                    <span data-departure-source={provenance}>{t(`navigation.${provenance}`)}</span>
                  </div>
                  <p>{leg.from.name} → {leg.to.name}</p>
                  {leg.route?.headsign && <p className="journey-muted">{leg.route.headsign}</p>}
                  <p className="journey-muted">
                    <time dateTime={new Date(leg.startTime).toISOString()}>{time(leg.startTime)}</time>
                    {' – '}
                    <time dateTime={new Date(leg.endTime).toISOString()}>{time(leg.endTime)}</time>
                  </p>
                </li>
              );
            })}
          </ol>
          <p className="journey-muted">{t('navigation.accessibilityUnknown')}</p>
          <button type="button" className="journey-primary-action" onClick={() => onStartJourney?.(journey)}>
            {t('navigation.startJourney')}
          </button>
        </article>
      ))}
    </div>
  );
}

const defaultPlanner = createJourneyPlanner();

export default function JourneyPlanner({ destination, initialStartingPoint = null, onStartJourney, onClose, planner = defaultPlanner }) {
  const { t } = useTranslation();
  const [startingPoint, setStartingPoint] = useState(initialStartingPoint ? 'location' : '');
  const [request, setRequest] = useState({ status: 'idle', result: null });
  const requestRef = useRef(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  const reset = value => {
    requestRef.current?.abort();
    requestRef.current = null;
    setStartingPoint(value);
    setRequest({ status: 'idle', result: null });
  };
  const plan = async (allowLongerWalk = false) => {
    const from = startingPoint === 'location' ? initialStartingPoint : stations[Number(startingPoint)];
    if (!startingPoint || !from || !destination) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRequest({ status: 'loading', result: null });
    try {
      const result = await planner({
        from, to: destination,
        departureTime: new Date().toISOString(),
        preferences: { maxWalkMinutes: 15, allowLongerWalk },
      }, { signal: controller.signal });
      if (!controller.signal.aborted && requestRef.current === controller) {
        setRequest({ status: 'ready', result });
      }
    } catch {
      if (!controller.signal.aborted && requestRef.current === controller) {
        setRequest({ status: 'error', result: null });
      }
    }
  };
  if (!destination) return null;
  return (
    <section className="journey-planner glass-panel" aria-label={t('navigation.journeyPlanner')}>
      <header className="journey-planner-header">
        <div><h2>{t('navigation.directions')}</h2><p>{destination.name}</p></div>
        <button type="button" onClick={onClose} aria-label={t('navigation.closeJourneyPlanner')}><X size={20} /></button>
      </header>
      <form onSubmit={event => { event.preventDefault(); void plan(); }}>
        <label htmlFor="journey-starting-point">{t('navigation.startingPoint')}</label>
        <select id="journey-starting-point" name="startingPoint" value={startingPoint} onChange={event => reset(event.target.value)}>
          <option value="">{t('navigation.chooseStation')}</option>
          {initialStartingPoint && <option value="location">{t('navigation.useCurrentLocation')}</option>}
          {stations.map((station, index) => <option key={`${station.stopId}-${index}`} value={String(index)}>{station.name}</option>)}
        </select>
        <p className="journey-muted journey-disclosure">{t('navigation.routeDisclosure')}</p>
        <button type="submit" className="journey-primary-action" disabled={!startingPoint || request.status === 'loading'}>
          {t(request.status === 'loading' ? 'navigation.planningJourney' : 'navigation.planJourney')}
        </button>
      </form>
      <div aria-live="polite" aria-busy={request.status === 'loading'}>
        {request.status === 'error' && <p className="journey-status" role="alert">{t('navigation.journeyUnavailable')}</p>}
        <JourneyResults result={request.result} onStartJourney={onStartJourney} onAllowLongerWalk={() => void plan(true)} />
      </div>
    </section>
  );
}
