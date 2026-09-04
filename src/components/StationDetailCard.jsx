import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Clock, MapPin, Navigation, RefreshCw, Radio, Database } from 'lucide-react';
import { fetchRealStationArrivals, arrivalStore } from '../utils/arrivals';

const StationDetailCard = ({ station, onClose, onCenter }) => {
  const [arrivals, setArrivals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [isFromCache, setIsFromCache] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [_tick, setTick] = useState(Date.now());
  const stationRef = useRef(station);
  stationRef.current = station;

  const loadData = useCallback(async (forceRefresh = false) => {
    if (!station) return;

    // Check if we have cached memory first for instant, zero-flicker display
    const cached = arrivalStore.getCachedArrivals(station.properties);
    if (cached && !forceRefresh) {
      setArrivals(cached.arrivals);
      setLastUpdated(cached.fetchedAt);
      setIsFromCache(true);
      setIsLoading(false);
      setFetchError(cached.fetchError);
      // If cached data is still within fresh TTL, don't trigger network call
      if (cached.isFresh) {
        return;
      }
      // If stale, refresh in background without full blocking loader
      setIsRefreshing(true);
    } else {
      if (forceRefresh) setIsRefreshing(true);
      else setIsLoading(true);
    }

    setFetchError(null);

    const data = await fetchRealStationArrivals(station.properties, { forceRefresh });
    
    // Guard against race conditions if user switched stations while loading
    if (stationRef.current !== station) return;

    setArrivals(data);
    setIsFromCache(Boolean(data.isFromCache));
    setFetchError(data.fetchError || null);
    setLastUpdated(data.fetchedAt || Date.now());
    setIsLoading(false);
    setIsRefreshing(false);
  }, [station]);

  // Load immediately on station change and poll on interval
  useEffect(() => {
    if (!station) return;
    loadData(false);

    // Refresh every 60s when card stays open
    const id = setInterval(() => {
      loadData(false);
    }, 60000);
    return () => clearInterval(id);
  }, [station, loadData]);

  // Update tick every 1000ms so arrival countdowns tick down continuously
  useEffect(() => {
    if (!station) return undefined;
    setTick(Date.now());
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [station]);

  if (!station) return null;

  const props = station.properties;
  const lines = props.lines || [];

  const now = Date.now();
  // Filter and compute remaining countdown for each arrival
  const activeArrivals = (arrivals || [])
    .filter(a => {
      if (!a.targetTimestamp) return a.isLive;
      // Keep trains until 35s after they reach the platform
      return (a.targetTimestamp + 35000) >= now;
    })
    .map(a => {
      if (!a.targetTimestamp) return a;
      const remainingSeconds = Math.max(0, Math.round((a.targetTimestamp - now) / 1000));
      const minutes = Math.max(0, Math.round(remainingSeconds / 60));
      let status = a.status;
      if (remainingSeconds <= 0) {
        status = 'At Platform';
      } else if (remainingSeconds <= 120) {
        status = 'Approaching';
      } else {
        status = 'On Time';
      }
      return { ...a, seconds: remainingSeconds, minutes, status };
    })
    .sort((a, b) => a.seconds - b.seconds);

  const isAnyLive = activeArrivals.some(a => a.isLive);
  const updatedTime = new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div
      className="glass-panel station-detail-card"
      style={{
        position: 'absolute',
        bottom: '24px',
        right: '24px',
        width: '360px',
        maxHeight: '480px',
        zIndex: 30,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        animation: 'slideUp 0.25s ease-out',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'var(--bg-hover)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <MapPin size={22} color="#FFD100" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{props.name}</h3>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Metro Station</span>
              {isAnyLive && (
                <span style={{
                  fontSize: '0.65rem',
                  color: isFromCache ? '#00B4D8' : '#4CAF50',
                  background: isFromCache ? 'rgba(0,180,216,0.15)' : 'rgba(76,175,80,0.15)',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600
                }}>
                  {isFromCache ? (
                    <>
                      <Database size={9} /> MEMORY SYNC
                    </>
                  ) : (
                    <>
                      <Radio size={10} className="pulse" /> LIVE API
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ padding: '6px', borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Connected Lines Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Lines:</span>
        {lines.map((l, idx) => {
          const arrival = activeArrivals.find(a => a.line === l);
          const color = arrival ? arrival.lineColor : (l === '1' ? '#FFD100' : l === '3' ? '#E2001A' : '#888');
          return (
            <span
              key={idx}
              style={{
                padding: '3px 10px',
                borderRadius: '12px',
                background: color,
                color: '#fff',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.3px',
              }}
            >
              L{l}
            </span>
          );
        })}
      </div>

      {/* Live Arrivals Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '1px solid var(--border-color)', paddingTop: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
          <Clock size={15} color="var(--text-secondary)" />
          Upcoming Arrivals
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }} title={`Synced at ${updatedTime}`}>
            {updatedTime}
          </span>
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              cursor: isRefreshing ? 'wait' : 'pointer',
              background: 'transparent',
              border: 'none',
              padding: '2px 4px',
            }}
          >
            <RefreshCw size={11} className={isRefreshing ? 'spin' : ''} />
            {isRefreshing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Arrivals List */}
      {fetchError && (
        <div
          role="status"
          style={{
            padding: '8px 10px', borderRadius: '8px',
            background: 'rgba(255, 152, 0, 0.14)', color: '#ffb74d',
            fontSize: '0.72rem', lineHeight: 1.35,
          }}
        >
          {fetchError}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', maxHeight: '200px' }}>
        {isLoading ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '16px' }}>
            Fetching live MetroValencia predictions...
          </div>
        ) : activeArrivals.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px' }}>
            No live trains arriving soon.
          </div>
        ) : (
          activeArrivals.map((arr, idx) => {
            const isAtPlatform = arr.seconds <= 0;
            const timeLabel = isAtPlatform
              ? 'At Platform'
              : (arr.seconds < 60 ? `${arr.seconds}s` : `${Math.floor(arr.seconds / 60)} min ${arr.seconds % 60}s`);
            const isImminent = arr.seconds <= 120;

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'var(--bg-hover)',
                  borderLeft: `3px solid ${arr.lineColor}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    background: arr.lineColor, color: '#fff',
                    fontSize: '10px', fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {arr.line}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>to {arr.destination}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      {arr.lineName} {arr.vehicleId ? `• Train #${arr.vehicleId}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontSize: '0.9rem', fontWeight: 700,
                    color: isImminent ? '#FF4D4D' : 'var(--text-primary)',
                  }}>
                    {timeLabel}
                  </div>
                  <div style={{
                    fontSize: '0.62rem',
                    color: (arr.status === 'Approaching' || arr.status === 'At Platform') ? '#FF4D4D' : '#4CAF50',
                    fontWeight: 500,
                  }}>
                    {arr.status}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Center on Map button */}
      <button
        onClick={onCenter}
        style={{
          marginTop: '4px',
          padding: '10px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #FFD100 0%, #E2001A 100%)',
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(226,0,26,0.3)',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <Navigation size={15} />
        Center Station on Map
      </button>
    </div>
  );
};

export default StationDetailCard;
