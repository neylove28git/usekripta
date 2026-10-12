const API_BASE = 'https://api.coinpaprika.com/v1';
const SOURCE = 'CoinPaprika';

type Currency = 'BRL' | 'USD';
type Coin = { id: string; name: string; symbol: string; rank?: number; is_active?: boolean };
type Quote = { price?: number; volume_24h?: number; market_cap?: number; percent_change_24h?: number; percent_change_7d?: number; percent_change_30d?: number };
type Ticker = { id: string; name: string; symbol: string; rank?: number; last_updated?: string; quotes?: Partial<Record<Currency, Quote>> };
type HistoryPoint = { timestamp?: string; price?: number; volume_24h?: number; market_cap?: number };

type Card = { type: 'card'; variant: 'price_chart' | 'bar_compare' | 'kpi_grid'; title: string; subtitle?: string; data: Record<string, unknown>; footnote?: string };
export type MarketInsight = { context: string; cards: Card[]; limitation?: string };

class MarketDataError extends Error {
  constructor(public readonly kind: 'not_found' | 'rate_limited' | 'unavailable', message: string) { super(message); }
}

const cache = new Map<string, { expiresAt: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, get: () => Promise<T>): Promise<T> {
  const current = cache.get(key);
  if (current && current.expiresAt > Date.now()) return current.value as T;
  const value = await get();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) }); }
  catch { throw new MarketDataError('unavailable', 'A fonte de mercado não respondeu a tempo.'); }
  if (response.status === 429) throw new MarketDataError('rate_limited', 'A fonte de mercado atingiu o limite temporário de consultas.');
  if (response.status === 404) throw new MarketDataError('not_found', 'O ativo informado não foi encontrado na fonte de mercado.');
  if (!response.ok) throw new MarketDataError('unavailable', 'A fonte de mercado está indisponível no momento.');
  const data = await response.json().catch(() => null);
  if (!data) throw new MarketDataError('unavailable', 'A fonte de mercado retornou uma resposta inválida.');
  return data as T;
}

function plain(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function isNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function format(value: number, currency: Currency) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: value >= 100 ? 2 : 6 }).format(value); }
function compact(value: number, currency: Currency) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 2 }).format(value); }
function percent(value: number) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(value); }
function isoDay(date: Date) { return date.toISOString().slice(0, 10); }

const stopWords = new Set(['analise','analisa','analise','mercado','preco','cotacao','cotacoes','grafico','historico','historica','hoje','semana','mes','meses','ano','anos','compare','comparar','com','para','sobre','como','esta','estao','quero','quanto','vale','valor','atual','dados','cripto','criptomoeda','criptomoedas','moeda','moedas','brl','usd','reais','dolar','dolares','de','da','do','e','ou','a','o','as','os','em','por','favor']);

function candidates(question: string) {
  const words = plain(question).match(/[a-z0-9]{2,30}/g) || [];
  return [...new Set(words.filter((word) => !stopWords.has(word)).slice(0, 6))];
}

async function resolveCoin(term: string): Promise<Coin | null> {
  return cached(`search:${term}`, 6 * 60 * 60 * 1000, async () => {
    const modifier = /^[a-z0-9]{2,10}$/i.test(term) ? '&modifier=symbol_search' : '';
    const result = await request<{ currencies?: Coin[] }>(`/search?q=${encodeURIComponent(term)}&c=currencies&limit=10${modifier}`);
    const coins = (result.currencies || []).filter((coin) => coin.is_active !== false && coin.id && coin.symbol && coin.name);
    const normalized = plain(term);
    return coins.find((coin) => plain(coin.symbol) === normalized) || coins.find((coin) => plain(coin.name) === normalized) || coins[0] || null;
  });
}

