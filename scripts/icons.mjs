// Optional asset-generation helper. Normal build has no dependencies.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/sharp` : 'sharp');
for (const size of [192,512]) await sharp('public/assets/icon.svg').resize(size,size).png().toFile(`public/assets/icon-${size}.png`);
console.log('PWA PNG icons generated from the original vector.');
