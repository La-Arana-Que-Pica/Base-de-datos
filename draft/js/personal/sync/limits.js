export const SYNC_LIMITS=Object.freeze({profileBytes:32*1024*1024,manifestBytes:2*1024*1024,chunkBytes:512*1024,batchBytes:1024*1024,components:20000});
export const bytes=text=>new TextEncoder().encode(text).byteLength;
