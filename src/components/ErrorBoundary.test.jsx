import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

describe('ErrorBoundary component', () => {
  it('renders children when no error has occurred', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary>
        <div data-testid="child-content">Normal Content</div>
      </ErrorBoundary>
    );

    expect(html).toContain('Normal Content');
    expect(html).not.toContain('role="alert"');
  });

  it('renders recovery screen when state has error', () => {
    const boundary = new ErrorBoundary({ children: <div>Child</div> });
    boundary.state = { hasError: true, error: new Error('Simulated failure') };

    const rendered = boundary.render();
    const html = renderToStaticMarkup(rendered);

    expect(html).toContain('role="alert"');
    // Outside the I18nProvider, so it reads the saved language: Spanish when nothing is saved yet.
    expect(html).toContain('Ha ocurrido un error inesperado');
    expect(html).toContain('Reiniciar la app');
    expect(html).toContain('Reintentar');
  });

  it('updates state via getDerivedStateFromError', () => {
    const err = new Error('Test error');
    const newState = ErrorBoundary.getDerivedStateFromError(err);
    expect(newState).toEqual({ hasError: true, error: err });
  });

  it('resets error state via handleReset', () => {
    const boundary = new ErrorBoundary({});
    boundary.state = { hasError: true, error: new Error('Oops') };
    boundary.setState = function(updater) {
      Object.assign(this.state, typeof updater === 'function' ? updater(this.state) : updater);
    };

    boundary.handleReset();
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
  });
});