async function ticker(id: string): Promise<Ticker> { return cached(`ticker:${id}`, 60_000, () => request<Ticker>(`/tickers/${encodeURIComponent(id)}?quotes=BRL,USD`)); }
async function history(id: string, days: number): Promise<HistoryPoint[]> {
  const end = new Date(); const start = new Date(end.getTime() - days * 86_400_000);
  return cached(`history:${id}:${days}:${isoDay(end)}`, 5 * 60_000, () => request<HistoryPoint[]>(`/tickers/${encodeURIComponent(id)}/historical?start=${isoDay(start)}&end=${isoDay(end)}&interval=1d&quote=usd`));
}

function period(question: string) {
  const text = plain(question);
  if (/30\s*dias|mes|mensal/.test(text)) return { days: 30, label: '30 dias' };
  if (/7\s*dias|semana|semanal/.test(text)) return { days: 7, label: '7 dias' };
  if (/ano|365/.test(text)) return { days: 365, label: '365 dias' };
  return { days: 7, label: '7 dias' };
}

function selectedQuote(ticker: Ticker): { quote: Quote; currency: Currency } | null {
  if (ticker.quotes?.BRL && isNumber(ticker.quotes.BRL.price)) return { quote: ticker.quotes.BRL, currency: 'BRL' };
  if (ticker.quotes?.USD && isNumber(ticker.quotes.USD.price)) return { quote: ticker.quotes.USD, currency: 'USD' };
  return null;
}

function sourceUrl(id: string) { return `${API_BASE}/tickers/${encodeURIComponent(id)}?quotes=BRL,USD`; }
function periodLabel(lastUpdated?: string) { return `24 horas · atualizado em ${lastUpdated ? new Date(lastUpdated).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : 'horário não informado'}`; }

function priceCard(asset: Ticker, quote: Quote, currency: Currency, points: HistoryPoint[], requestedPeriod: string): Card {
  const series = points.filter((point) => isNumber(point.price)).map((point) => ({ value: point.price, timestamp: point.timestamp }));
  const dailyChange = isNumber(quote.percent_change_24h) ? quote.percent_change_24h : 0;
  return {
    type: 'card', variant: 'price_chart', title: `${asset.name} (${asset.symbol})`, subtitle: `Preço e evolução diária em ${currency}`,
    data: { source: SOURCE, sourceUrl: sourceUrl(asset.id), period: requestedPeriod, value: format(quote.price!, currency), change: '24h', changePercent: dailyChange, series },
    footnote: `${SOURCE} · ${periodLabel(asset.last_updated)}`,
  };
}

function metricsCard(asset: Ticker, quote: Quote, currency: Currency, requestedPeriod: string): Card | null {
  const metrics = [
    isNumber(quote.market_cap) ? { label: 'Capitalização', value: compact(quote.market_cap, currency) } : null,
    isNumber(quote.volume_24h) ? { label: 'Volume 24h', value: compact(quote.volume_24h, currency) } : null,
    isNumber(quote.percent_change_7d) ? { label: 'Variação 7d', value: `${percent(quote.percent_change_7d)}%` } : null,
    isNumber(quote.percent_change_30d) ? { label: 'Variação 30d', value: `${percent(quote.percent_change_30d)}%` } : null,
  ].filter(Boolean);
  if (!metrics.length) return null;
  return { type: 'card', variant: 'kpi_grid', title: `Indicadores de ${asset.symbol}`, subtitle: `Dados de mercado em ${currency}`, data: { source: SOURCE, sourceUrl: sourceUrl(asset.id), period: requestedPeriod, items: [{ label: 'Preço', value: format(quote.price!, currency) }, { label: 'Ranking', value: asset.rank ? `#${asset.rank}` : 'Não informado' }], metrics }, footnote: `${SOURCE} · ${periodLabel(asset.last_updated)}` };
}

