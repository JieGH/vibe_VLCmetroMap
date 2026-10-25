// Netlify serverless function for receiving direct in-app user feedback.
export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
    });
  }

  try {
    const data = await req.json();
    if (!data || typeof data.message !== 'string' || !data.message.trim()) {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[Feedback Received]', {
      timestamp: new Date().toISOString(),
      message: data.message.trim(),
      email: data.email || null,
      metadata: data.metadata || null,
    });

    return new Response(JSON.stringify({ success: true, message: 'Feedback received' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/feedback' };
