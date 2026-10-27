// Tells the page which country its request came from, so it can warn a visitor on a VPN or abroad that the
// train and bus services may refuse them. Returns the country code only: no IP, no city (the telemetry
// function is the one that logs those).
import { extractClientInfo } from './feedback.js';

export default async (req, context) => {
  const country = extractClientInfo(req).country || context?.geo?.country?.code || null;
  return new Response(JSON.stringify({ country }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const config = { path: '/api/region' };
