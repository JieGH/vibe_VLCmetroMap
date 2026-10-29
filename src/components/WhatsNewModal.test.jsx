import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import WhatsNewModal from './WhatsNewModal';

describe('WhatsNewModal component', () => {
  it('returns null when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <WhatsNewModal isOpen={false} onClose={() => {}} />
    );
    expect(html).toBe('');
  });

  it('renders modal dialog with bullet points and close button when isOpen is true', () => {
    const html = renderToStaticMarkup(
      <WhatsNewModal isOpen={true} onClose={() => {}} onOpenFeedback={() => {}} />
    );

    expect(html).toContain('whats-new-modal-backdrop');
    expect(html).toContain('whats-new-modal-content');
    expect(html).toContain("What&#x27;s New in Xarxa");
    expect(html).toContain('Bus Stops That Grow as You Zoom');
    expect(html).toContain('Closer Nearby Stops');
    expect(html).toContain('Faster Bus Times');
    expect(html).toContain('Drop a Pin Right Away');
    expect(html).toContain('Bigger Text, Roomier Desktop');
    expect(html).toContain('Train Service Notice');
    expect(html).toContain('Outside Spain Notice');
    expect(html).toContain('Search Buses and Stops');
    expect(html).toContain('A Tidier Map');
    expect(html).toContain('Live Bus Arrivals');
    expect(html).toContain('Metro and Bus Together');
    expect(html).toContain('Follows You as You Walk');
    expect(html).toContain('Clearer Bus Stops');
    expect(html).toContain('Real-Time Train Tracking');
    expect(html).toContain('High-Speed Vector Map');
    expect(html).toContain('Walking Times &amp; Navigation');
    expect(html).toContain('Appearance &amp; Accessibility');
    // The contact action lives in the footer button, so there is no separate feedback bullet.
    expect(html).not.toContain('Direct In-App Feedback');
    expect(html).toContain('whats-new-contact-btn');
    expect(html).toContain('whats-new-confirm-btn');
    expect(html).toContain('Got it');
  });

  it('renders contact author action when onOpenFeedback is supplied', () => {
    const htmlWithFeedback = renderToStaticMarkup(
      <WhatsNewModal isOpen={true} onClose={() => {}} onOpenFeedback={() => {}} />
    );
    expect(htmlWithFeedback).toContain('whats-new-contact-btn');

    const htmlWithoutFeedback = renderToStaticMarkup(
      <WhatsNewModal isOpen={true} onClose={() => {}} />
    );
    expect(htmlWithoutFeedback).not.toContain('whats-new-contact-btn');
  });
});
