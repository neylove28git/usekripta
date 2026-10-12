type ChatMessage = { role: 'user' | 'assistant'; content: string };
type ChatRequest = { messages: ChatMessage[]; mode?: 'chat' | 'market' | 'agent'; marketContext?: string };

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 4_000;
const attempts = new Map<string, number[]>();

const systemInstructions = {
  chat: 'Você é Koin, assistente da Kripta. Responda sempre em português claro e conciso. Não dê recomendação financeira personalizada; apresente riscos e ressalve incertezas.',
  market: 'Você é Koin, analista da Kripta. Analise exclusivamente os dados de mercado fornecidos no contexto. Não invente preços, cotações, indicadores, datas ou notícias. Se o contexto estiver ausente, insuficiente ou desatualizado, diga isso claramente. Responda em português e não faça recomendação financeira personalizada.',
  agent: 'Você é Koin, agente da Kripta. Interprete o pedido e explique o que pode ser feito com os dados e ferramentas realmente fornecidos. Nunca afirme ter criado alertas, conectado corretoras, executado transações ou consultado dados externos sem uma ferramenta e confirmação reais. Peça confirmação para ações importantes. Responda em português.',
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function clientKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous';
}

function limited(key: string) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return true;
  recent.push(now);
  attempts.set(key, recent);
  return false;
}

function validMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && message.content.trim().length > 0 && message.content.length <= MAX_CONTENT_LENGTH;
}

export async function POST(request: Request) {
  if (limited(clientKey(request))) return json({ error: 'Muitas mensagens em pouco tempo. Aguarde um minuto e tente novamente.' }, 429);
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!key || !model) {
    console.error('OpenRouter não configurado: variáveis de ambiente ausentes.');
    return json({ error: 'A IA ainda não foi configurada no servidor.' }, 503);
  }

  let payload: ChatRequest;
  try { payload = await request.json() as ChatRequest; } catch { return json({ error: 'Solicitação inválida.' }, 400); }
  const mode = payload.mode || 'chat';
  if (!['chat', 'market', 'agent'].includes(mode) || !Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > MAX_MESSAGES || !payload.messages.every(validMessage)) {
    return json({ error: 'A mensagem enviada é inválida ou excede o limite permitido.' }, 400);
  }
  if (payload.marketContext && (typeof payload.marketContext !== 'string' || payload.marketContext.length > MAX_CONTENT_LENGTH)) return json({ error: 'Contexto de mercado inválido.' }, 400);

  const context = payload.marketContext?.trim() ? `\n\nDados disponíveis na plataforma (podem estar desatualizados):\n${payload.marketContext.trim()}` : '';
  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'http-referer': request.headers.get('origin') || 'https://usekripta.vercel.app', 'x-title': 'Kripta' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: `${systemInstructions[mode]}${context}` }, ...payload.messages], temperature: 0.35, max_tokens: 850 }),
    });
    const data = await upstream.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string; code?: string } } | null;
    if (!upstream.ok) {
      const message = data?.error?.message || 'Não foi possível obter uma resposta da IA.';
      const modelUnavailable = /not a valid model|model.+(invalid|not found|unavailable)|invalid model/i.test(message);
      const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status === 429 ? 429 : 503;
      console.error('OpenRouter recusou a solicitação:', upstream.status, data?.error?.code || 'sem-código');
      return json({ error: status === 429 ? 'O limite do provedor foi atingido. Tente novamente em alguns instantes.' : status === 502 ? 'A configuração da IA foi recusada pelo provedor.' : modelUnavailable ? 'O modelo de IA configurado não está disponível no OpenRouter. Atualize OPENROUTER_MODEL no ambiente do servidor e tente novamente.' : message }, status);
    }
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error('OpenRouter retornou uma resposta sem conteúdo.');
      return json({ error: 'A IA retornou uma resposta inválida. Tente novamente.' }, 502);
    }
    return json({ content, model });
  } catch (error) {
    console.error('Falha de rede ao consultar OpenRouter:', error instanceof Error ? error.name : 'erro-desconhecido');
    return json({ error: 'Não foi possível alcançar o serviço de IA. Tente novamente.' }, 503);
  }
}
