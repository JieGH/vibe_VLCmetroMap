// TCRP Report 45 Compliant Bus Badge Component
// Shape-differentiated transit badges to avoid color collision with Metro Line 3.
import React from 'react';

/**
 * @param {{
 *   line: string,
 *   type?: 'circular' | 'radial' | 'night' | 'trunk',
 *   color?: string,
 *   size?: 'sm' | 'md' | 'lg',
 *   showIcon?: boolean,
 *   className?: string,
 *   style?: React.CSSProperties
 * }} props
 */
export const BusBadge = ({
  line,
  type,
  color,
  size = 'md',
  showIcon = true,
  className = '',
  style = {}
}) => {
  const lineStr = String(line || '').trim();
  const isCircular = type === 'circular' || lineStr.startsWith('C');
  const isNight = type === 'night' || lineStr.startsWith('N');

  // Font and padding dimensions based on size
  const dims = {
    sm: { height: 20, minWidth: 26, fontSize: '0.70rem', iconSize: 10, pad: '0 5px' },
    md: { height: 26, minWidth: 32, fontSize: '0.82rem', iconSize: 12, pad: '0 7px' },
    lg: { height: 32, minWidth: 40, fontSize: '0.96rem', iconSize: 14, pad: '0 9px' },
  }[size] || { height: 26, minWidth: 32, fontSize: '0.82rem', iconSize: 12, pad: '0 7px' };

  const lineColor = color || (isCircular ? '#D62828' : isNight ? '#312e81' : '#1565C0');

  if (isCircular) {
    // Ring / Hollow Outline Shield (TCRP 45 §3.5.1)
    return (
      <span
        className={`bus-badge bus-badge-circular ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          height: dims.height,
          minWidth: dims.minWidth,
          padding: dims.pad,
          borderRadius: 999, // Pill outline
          border: `2px solid ${lineColor}`,
          background: 'var(--bg-panel-solid, #1e2430)',
          color: '#ffffff',
          fontWeight: 800,
          fontSize: dims.fontSize,
          lineHeight: 1,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          letterSpacing: '-0.02em',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          ...style
        }}
      >
        {showIcon && <span style={{ fontSize: dims.iconSize, lineHeight: 1 }}>◯</span>}
        <span>{lineStr}</span>
      </span>
    );
  }

  // Radial Bus: Chamfered Rounded Box with Top Color Stripe
  return (
    <span
      className={`bus-badge bus-badge-radial ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        gap: 3,
        height: dims.height,
        minWidth: dims.minWidth,
        padding: dims.pad,
        borderRadius: 5, // 5px chamfer
        background: '#1e2430',
        color: '#ffffff',
        fontWeight: 800,
        fontSize: dims.fontSize,
        lineHeight: 1,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        borderTop: `3px solid ${lineColor}`,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        borderRight: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.35)',
        ...style
      }}
    >
      {showIcon && <span style={{ fontSize: dims.iconSize, lineHeight: 1 }}>🚌</span>}
      <span>{lineStr}</span>
    </span>
  );
};

export default BusBadge;
