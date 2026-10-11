import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root = path.resolve('public/assets');
const tickers = ['BTC','ETH','XRP','USDT','SOL','BNB','ADA','DOGE','AVAX','MATIC','LINK','SHIB','LTC','DOT','UNI','XLM','TON','TRX','ATOM','AAVE','RNDR','TAO','NEAR','INJ'];
await fs.mkdir(path.join(root,'coins'), {recursive:true});
for (const [input, output] of [['logo.modoescuro(1).png','logo-dark.png'],['logo.modoclaro.png','logo-light.png']]) {
  await sharp(path.join(root,input)).trim({background:'#00000000'}).png({compressionLevel:9}).toFile(path.join(root,output));
}
const image = sharp(path.join(root,'logos.criptomoedas.png')); const meta = await image.metadata();
if (!meta.width || !meta.height) throw new Error('Sprite de criptomoedas inválido');
const cropAt = (index) => {
  const column = index % 6, row = Math.floor(index / 6);
  const left = Math.round(column * meta.width / 6), right = Math.round((column + 1) * meta.width / 6);
  const top = Math.round(row * meta.height / 4), bottom = Math.round((row + 1) * meta.height / 4);
  return { left, top, width: right - left, height: bottom - top };
};
for (const [i, ticker] of tickers.entries()) {
  await image.clone().extract(cropAt(i)).resize(160,160,{fit:'contain'}).png().toFile(path.join(root,'coins',`${ticker}.png`));
}
console.log(`Processed ${tickers.length} coin logos.`);
