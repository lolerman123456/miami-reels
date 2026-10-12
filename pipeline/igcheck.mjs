// Instagram posting health check (Oct 12: posts failed with "API access blocked"). Never publishes: reads the account,
// the publishing limit, and creates (but does not publish) one image container — the exact call that was blocked.
const token = process.env.INSTAGRAM_ACCESS_TOKEN, igUser = process.env.INSTAGRAM_USER_ID;
const api = `https://${token.startsWith('IG') ? 'graph.instagram.com' : 'graph.facebook.com'}/v23.0`;
const show = async (label, url, opts) => { const r = await (await fetch(url, opts)).json(); console.log(`${label}: ${JSON.stringify(r.error ? { error: r.error.message, code: r.error.code, subcode: r.error.error_subcode } : r)}`); return r; };
await show('account', `${api}/me?fields=username,account_type&access_token=${token}`);
await show('publishing limit', `${api}/${igUser}/content_publishing_limit?fields=quota_usage,config&access_token=${token}`);
const img = 'https://lolerman123456.github.io/miami-reels/tt/2026-10-08-restaurants/01.jpg';
await show('create container (not published)', `${api}/${igUser}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ image_url: img, access_token: token }) });
