// Consistent EMT Bus Badge Component
// Renders all EMT bus line badges with consistent official red branding.
import React from 'react';
import { busBadgeBox } from '../utils/busBadgeStyle';

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
  showIcon = false,
  className = '',
  style = {}
}) => {
  const lineStr = String(line || '').trim();
  const isCircular = type === 'circular' || lineStr.startsWith('C');

  // Font and padding dimensions based on size
  const dims = {
    sm: { ...busBadgeBox(18), fontSize: '0.70rem', iconSize: 10 },
    md: { ...busBadgeBox(24), fontSize: '0.80rem', iconSize: 12 },
    lg: { ...busBadgeBox(30), fontSize: '0.92rem', iconSize: 14 },
  }[size] || { ...busBadgeBox(24), fontSize: '0.80rem', iconSize: 12 };

  // Unified EMT red branding matching the stop marker badge on the map
  const badgeColor = '#D62828';

  return (
    <span
      className={`bus-badge ${isCircular ? 'bus-badge-circular' : 'bus-badge-radial'} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        gap: 3,
        height: dims.height,
        minWidth: dims.minWidth,
        padding: dims.padding,
        borderRadius: 4,
        background: badgeColor,
        color: '#ffffff',
        fontWeight: 900,
        fontSize: dims.fontSize,
        lineHeight: 1,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        letterSpacing: '0.02em',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        boxShadow: '0 1.5px 3px rgba(0, 0, 0, 0.35)',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {showIcon && (
        <span
          style={{
            fontSize: '0.54rem',
            fontWeight: 900,
            background: '#ffffff',
            color: '#D62828',
            padding: '1px 3px',
            borderRadius: 2,
            letterSpacing: '0.04em',
            lineHeight: 1,
            display: 'inline-block',
          }}
        >
          EMT
        </span>
      )}
      <span>{lineStr}</span>
    </span>
  );
};

export default BusBadge;
