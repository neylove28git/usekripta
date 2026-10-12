export type AiMode = 'chat' | 'market' | 'agent';
import {blocksToText,parseChatBlocks,type ChatBlocks} from './blocks';
export type AiMessage = { id?:string; role: 'user' | 'assistant'; content: string; structured?:ChatBlocks|null; animate?:boolean };

type StreamEvent = { type?: 'delta' | 'done' | 'error'; text?: string; error?: string };

export async function streamKoin(messages: AiMessage[], mode: AiMode, marketContext: string | undefined, signal: AbortSignal, onDelta: (text: string) => void) {
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, mode, marketContext }), signal });
  if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string } | null; throw new Error(body?.error || 'Não foi possível responder agora.'); }
  if (!response.body) throw new Error('A resposta da IA não pôde ser iniciada.');
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', result = '';
  const handle = (line:string) => { if (!line.startsWith('data:')) return; const event = JSON.parse(line.slice(5).trim()) as StreamEvent; if (event.type === 'error') throw new Error(event.error || 'A resposta foi interrompida.'); if (event.type === 'delta' && event.text) { result += event.text; onDelta(result); } };
  try { while (true) { const {done,value} = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), {stream:!done}); const lines = buffer.split('\n'); buffer = lines.pop() || ''; lines.forEach(handle); if (done) break; } if (buffer.trim()) handle(buffer); return result.trim(); } finally { reader.releaseLock(); }
}

export async function askKoin(messages: AiMessage[], mode: AiMode = 'chat', marketContext?: string) {
  const controller = new AbortController(); let answer = '';
  await streamKoin(messages, mode, marketContext, controller.signal, text => { answer = text; });
  if (!answer) throw new Error('A IA retornou uma resposta vazia.');
  return answer;
}

export async function askKoinBlocks(messages: AiMessage[], marketContext?:string){
 const request=async(retry=false)=>{const response=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages,mode:'market',marketContext,structured:true,retry})});const body=await response.json().catch(()=>null) as {blocks?:unknown;error?:string}|null;if(!response.ok)throw new Error(body?.error||'Não foi possível responder agora.');const structured=parseChatBlocks(body?.blocks);if(!structured)throw new Error('A análise recebida não está em um formato válido.');return structured};
 try{return await request()}catch(error){try{return await request(true)}catch{return {blocks:[{type:'text' as const,markdown:'Não foi possível estruturar esta análise agora. Posso explicar o contexto disponível em texto simples.'}]}}}
}

export const structuredText=(blocks:ChatBlocks)=>blocksToText(blocks);
