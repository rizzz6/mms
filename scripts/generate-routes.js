const fs = require('fs');
const path = require('path');

const routes = {
  version: 1,
  include: ["/*"],
  exclude: [
    "/_next/static/*",
    "/favicon.ico",
    "/sw.js",
    "/manifest.webmanifest",
    "/*.svg",
    "/*.png",
    "/*.jpg",
    "/*.jpeg",
    "/*.gif",
    "/*.webp"
  ]
};

fs.writeFileSync(
  path.join('.open-next', '_routes.json'),
  JSON.stringify(routes, null, 2)
);

console.log("Generated _routes.json for Cloudflare Pages.");
