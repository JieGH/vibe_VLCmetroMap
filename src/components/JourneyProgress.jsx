import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { journeyLegCalls } from '../services/journeySession';
import './JourneyPlanner.css';
import './JourneyProgress.css';

const modeKeys = { WALK: 'walk', METRO: 'metro', TRAM: 'tram', BUS: 'bus' };
const sourceKeys = { estimated: 'estimatedProgress', location: 'progressFromLocation', manual: 'progressFromCorrection' };

export default function JourneyProgress({ snapshot, onConfirmBoarding, onCorrectCall,
  onAdvanceLeg, onComplete, onCancel }) {
  const { t } = useTranslation();
  if (snapshot?.status !== 'active') return null;
  const { journey, legIndex, callIndex, progressSource, boardingConfirmed, remainingCalls, nativeStatus, alightAlert } = snapshot;
  const leg = journey.legs[legIndex];
  if (!leg) return null;
  const calls = journeyLegCalls(leg);
  const nativeKey = nativeStatus === 'active' ? 'backgroundActive' : nativeStatus === 'denied' ? 'permissionDenied' :
    nativeStatus === 'foreground-only' ? 'foregroundOnly' : 'backgroundUnavailable';
  return (
    <section className="journey-planner journey-progress glass-panel" aria-label={t('navigation.journeyProgress')}>
      <header className="journey-planner-header">
        <div><h2>{t('navigation.journeyProgress')}</h2><p>{leg.to.name}</p></div>
        <button type="button" onClick={onCancel} aria-label={t('navigation.cancelJourney')}><X size={20} /></button>
      </header>
      <p className="journey-muted" role="status">{t(`navigation.${sourceKeys[progressSource] || 'estimatedProgress'}`)}</p>
      <p className="journey-muted">{t(`navigation.${nativeKey}`)}</p>
      {alightAlert && (
        <p className="journey-alight-alert" role="alert">
          {t(alightAlert.estimated ? 'navigation.estimatedAlightNext' : 'navigation.alightNext')}
          {' · '}{alightAlert.destination}
        </p>
      )}
      <label htmlFor="journey-current-portion">{t('navigation.currentPortion')}</label>
      <select id="journey-current-portion" name="currentPortion" value={legIndex}
        onChange={event => onCorrectCall?.(Number(event.target.value), 0)}>
        {journey.legs.map((portion, index) => (
          <option value={index} key={portion.id}>
            {t(`navigation.${modeKeys[portion.mode] || 'walk'}`)} {portion.route?.shortName} · {portion.from.name} → {portion.to.name}
          </option>
        ))}
      </select>
      <label htmlFor="journey-current-call">{t('navigation.correctCurrentCall')}</label>
      <select id="journey-current-call" name="currentCall" value={callIndex}
        onChange={event => onCorrectCall?.(legIndex, Number(event.target.value))}>
        {calls.map((call, index) => <option value={index} key={`${call.stopId || call.name}-${index}`}>{call.name}</option>)}
      </select>
      {leg.mode !== 'WALK' && (
        boardingConfirmed ? <p className="journey-muted">{t('navigation.boardingConfirmed')}</p> :
          <button type="button" name="confirmBoarding" className="journey-primary-action" onClick={onConfirmBoarding}>{t('navigation.confirmBoarding')}</button>
      )}
      <h3>{t('navigation.upcomingCalls')}</h3>
      <p className="journey-muted">{t('navigation.callsRemaining', { count: remainingCalls })}</p>
      {remainingCalls ? <ol className="journey-upcoming-calls">
        {calls.slice(callIndex + 1).map((call, index) => <li key={`${call.stopId || call.name}-${index}`}>{call.name}</li>)}
      </ol> : <p>{t('navigation.noMoreCalls')}</p>}
      <div className="journey-progress-actions">
        {legIndex < journey.legs.length - 1 ? (
          <button type="button" className="journey-primary-action" onClick={onAdvanceLeg}>{t('navigation.nextPortion')}</button>
        ) : (
          <button type="button" className="journey-primary-action" onClick={onComplete}>{t('navigation.completeJourney')}</button>
        )}
        <button type="button" className="journey-secondary-action" onClick={onCancel}>{t('navigation.cancelJourney')}</button>
      </div>
    </section>
  );
}
