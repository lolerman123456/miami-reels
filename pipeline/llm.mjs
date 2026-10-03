// One place for OpenAI chat calls (owner, Oct 3: keep the bill under ~$3/day).
//   tier 'write' — the main writing (carousel copy, Reel scripts): OPENAI_WRITER_MODEL (default gpt-5.5)
//   tier 'mini'  — everything else (picking, video/photo checks, captions, fact checks): OPENAI_MINI_MODEL (default gpt-5.4-mini)
// Low reasoning effort everywhere (reasoning tokens are billed as output). Token use is totalled and printed at exit
// ("OpenAI usage: …") so the daily cost can be read from the run logs.
const usage = {};
let hooked = false;

export async function chatJSON(messages, tier = 'mini') {
  const model = tier === 'write'
    ? (process.env.OPENAI_WRITER_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5')
    : (process.env.OPENAI_MINI_MODEL || 'gpt-5.4-mini');
  if (!hooked) { hooked = true; process.on('exit', () => { for (const [m, u] of Object.entries(usage)) console.log(`OpenAI usage: ${m} · ${u.calls} calls · ${u.in} in / ${u.out} out tokens`); }); }
  let effort = 'low';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages, ...(effort ? { reasoning_effort: effort } : {}) }),
      });
      if (res.status === 400 && effort) { const t = await res.text(); if (/reasoning/i.test(t)) { effort = null; attempt--; continue; } throw new Error(`OpenAI 400: ${t.slice(0, 300)}`); }
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const j = await res.json();
      const u = (usage[model] ||= { calls: 0, in: 0, out: 0 });
      u.calls++; u.in += j.usage?.prompt_tokens || 0; u.out += j.usage?.completion_tokens || 0;
      return JSON.parse(j.choices[0].message.content);
    } catch (e) {
      // out of credits: stop right away instead of producing a half-checked post
      if (/insufficient_quota|no credits remaining/i.test(e.message)) throw new Error(`OpenAI out of credits — ${e.message.slice(0, 120)}`);
      if (attempt === 3) throw e;
      console.log(`  (OpenAI attempt ${attempt} failed: ${e.message.slice(0, 120)} — retrying)`);
    }
  }
}
