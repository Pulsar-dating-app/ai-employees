// Tells IndexNow-enabled search engines (Bing, Yandex, Seznam, Naver…) that
// the public pages changed, so they re-crawl them now instead of on their own
// schedule. Bing matters beyond Bing: ChatGPT's web search leans on its index.
//
// Run after a deploy that changes public pages:  npm run indexnow
// (optionally: npm run indexnow -- https://www.staffra.io/para/barbearias …
//  to submit only specific URLs).
//
// The key is public by design — IndexNow proves site ownership by fetching
// https://<host>/<key>.txt, served from public/<key>.txt.

const SITE = (process.env.STAFFRA_CHECKOUT_BASE_URL || "https://www.staffra.io").replace(/\/+$/, "");
const KEY = "eb5926eece3181280465511fe5a0d19a";

async function sitemapUrls() {
  const res = await fetch(`${SITE}/sitemap.xml`);
  if (!res.ok) throw new Error(`Could not fetch the sitemap: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const urlList = process.argv.length > 2 ? process.argv.slice(2) : await sitemapUrls();
const { host } = new URL(SITE);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
});

// 200 = accepted, 202 = accepted pending key validation; anything else is an error.
console.log(`IndexNow: HTTP ${res.status} for ${urlList.length} URL(s) on ${host}`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
