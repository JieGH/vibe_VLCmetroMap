import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Home screen (Add to Home Screen) and Web App metadata', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const manifestPath = path.join(rootDir, 'public/manifest.webmanifest');
  const appleIconPath = path.join(rootDir, 'public/apple-touch-icon.png');
  const icon192Path = path.join(rootDir, 'public/icon-192.png');
  const icon512Path = path.join(rootDir, 'public/icon-512.png');

  it('declares apple-touch-icon and webmanifest in index.html', () => {
    const html = fs.readFileSync(indexHtmlPath, 'utf-8');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('href="/manifest.webmanifest"');
    expect(html).toContain('name="apple-mobile-web-app-title" content="Xarxa"');
    expect(html).toContain('name="application-name" content="Xarxa"');
  });

  it('provides a valid web manifest with Xarxa metadata and icons', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(content.short_name).toBe('Xarxa');
    expect(content.name).toContain('Xarxa');
    expect(Array.isArray(content.icons)).toBe(true);

    const iconSrcs = content.icons.map(icon => icon.src);
    expect(iconSrcs).toContain('/icon-192.png');
    expect(iconSrcs).toContain('/icon-512.png');
    expect(iconSrcs).toContain('/apple-touch-icon.png');
  });

  it('provides physical icon image files in public directory', () => {
    expect(fs.existsSync(appleIconPath)).toBe(true);
    expect(fs.statSync(appleIconPath).size).toBeGreaterThan(1000);

    expect(fs.existsSync(icon192Path)).toBe(true);
    expect(fs.statSync(icon192Path).size).toBeGreaterThan(1000);

    expect(fs.existsSync(icon512Path)).toBe(true);
    expect(fs.statSync(icon512Path).size).toBeGreaterThan(1000);
  });
});
