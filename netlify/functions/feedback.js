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

    const cleanMsg = data.message.trim();
    const timestamp = new Date().toISOString();

    console.log('\n================== [FEEDBACK RECEIVED] ==================');
    console.log(`Time:     ${timestamp}`);
    console.log(`Message:  ${cleanMsg}`);
    if (data.email) console.log(`Email:    ${data.email}`);
    if (data.metadata) console.log(`Metadata: ${JSON.stringify(data.metadata)}`);
    console.log('=========================================================\n');

    return new Response(JSON.stringify({
      success: true,
      message: 'Feedback received',
      receivedMessage: cleanMsg,
    }), {
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
