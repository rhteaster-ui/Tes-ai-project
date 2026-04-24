const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function toInlineData(dataUrl) {
  const [meta, data] = dataUrl.split(',');
  const mime = meta?.match(/data:(.*?);base64/)?.[1] || 'image/png';
  return { inlineData: { mimeType: mime, data } };
}

function buildHistoryParts(history = []) {
  return history
    .filter((m) => m && (m.text || (m.images && m.images.length)))
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(m.text ? [{ text: String(m.text) }] : []),
        ...((m.images || []).map((img) => toInlineData(img))),
      ],
    }));
}

async function callGemini({ apiKey, model, body }) {
  const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;
  const maxAttempts = 3;
  const retryDelayMs = [800, 1600];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (response.ok) {
      return data;
    }

    const msg = data?.error?.message || JSON.stringify(data);
    const retryable = [429, 500, 503].includes(response.status);
    const hasNextAttempt = attempt < maxAttempts;

    if (retryable && hasNextAttempt) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs[attempt - 1] || 2000));
      continue;
    }

    throw new Error(`Gemini API ${response.status}: ${msg}`);
  }

  throw new Error('Gemini API gagal setelah beberapa percobaan.');
}

function extractOutput(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  let reply = '';
  const images = [];

  for (const part of parts) {
    if (part.text) reply += `${part.text}\n`;
    if (part.inlineData?.data && part.inlineData?.mimeType?.startsWith('image/')) {
      images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
    }
  }

  return { reply: reply.trim(), images };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY belum di-set di Vercel Environment Variables.' });
  }

  try {
    const {
      prompt = '',
      images = [],
      history = [],
      mode = 'chat',
      model = 'gemini-2.5-flash',
    } = req.body || {};
    const sanitizedHistory = Array.isArray(history)
      ? history
          .filter((m) => m && typeof m === 'object' && (m.text || (Array.isArray(m.images) && m.images.length)))
          .slice(-16)
          .map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            text: String(m.text || '').slice(0, 4000),
            images: Array.isArray(m.images) ? m.images.slice(0, 2) : [],
          }))
      : [];
    const imageParts = images.map((img) => toInlineData(img));
    const contents = [...buildHistoryParts(sanitizedHistory)];
    const systemInstruction = {
      parts: [{ text: 'Kamu asisten cerdas berbahasa Indonesia. Jawaban harus jelas, natural, dan helpful seperti ChatGPT. Untuk kode, gunakan markdown code block.' }],
    };

    const allowedModel = 'gemini-2.5-flash';
    const safeModel = model === allowedModel ? model : allowedModel;

    contents.push({
      role: 'user',
      parts: [{ text: prompt }, ...imageParts],
    });

    const body = {
      contents,
      systemInstruction,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    };

    const data = await callGemini({ apiKey, model: safeModel, body });
    const output = extractOutput(data);

    if (!output.reply && !output.images.length) {
      return res.status(200).json({ reply: 'Model tidak mengembalikan output. Coba ulangi prompt.', images: [] });
    }

    return res.status(200).json(output);
  } catch (error) {
    console.error('chat handler error', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
