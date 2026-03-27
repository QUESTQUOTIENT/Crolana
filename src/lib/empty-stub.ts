// Browser stub for Node.js built-in modules (stream, http, https, url, zlib, punycode)
// Required because @metaplex-foundation/umi-http-fetch bundles node-fetch which
// imports these. They are never actually called in browser context — umi uses
// fetch() directly. This stub prevents Vite/Rollup from warning about externalised modules.
export default {};
export const createReadStream = () => { throw new Error('Not available in browser'); };
export const createWriteStream = () => { throw new Error('Not available in browser'); };
export const Readable = class {};
export const Writable = class {};
export const Transform = class {};
export const PassThrough = class {};
export const request = () => { throw new Error('Not available in browser'); };
export const get = () => { throw new Error('Not available in browser'); };