function comparisonCard(items: Array<{ ticker: Ticker; quote: Quote; currency: Currency }>, requestedPeriod: string): Card | null {
  if (items.length < 2) return null;
  const sameCurrency = items.every((item) => item.currency === items[0].currency);
  if (!sameCurrency) return null;
  const values = items.map((item) => item.quote.market_cap).filter(isNumber);
  const max = Math.max(...values, 1);
  return { type: 'card', variant: 'bar_compare', title: 'Comparativo de capitalização', subtitle: `Ativos consultados em ${items[0].currency}`, data: { source: SOURCE, sourceUrl: `${API_BASE}/tickers`, period: requestedPeriod, value: 'Capitalização de mercado', bars: items.map((item) => ({ label: item.ticker.symbol, value: isNumber(item.quote.market_cap) ? compact(item.quote.market_cap, item.currency) : 'Não informado', percent: isNumber(item.quote.market_cap) ? item.quote.market_cap / max * 100 : 0, active: item.quote === items[0].quote })) }, footnote: `${SOURCE} · consulta atual` };
}

export async function getMarketInsight(question: string): Promise<MarketInsight> {
  const requestedPeriod = period(question);
  const terms = candidates(question);
  if (!terms.length) return { context: '', cards: [], limitation: 'Não identifiquei um ativo específico para consultar na CoinPaprika.' };

  const resolved = (await Promise.all(terms.map(resolveCoin))).filter((coin): coin is Coin => Boolean(coin));
  const unique = [...new Map(resolved.map((coin) => [coin.id, coin])).values()].slice(0, 3);
  if (!unique.length) return { context: '', cards: [], limitation: 'Não encontrei o ativo solicitado na CoinPaprika.' };

  const snapshots = await Promise.all(unique.map(async (coin) => {
    const asset = await ticker(coin.id); const selection = selectedQuote(asset);
    return selection ? { ticker: asset, ...selection } : null;
  }));
  const assets = snapshots.filter((item): item is { ticker: Ticker; quote: Quote; currency: Currency } => Boolean(item));
  if (!assets.length) return { context: '', cards: [], limitation: 'A CoinPaprika não retornou uma cotação utilizável para o ativo solicitado.' };

  const first = assets[0];
  const wantsHistory = /graf|histor|tendencia|evolu|semana|mes|ano|dias/i.test(plain(question));
  let historical: HistoryPoint[] = [];
  if (wantsHistory) {
    try { historical = await history(first.ticker.id, requestedPeriod.days); } catch (error) { if (!(error instanceof MarketDataError)) throw error; }
  }
  const context = assets.map(({ ticker: asset, quote, currency }) => `${asset.name} (${asset.symbol}): preço ${format(quote.price!, currency)}; variação 24h ${isNumber(quote.percent_change_24h) ? `${percent(quote.percent_change_24h)}%` : 'não informada'}; capitalização ${isNumber(quote.market_cap) ? compact(quote.market_cap, currency) : 'não informada'}; volume 24h ${isNumber(quote.volume_24h) ? compact(quote.volume_24h, currency) : 'não informado'}; rank ${asset.rank || 'não informado'}; atualizado ${asset.last_updated || 'não informado'}; fonte ${sourceUrl(asset.id)}.`).join('\n');
  const cards: Card[] = [];
  // O endpoint histórico gratuito só fornece USD ou BTC. O gráfico usa USD para
  // não misturar uma série em uma moeda com uma cotação exibida em outra.
  const historicalQuote = first.ticker.quotes?.USD;
  if (historical.length > 1 && historicalQuote && isNumber(historicalQuote.price)) cards.push(priceCard(first.ticker, historicalQuote, 'USD', historical, requestedPeriod.label));
  const kpis = metricsCard(first.ticker, first.quote, first.currency, requestedPeriod.label); if (kpis) cards.push(kpis);
  const compare = comparisonCard(assets, requestedPeriod.label); if (compare) cards.push(compare);
  return { context, cards: cards.slice(0, 3) };
}

export function marketErrorMessage(error: unknown) {
  return error instanceof MarketDataError ? error.message : 'Não foi possível consultar a fonte de mercado neste momento.';
}
