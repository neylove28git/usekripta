export type Effort = 'Baixo' | 'Média' | 'Alto' | 'Ultra';
export interface CoinAnalysis { ticker:string; price:string; change:string; summary:string; }
const wait = (ms=260) => new Promise(resolve=>setTimeout(resolve,ms));
export async function getCoins(){ await wait(); return ['BTC','ETH','XRP','USDT','SOL','BNB']; }
export async function getCoinAnalysis(ticker:string, effort:Effort):Promise<CoinAnalysis>{ await wait(effort==='Ultra'?750:320); return {ticker,price:'US$ 1,40',change:'+1,0%',summary:`Análise mockada de ${ticker} para esforço ${effort}.`}; }
export async function sendMessage(_chatId:string,text:string,effort:Effort){ await wait(); return {text,effort,createdAt:new Date().toISOString()}; }
export async function createAlert(target:string){ await wait(); return {id:crypto.randomUUID(),target}; }
export async function connectPlugin(plugin:string){ await wait(450); return {plugin,connected:true}; }
export async function validateCoupon(code:string){ await wait(); return {valid:code.trim().toUpperCase()==='KRIPTA27',discount:27}; }
