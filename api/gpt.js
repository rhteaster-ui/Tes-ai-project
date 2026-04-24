import crypto from 'node:crypto';

const limiter = globalThis.__gptLimiter || new Map();
globalThis.__gptLimiter = limiter;

async function noteGptChat(messages = []) {
  const conversationId = crypto.randomUUID();
  let fullText = '';

  const lastMessage = messages[messages.length - 1] || {};
  const userMessage = String(lastMessage.content || '').trim();

  if (!userMessage) {
    throw new Error('Pesan pengguna kosong.');
  }

  const response = await fetch('https://notegpt.io/api/v2/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
      Referer: 'https://notegpt.io/ai-chat',
    },
    body: JSON.stringify({
      message: userMessage,
      language: 'auto',
      model: 'gpt-5-mini',
      tone: 'default',
      length: 'moderate',
      conversation_id: conversationId,
      image_urls: [],
      chat_mode: 'standard',
    }),
  });

  if (!response.ok || !response.body) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`NoteGPT error ${response.status}: ${bodyText || 'empty response body'}`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      try {
        const json = JSON.parse(line.slice(6));
        if (json.text) fullText += json.text;
        if (json.done) {
          return {
            success: true,
            message: fullText.trim(),
            conversationId,
          };
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return {
    success: true,
    message: fullText.trim(),
    conversationId,
  };
}

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function enforceRateLimit(ip) {
  const now = Date.now();
  const item = limiter.get(ip) || { count: 0, resetAt: now + 60_000, last: 0 };

  if (now > item.resetAt) {
    item.count = 0;
    item.resetAt = now + 60_000;
  }

  if (now - item.last < 2500) {
    return { ok: false, status: 429, message: 'Terlalu cepat. Beri jeda sekitar 2-3 detik antar request.' };
  }

  item.count += 1;
  item.last = now;
  limiter.set(ip, item);

  if (item.count > 10) {
    return { ok: false, status: 429, message: 'Batas request per menit tercapai. Coba lagi sebentar.' };
  }

  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const ip = getIp(req);
  const limited = enforceRateLimit(ip);
  if (!limited.ok) {
    return res.status(limited.status).json({ error: limited.message });
  }

  try {
    const { prompt = '' } = req.body || {};
    const safePrompt = String(prompt || '').slice(0, 4000).trim();

    if (!safePrompt) {
      return res.status(400).json({ error: 'Prompt wajib diisi.' });
    }

    const result = await noteGptChat([{ role: 'user', content: safePrompt }]);
    const cleanReply = String(result.message || '').trim();

    if (!cleanReply) {
      return res.status(200).json({
        reply: 'Balasan model kosong. Silakan ulangi pertanyaan dengan lebih spesifik.',
        reason: 'EMPTY_MODEL_OUTPUT',
        model: 'gpt-5-mini',
        conversationId: result.conversationId || null,
      });
    }

    return res.status(200).json({
      reply: cleanReply,
      model: 'gpt-5-mini',
      conversationId: result.conversationId || null,
    });
  } catch (error) {
    console.error('gpt handler error', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
