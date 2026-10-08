// Caption layout (owner, Oct 8: "all captions need to be formatted with hashtags at the bottom with those dots in between"):
//   <caption text>
//   •  (×5)
//   #tag #tag #tag #tag      ← max 4 hashtags (content rule)
export function formatCaption(caption = '') {
  const text = String(caption);
  const tags = [...new Set((text.match(/#[A-Za-z][\w]*/g) || []).map(t => t.toLowerCase()))].slice(0, 4);
  const body = text.replace(/(^|\s)#[A-Za-z][\w]*/g, '$1') // drop the hashtags from the text…
    .replace(/[ \t]{2,}/g, ' ').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n')
    .replace(/^[•\s]+$/gm, '')                              // …and any old dot separators
    .replace(/\n{3,}/g, '\n\n').trim();
  return tags.length ? `${body}\n•\n•\n•\n•\n•\n${tags.join(' ')}` : body;
}
