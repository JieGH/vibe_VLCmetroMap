import React from 'react';
import { useTranslation } from '../i18n';

// The launcher icon (same mark as the Capacitor apps) on its dark tile, for the
// sidebar and About headers.
// `bare` drops the dark tile and draws the mark directly on whatever is behind it (the centre dot then follows the
// text colour so it shows on both themes).
const AppBadge = ({ size = 40, bare = false, className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="22 22 64 64"
    role="img"
    aria-hidden="true"
    className={className}
    style={{ borderRadius: size * 0.28, background: bare ? 'transparent' : '#1D1D29', flexShrink: 0, display: 'block', ...style }}
  >
    <g strokeWidth="6.9" strokeLinecap="round" fill="none">
      <path stroke="#00A862" d="M45.06 45.06L34.65 34.65" />
      <path stroke="#EB2323" d="M62.94 45.06L73.35 34.65" />
      <path stroke="#EB2323" d="M45.06 62.94L34.65 73.35" />
      <path stroke="#00A862" d="M62.94 62.94L73.35 73.35" />
      <path stroke="#FFD800" d="M32.7 54L41.4 54" />
      <path stroke="#FFD800" d="M66.6 54L75.3 54" />
    </g>
    <circle cx="54" cy="54" r="6" fill={bare ? 'currentColor' : '#fff'} />
  </svg>
);

export const VersionPill = ({ style, onClick, title, ...props }) => {
  const { t } = useTranslation();
  return (
  <span
    className="version-pill"
    onClick={onClick}
    title={title}
    {...(onClick ? { role: 'button', tabIndex: 0, onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && onClick(e) } : {})}
    style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '999px',
      background: 'var(--bg-hover-active, rgba(127,127,127,.2))',
      color: 'var(--text-primary)',
      fontSize: '0.75rem',
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      cursor: onClick ? 'pointer' : undefined,
      ...style,
    }}
    {...props}
  >
    v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'build'}
    {typeof __GIT_SHA__ !== 'undefined' && __GIT_SHA__ && (
      <span style={{ opacity: 0.6, fontWeight: 600, marginLeft: '6px' }} title={t('common.gitCommit')}>
        {__GIT_SHA__}
      </span>
    )}
  </span>
  );
};

export default AppBadge;
