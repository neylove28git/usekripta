export type AiMode = 'chat' | 'market' | 'agent';
export type AiMessage = { role: 'user' | 'assistant'; content: string };

export async function askKoin(messages: AiMessage[], mode: AiMode = 'chat', marketContext?: string) {
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, mode, marketContext }) });
  const body = await response.json().catch(() => null) as { content?: string; error?: string } | null;
  if (!response.ok || !body?.content) throw new Error(body?.error || 'Não foi possível responder agora.');
  return body.content;
}
