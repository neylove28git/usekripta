import { getMarketInsight, marketErrorMessage } from './coinpaprika.js';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type ChatRequest = { messages: ChatMessage[]; mode?: 'chat' | 'market' | 'agent'; marketContext?: string; structured?: boolean; retry?: boolean };

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 4_000;
const attempts = new Map<string, number[]>();

const systemInstructions = {
  chat: 'Você é a assistente da Kripta, uma plataforma de criptomoedas. Converse em português do Brasil de forma natural, clara e próxima, como uma especialista acessível. Responda primeiro ao que foi perguntado, explique termos técnicos de forma simples na primeira vez e use o histórico para não repetir explicações. Mantenha-se no tema de cripto, investimentos, mercado e uso da Kripta. Sem emojis, exageros, frases de efeito ou enrolação. Priorize o que está acontecendo, por que importa e o que observar; mostre oportunidades e riscos com equilíbrio. Nunca prometa retorno, trate previsão como certeza ou invente dados. Feche, quando fizer sentido, com um próximo passo útil ou uma pergunta objetiva. Use Markdown apenas quando ajudar.',
  market: 'Você é a assistente da Kripta para análises de mercado. Escreva em português do Brasil de forma humana, clara e profissional. Use apenas dados fornecidos no contexto, com fonte e período. Nunca invente preços, cotações, indicadores, séries, datas ou notícias. Se os dados forem ausentes, insuficientes ou desatualizados, explique isso em uma frase e não crie gráficos nem cards. Mostre riscos e oportunidades de modo equilibrado, sem recomendação personalizada ou promessa de retorno.',
  agent: 'Você é Koin, agente da Kripta. Interprete o pedido e explique o que pode ser feito com os dados e ferramentas realmente fornecidos. Nunca afirme ter criado alertas, conectado corretoras, executado transações ou consultado dados externos sem uma ferramenta e confirmação reais. Peça confirmação para ações importantes. Responda em português.',
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

// Remove somente sequências de emoji; letras acentuadas, símbolos financeiros, Markdown e código permanecem intactos.
function cleanEmoji(text: string) { return text.replace(/(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Emoji_Presentation}(?:\uFE0F|\u200D\p{Emoji_Presentation})*)/gu, ''); }
function sse(body: ReadableStream<Uint8Array>) { return new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' } }); }
const structuredSchema={type:'object',additionalProperties:false,required:['blocks'],properties:{blocks:{type:'array',minItems:1,maxItems:7,items:{oneOf:[{type:'object',additionalProperties:false,required:['type','markdown'],properties:{type:{const:'text'},markdown:{type:'string'} }},{type:'object',additionalProperties:false,required:['type','variant','title','data'],properties:{type:{const:'card'},variant:{enum:['price_chart','bar_compare','split_flow','kpi_grid','score_bars','radial_allocation']},title:{type:'string'},subtitle:{type:'string'},data:{type:'object',required:['source','period'],properties:{source:{type:'string'},period:{type:'string'}},additionalProperties:true},footnote:{type:'string'}}}]}}}} as const;
function validStructured(value:unknown):value is {blocks:unknown[]}{if(!value||typeof value!=='object'||!Array.isArray((value as {blocks?:unknown}).blocks))return false;let cards=0;for(const block of (value as {blocks:unknown[]}).blocks){if(!block||typeof block!=='object')return false;const b=block as Record<string,unknown>;if(b.type==='text'&&typeof b.markdown==='string')continue;if(b.type==='card'&&typeof b.title==='string'&&typeof b.variant==='string'&&b.data&&typeof b.data==='object'){const data=b.data as Record<string,unknown>;if(typeof data.source!=='string'||typeof data.period!=='string')return false;cards++;continue}return false}return cards<=3}

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
    if(payload.structured){
      const question = [...payload.messages].reverse().find((message) => message.role === 'user')?.content || '';
      let marketContext = context;
      let verifiedCards: unknown[] = [];
      if (mode === 'market') {
        try {
          const insight = await getMarketInsight(question);
          if (insight.context) marketContext += `\n\nDados verificados da CoinPaprika:\n${insight.context}`;
          if (insight.limitation) marketContext += `\n\nLimitação da fonte: ${insight.limitation}`;
          verifiedCards = insight.cards;
        } catch (error) {
          marketContext += `\n\nLimitação da fonte: ${marketErrorMessage(error)}`;
          console.error('CoinPaprika indisponível para análise:', error instanceof Error ? error.name : 'erro-desconhecido');
        }
      }
      const formatInstruction=`${systemInstructions.market}${marketContext}\n\nResponda somente no JSON de blocos solicitado. Inclua texto curto e natural. Retorne exclusivamente blocos do tipo text: os cards são montados pelo servidor somente a partir dos dados verificados da CoinPaprika. Sem dados verificáveis, explique a limitação em um bloco de texto. Não invente números, séries, datas ou fontes.`;
      const structuredUpstream=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json','http-referer':request.headers.get('origin')||'https://usekripta.vercel.app','x-title':'Kripta'},body:JSON.stringify({model,messages:[{role:'system',content:formatInstruction},...payload.messages],temperature:0.35,max_tokens:1400,response_format:{type:'json_schema',json_schema:{name:'kripta_chat_blocks',strict:true,schema:structuredSchema}}})});
      const data=await structuredUpstream.json().catch(()=>null) as {choices?:Array<{message?:{content?:string}}>;error?:{message?:string;code?:string}}|null;
      if(!structuredUpstream.ok){const message=data?.error?.message||'Não foi possível obter uma análise da IA.';const status=structuredUpstream.status===429?429:structuredUpstream.status===401||structuredUpstream.status===403?502:503;console.error('OpenRouter recusou análise estruturada:',structuredUpstream.status,data?.error?.code||'sem-código');return json({error:status===429?'O limite do provedor foi atingido. Tente novamente em alguns instantes.':status===502?'A configuração da IA foi recusada pelo provedor.':message},status)}
      const content=data?.choices?.[0]?.message?.content;let blocks:unknown=null;try{blocks=JSON.parse(cleanEmoji(content||''))}catch{}if(!validStructured(blocks))return json({error:'A IA retornou uma análise inválida.'},502);
      const textBlocks=(blocks as {blocks:unknown[]}).blocks.filter((block)=>Boolean(block)&&typeof block==='object'&&(block as {type?:unknown}).type==='text');
      const safeBlocks=textBlocks.length?textBlocks:[{type:'text',markdown:'Não há dados verificáveis suficientes para montar uma análise de mercado agora.'}];
      return json({blocks:{blocks:[...safeBlocks,...verifiedCards].slice(0,7)}});
    }
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'http-referer': request.headers.get('origin') || 'https://usekripta.vercel.app', 'x-title': 'Kripta' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: `${systemInstructions[mode]}${context}` }, ...payload.messages], temperature: 0.4, max_tokens: 850, stream: true }),
    });
    if (!upstream.ok) {
      const data = await upstream.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
      const message = data?.error?.message || 'Não foi possível obter uma resposta da IA.';
      const modelUnavailable = /not a valid model|model.+(invalid|not found|unavailable)|invalid model/i.test(message);
      const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status === 429 ? 429 : 503;
      console.error('OpenRouter recusou a solicitação:', upstream.status, data?.error?.code || 'sem-código');
      return json({ error: status === 429 ? 'O limite do provedor foi atingido. Tente novamente em alguns instantes.' : status === 502 ? 'A configuração da IA foi recusada pelo provedor.' : modelUnavailable ? 'O modelo de IA configurado não está disponível no OpenRouter. Atualize OPENROUTER_MODEL no ambiente do servidor e tente novamente.' : message }, status);
    }
    if (!upstream.body) return json({ error: 'A IA retornou uma resposta inválida. Tente novamente.' }, 502);
    const reader = upstream.body.getReader(), decoder = new TextDecoder(), encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = '';
        const emit = (event:unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        try {
          while (true) {
            const {done,value} = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), {stream:!done});
            const lines = buffer.split('\n'); buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim(); if (data === '[DONE]') { emit({type:'done'}); continue; }
              try { const chunk = JSON.parse(data) as {choices?:Array<{delta?:{content?:string}}>,error?:{message?:string}}; if (chunk.error?.message) emit({type:'error',error:chunk.error.message}); const text = cleanEmoji(chunk.choices?.[0]?.delta?.content || ''); if (text) emit({type:'delta',text}); } catch { /* ignore malformed upstream chunks */ }
            }
            if (done) break;
          }
        } catch (error) { if (!request.signal.aborted) emit({type:'error',error:'A conexão com a IA foi interrompida.'}); }
        finally { reader.releaseLock(); controller.close(); }
      },
      cancel() { void reader.cancel(); },
    });
    return sse(stream);
  } catch (error) {
    console.error('Falha de rede ao consultar OpenRouter:', error instanceof Error ? error.name : 'erro-desconhecido');
    return json({ error: 'Não foi possível alcançar o serviço de IA. Tente novamente.' }, 503);
  }
}
