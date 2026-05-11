const fs = require('fs');
let w = `            // @ts-expect-error: resolved by wrangler build
            const { handler } = await import("./server-functions/default/handler.mjs");
            return handler(reqOrResp, env, ctx, request.signal);`;

w = w.replace(/const { handler } = await import\((.+?)\)/, 'const mod = await import($1); const handler = mod.handler || mod.default || mod');
console.log(w);
