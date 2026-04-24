import crypto from 'node:crypto';

const limiter = globalThis.__gptLimiter || new Map();
globalThis.__gptLimiter = limiter;

const BASE_URL = 'https://chatgpt.com';

class ChatGpt {
  constructor(c = {}) {
    this.useAuth = c.useAuth || false;
    this.baseUrl = BASE_URL;
    this.userAgent = c.user_agent || 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36';
    this.msgid = c.msg_id || crypto.randomUUID();
    this.oaiDid = c.did || crypto.randomUUID();
    this.screenWidth = c.width || 1920;
    this.screenHeight = c.height || 1080;
    this.lang = c.lang || 'en-US';
    this.buildNumber = c.build_number || 'prod-2294c45e1eaa6a898633916fa7682b2e6b912617';
  }

  webHeaders(extra = {}) {
    return {
      'OAI-Device-Id': this.oaiDid,
      accept: '*/*',
      ...(this.useAuth ? { authorization: `Bearer ${this.useAuth}` } : {}),
      'User-Agent': this.userAgent,
      'accept-language': 'en-US,en;q=0.9,id-ID;q=0.8,id;q=0.7',
      'content-type': 'application/json',
      'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site',
      Referer: 'https://chatgpt.com',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...extra,
    };
  }

  qh(t) {
    return Buffer.from(JSON.stringify(t)).toString('base64');
  }

  nce(t) {
    let e = 2166136261;
    for (let i = 0; i < t.length; i++) {
      e ^= t.charCodeAt(i);
      e = Math.imul(e, 16777619) >>> 0;
    }
    e ^= e >>> 16;
    e = Math.imul(e, 2246822507) >>> 0;
    e ^= e >>> 13;
    e = Math.imul(e, 3266489909) >>> 0;
    e ^= e >>> 16;
    return (e >>> 0).toString(16).padStart(8, '0');
  }

  createBrowserConfig() {
    return [
      this.screenWidth + this.screenHeight,
      String(new Date()),
      2172649472,
      Math.random(),
      this.userAgent,
      null,
      this.buildNumber,
      this.lang,
      `${this.lang},en`,
      Math.random(),
      'contacts−[object ContactsManager]',
      '_reactListening6506zq7cxya',
      'Nazir',
      performance.now(),
      this.msgid,
      '',
      8,
      performance.timeOrigin,
      0, 0, 0, 0, 0, 0, 0,
    ];
  }

  runCheck(s, seed, difficulty, config, a) {
    config[3] = a;
    config[9] = Math.round(performance.now() - s);
    const x = this.qh(config);
    return this.nce(seed + x).substring(0, difficulty.length) <= difficulty ? `${x}~S` : null;
  }

  getPow(seed, difficulty, config) {
    const s = performance.now();
    for (let r = 0; r < 500000; r++) {
      const out = this.runCheck(s, seed, difficulty, config, r);
      if (out) return `gAAAAAB${out}`;
    }
    return 'wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4De';
  }

  getRequirementsTokenBlocking() {
    const n = performance.now();
    const config = this.createBrowserConfig();
    config[3] = 1;
    config[9] = performance.now() - n;
    return `gAAAAAC${this.qh(config)}`;
  }

  async generateToken() {
    const pData = this.getRequirementsTokenBlocking();
    const config = this.createBrowserConfig();

    const prepareRes = await fetch(`${this.baseUrl}/backend-anon/sentinel/chat-requirements/prepare`, {
      method: 'POST',
      headers: this.webHeaders(),
      body: JSON.stringify({ p: pData }),
    }).then((r) => r.json());

    let powToken = null;
    if (prepareRes.proofofwork?.required) {
      powToken = this.getPow(prepareRes.proofofwork.seed, prepareRes.proofofwork.difficulty, config);
    }

    const turnstileToken = crypto.randomBytes(Math.floor((2256 / 4) * 3)).toString('base64').slice(0, 2256);

    const finalizeBody = { prepare_token: prepareRes.prepare_token || '' };
    if (powToken) finalizeBody.proofofwork = powToken;
    finalizeBody.turnstile = turnstileToken;

    const finalizeRes = await fetch(`${this.baseUrl}/backend-anon/sentinel/chat-requirements/finalize`, {
      method: 'POST',
      headers: this.webHeaders(),
      body: JSON.stringify(finalizeBody),
    }).then((r) => r.json());

    return { pow: powToken, turnstile: turnstileToken, prepare_token: finalizeRes.token || null };
  }

