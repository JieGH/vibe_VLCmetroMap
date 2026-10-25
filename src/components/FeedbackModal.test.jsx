import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import FeedbackModal from './FeedbackModal';
import { CONTACT_EMAIL } from '../utils/contact';

describe('FeedbackModal component', () => {
  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(<FeedbackModal isOpen={false} onClose={() => {}} />);
    expect(html).toBe('');
  });

  it('renders dialog with title, message input, direct backend submit, and GitHub issues link when open', () => {
    const html = renderToStaticMarkup(<FeedbackModal isOpen={true} onClose={() => {}} />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('id="feedback-modal-title"');
    expect(html).toContain('Feedback &amp; Support');
    expect(html).toContain(CONTACT_EMAIL);
    expect(html).toContain('textarea');
    expect(html).toContain('Send Message');
    expect(html).toContain('Report on GitHub Issues');
    expect(html).toContain('https://github.com/JieGH/vib_metroValencia/issues/new');
  });

  it('renders accessible close and email inputs', () => {
    const html = renderToStaticMarkup(<FeedbackModal isOpen={true} onClose={() => {}} />);

    expect(html).toContain('aria-label="Close feedback dialog"');
    expect(html).toContain('type="email"');
    expect(html).toContain('id="feedback-email"');
  });

  it('includes privacy and open-source reassurance', () => {
    const html = renderToStaticMarkup(<FeedbackModal isOpen={true} onClose={() => {}} />);

    expect(html).toContain('Xarxa is an independent, ad-free, open-source project');
  });

  it('renders sheet drag handle matching the station/train tab for swipe-to-dismiss', () => {
    const html = renderToStaticMarkup(<FeedbackModal isOpen={true} onClose={() => {}} />);

    expect(html).toContain('data-testid="feedback-drag-handle"');
    expect(html).toContain('sheet-drag-handle-wrap');
    expect(html).toContain('sheet-drag-handle');
  });
});
