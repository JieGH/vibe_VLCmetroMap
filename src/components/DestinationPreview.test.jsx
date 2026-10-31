import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DestinationPreview from './DestinationPreview';

describe('Destination preview', () => {
  it('shows the chosen landmark and address before the passenger requests Directions', () => {
    const html = renderToStaticMarkup(<DestinationPreview destination={{
      id: 'library', name: 'Biblioteca Històrica', address: 'Carrer de la Universitat 2, València',
      coordinates: [-0.3698, 39.4694], source: 'photon', attribution: '© OpenStreetMap contributors',
    }} onDirections={() => {}} onClose={() => {}} />);
    expect(html).toContain('Biblioteca Històrica');
    expect(html).toContain('Carrer de la Universitat 2, València');
    expect(html).toContain('Directions');
    expect(html).toContain('https://www.openstreetmap.org/copyright');
    expect(html).not.toContain('disabled');
  });
});