  initConversation(text, partial = false, web = false, id = this.msgid) {
    const base = {
      action: 'next',
      parent_message_id: 'client-created-root',
      model: 'auto',
      timezone_offset_min: new Date().getTimezoneOffset(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      conversation_mode: { kind: 'primary_assistant' },
      system_hints: [],
      supports_buffering: true,
      supported_encodings: ['v1'],
    };

    if (partial) {
      return {
        ...base,
        fork_from_shared_post: false,
        partial_query: { id, author: { role: 'user' }, content: { content_type: 'text', parts: [text] } },
        client_contextual_info: { app_name: 'chatgpt.com' },
      };
    }

    const payload = {
      ...base,
      messages: [{
        id,
        author: { role: 'user' },
        create_time: Date.now() / 1000,
        content: { content_type: 'text', parts: [text] },
        metadata: { selected_github_repos: [], selected_all_github_repos: false, serialization_metadata: { custom_symbol_offsets: [] } },
      }],
      enable_message_followups: true,
      client_contextual_info: {
        is_dark_mode: true,
        time_since_loaded: 24,
        page_height: 850,
        page_width: 451,
        pixel_ratio: 1.59,
        screen_height: this.screenHeight,
        screen_width: this.screenWidth,
        app_name: 'chatgpt.com',
      },
      paragen_cot_summary_display_override: 'allow',
      force_parallel_switch: 'auto',
    };

    if (web) {
      Object.assign(payload, {
        system_hints: ['search'],
        force_use_search: true,
        client_reported_search_source: 'conversation_composer_web_icon',
      });
    }

    return payload;
  }

  async init(text, web, id) {
    const prepare = await fetch(`${this.baseUrl}/backend-anon/f/conversation/prepare`, {
      headers: this.webHeaders({ 'X-Conduit-Token': 'no-token' }),
      body: JSON.stringify(this.initConversation(text, true, web, id)),
      method: 'POST',
    });
    const data = await prepare.json();
    return data.token;
  }

  async startConversation(msg, web = false, id = this.msgid) {
    if (!msg) return { subtitle: null, model: null, msg: 'no msg' };

    const req = await this.generateToken();
    const conduit = await this.init(msg, web, id);

    const res = await fetch(`${this.baseUrl}/backend-anon/f/conversation`, {
      method: 'POST',
      body: JSON.stringify(this.initConversation(msg, false, web, id)),
      headers: this.webHeaders({
        'OAI-Language': 'en-US',
        'Content-Type': 'application/json',
        'OpenAI-Sentinel-Chat-Requirements-Token': req.prepare_token,
        'OpenAI-Sentinel-Turnstile-Token': req.turnstile,
        'OpenAI-Sentinel-Proof-Token': req.pow,
        'X-Conduit-Token': conduit,
        accept: 'text/event-stream',
      }),
    });

    const decoder = new TextDecoder();
    let buffer = '';
    let finalText = '';
    let subtitle = null;
    let model = null;
    let lastEventType = null;
    let fallbackText = '';

    const readText = (value) => {
      if (!value) return '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map((v) => readText(v)).join('');
      if (typeof value !== 'object') return '';

      const direct = [value.text, value.content, value.value]
        .filter((v) => typeof v === 'string')
        .join('');
      if (direct) return direct;

      return [
        readText(value.message?.content?.parts),
        readText(value.delta),
        readText(value.parts),
        readText(value.content?.parts),
      ].join('');
    };

    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') {
          const msg = (finalText || fallbackText || '').trim();
          return { subtitle, model, msg, eventType: lastEventType };
        }

        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }

        if (json.type === 'title_generation') subtitle = json.title;
        if (json.type === 'server_ste_metadata') model = json.metadata?.model_slug;
        if (json.type) lastEventType = json.type;

        const patches = Array.isArray(json.v) ? json.v : [];
        for (const p of patches) {
          if (p.o === 'append' && p.p?.includes('/message/content/parts/')) {
            finalText += p.v || '';
          }
        }

        if (!finalText) {
          const eventText = readText(json);
          if (eventText) fallbackText += eventText;
        }
      }
    }

    const msg = (finalText || fallbackText || '').trim();
    return { subtitle, model, msg, eventType: lastEventType };
  }
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
    const { prompt = '', web = false } = req.body || {};
    const safePrompt = String(prompt || '').slice(0, 4000).trim();

    if (!safePrompt) {
      return res.status(400).json({ error: 'Prompt wajib diisi.' });
    }

    const client = new ChatGpt();
    const result = await client.startConversation(safePrompt, Boolean(web));
    const cleanReply = String(result.msg || '').trim();
    if (!cleanReply) {
      return res.status(200).json({
        reply: 'Balasan model kosong. Silakan ulangi pertanyaan dengan lebih spesifik.',
        reason: 'EMPTY_MODEL_OUTPUT',
        subtitle: result.subtitle || null,
        model: result.model || 'chatgpt-web',
        eventType: result.eventType || null,
      });
    }

    return res.status(200).json({
      reply: cleanReply,
      subtitle: result.subtitle || null,
      model: result.model || 'chatgpt-web',
      eventType: result.eventType || null,
    });
  } catch (error) {
    console.error('gpt handler error', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
