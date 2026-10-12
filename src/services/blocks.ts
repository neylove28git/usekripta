export const cardVariants = ['price_chart','bar_compare','split_flow','kpi_grid','score_bars','radial_allocation'] as const;
export type CardVariant = typeof cardVariants[number];
export type TextBlock = {type:'text';markdown:string};
export type CardBlock = {type:'card';variant:CardVariant;title:string;subtitle?:string;data:Record<string,unknown>;footnote?:string};
export type ChatBlock = TextBlock|CardBlock;
export type ChatBlocks = {blocks:ChatBlock[]};

const isObject=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
export function parseChatBlocks(value:unknown):ChatBlocks|null{
 if(!isObject(value)||!Array.isArray(value.blocks)||value.blocks.length===0||value.blocks.length>7)return null;
 let cards=0;const blocks:ChatBlock[]=[];
 for(const block of value.blocks){
  if(!isObject(block)||typeof block.type!=='string')return null;
  if(block.type==='text'&&typeof block.markdown==='string'&&block.markdown.trim()&&block.markdown.length<=6000){blocks.push({type:'text',markdown:block.markdown.trim()});continue}
  if(block.type==='card'&&cardVariants.includes(block.variant as CardVariant)&&typeof block.title==='string'&&isObject(block.data)){
   const source=block.data.source,period=block.data.period;
   if(typeof source!=='string'||!source.trim()||typeof period!=='string'||!period.trim())continue;
   cards++;if(cards>3)return null;blocks.push({type:'card',variant:block.variant as CardVariant,title:block.title,subtitle:typeof block.subtitle==='string'?block.subtitle:undefined,data:block.data,footnote:typeof block.footnote==='string'?block.footnote:undefined});continue;
  }
  return null;
 }
 return blocks.length?{blocks}:null;
}

export function blocksToText(structured:ChatBlocks){return structured.blocks.filter((block):block is TextBlock=>block.type==='text').map(block=>block.markdown).join('\n\n')}
