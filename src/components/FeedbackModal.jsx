import React, { useState, useEffect } from 'react';
import { X, Send, CheckCircle2, Copy, Check, ExternalLink, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from '../i18n';
import { CONTACT_EMAIL } from '../utils/contact';
import { getClientDiagnostics } from '../utils/diagnostics';
import { useDragToDismiss } from '../utils/useDragToDismiss';

/**
 * In-app Feedback & Support Modal.
 * Sends user feedback and bug reports directly to the backend (/api/feedback),
 * eliminating the need to open an external mail client.
 */
const FeedbackModal = ({ isOpen, onClose }) => {
  const { t, language } = useTranslation();
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'submitting' | 'success' | 'error'
  const [copied, setCopied] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Swipe-down-to-dismiss is disabled while the user has an input focused to prevent accidental
  // card movement and premature dismissal while composing feedback.
  const { handleProps, cardStyle: dragStyle } = useDragToDismiss({
    onDismiss: onClose,
    enabled: Boolean(isOpen) && !isInputFocused,
    threshold: 70,
  });

  // Track visual viewport so modal adapts when virtual keyboard opens on iOS/Android
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !window.visualViewport) return;

    const handleResize = () => {
      setViewportHeight(window.visualViewport.height);
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    handleResize();

    return () => {
      window.visualViewport.removeEventListener('resize', handleResize);
      window.visualViewport.removeEventListener('scroll', handleResize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setStatus('idle');
      setMessage('');
      setEmail('');
      setViewportHeight(null);
      return;
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const cleanMessage = message.trim();
    if (!cleanMessage || status === 'submitting') return;

    // Dismiss virtual keyboard smoothly on mobile so confirmation is immediately visible
    if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    setStatus('submitting');

    try {
      const metadata = getClientDiagnostics(language);
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cleanMessage,
          email: email.trim() || undefined,
          metadata,
        }),
      });

      if (!res.ok) {
        throw new Error(`Status ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setStatus('success');
      } else {
        throw new Error(data.error || 'Server rejected');
      }
    } catch {
      setStatus('error');
    }
  };

  const handleCopyEmail = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(CONTACT_EMAIL);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = CONTACT_EMAIL;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard write errors
    }
  };

  return (
    <div
      className="feedback-modal-backdrop"
      onClick={onClose}
      data-testid="feedback-modal-backdrop"
      style={viewportHeight ? { '--visual-viewport-height': `${viewportHeight}px` } : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        className="glass-panel feedback-modal-content"
        style={{
          ...dragStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top drag handle indicator for swipe-down to dismiss */}
        <div
          className="sheet-drag-handle-wrap"
          data-testid="feedback-drag-handle"
          {...handleProps}
        >
          <div className="sheet-drag-handle" />
        </div>

        {/* Header */}
        <div
          className="feedback-modal-header"
          {...handleProps}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'var(--bg-hover)',
                color: 'var(--accent-blue, #007AFF)',
                flexShrink: 0,
              }}
            >
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 id="feedback-modal-title" className="feedback-modal-title">
                {t('feedback.title')}
              </h2>
              <div className="feedback-modal-subtitle">
                {t('feedback.subtitle')}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="feedback-modal-close"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t('feedback.closeAria')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="feedback-modal-body">
          {status === 'success' ? (
            <div className="feedback-success-card">
              <div className="feedback-success-icon-wrap">
                <CheckCircle2 size={46} color="#4CAF50" />
              </div>
              <h3 className="feedback-success-title">{t('feedback.successTitle')}</h3>
              <p className="feedback-success-text">{t('feedback.successMessage')}</p>
              <div className="feedback-success-actions">
                <button
                  type="button"
                  className="feedback-submit-btn"
                  onClick={onClose}
                  style={{ width: '100%' }}
                >
                  {t('feedback.done')}
                </button>
                <button
                  type="button"
                  className="feedback-secondary-btn"
                  onClick={() => {
                    setStatus('idle');
                    setMessage('');
                    setEmail('');
                  }}
                >
                  {t('feedback.sendAnother')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="feedback-form">
                <div className="feedback-field">
                  <label htmlFor="feedback-textarea" className="feedback-label">
                    {t('feedback.messageLabel')}
                  </label>
                  <textarea
                    id="feedback-textarea"
                    rows={3}
                    className="feedback-textarea"
                    placeholder={t('feedback.placeholder')}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    required
                    disabled={status === 'submitting'}
                  />
                </div>

                <div className="feedback-field">
                  <label htmlFor="feedback-email" className="feedback-label">
                    {t('feedback.emailLabel')}
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    className="feedback-input"
                    placeholder={t('feedback.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    disabled={status === 'submitting'}
                  />
                </div>

                {status === 'error' && (
                  <div className="feedback-error-banner" role="alert">
                    <AlertCircle size={15} flexShrink={0} />
                    <span>{t('feedback.errorSending')}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'submitting' || !message.trim()}
                  className="feedback-submit-btn"
                  onPointerDown={(e) => {
                    // Critical iOS Safari fix: prevents virtual keyboard blur from swallowing the click event
                    e.preventDefault();
                  }}
                  onClick={handleSubmit}
                >
                  {status === 'submitting' ? (
                    <>
                      <Loader2 size={16} className="feedback-spinner" />
                      <span>{t('feedback.sending')}</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>{t('feedback.submitBtn')}</span>
                    </>
                  )}
                </button>
              </form>

              {/* Quick Direct Channel & GitHub */}
              <div className="feedback-channels">
                <div className="feedback-direct-row">
                  <span className="feedback-direct-label">{t('feedback.orDirectEmail')}</span>
                  <div className="feedback-email-pill">
                    <span className="feedback-email-text">{CONTACT_EMAIL}</span>
                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      className="feedback-copy-btn"
                      title={copied ? t('feedback.copied') : t('feedback.copyEmail')}
                      aria-label={copied ? t('feedback.copied') : t('feedback.copyEmail')}
                    >
                      {copied ? <Check size={13} color="#4CAF50" /> : <Copy size={13} />}
                      <span>{copied ? t('feedback.copied') : t('feedback.copyEmail')}</span>
                    </button>
                  </div>
                </div>

                <a
                  href="https://github.com/JieGH/vib_metroValencia/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="feedback-github-btn"
                >
                  <ExternalLink size={14} />
                  <span>{t('feedback.githubIssues')}</span>
                </a>
              </div>

              <p className="feedback-privacy-note">
                {t('feedback.privacyNote')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;
