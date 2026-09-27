// Post a one-off Instagram story from an image or video in the repo (e.g. stories/ugc-call.jpg).
//   node pipeline/story.mjs stories/<file>.jpg
// Started from a chat by committing requests/story.json → {"file": "stories/<file>.jpg", "at": "<ISO>"} (.github/workflows/story.yml).
import path from 'node:path';
import { ROOT } from './util.mjs';
import { publishStory } from './publish.mjs';

const file = process.argv[2];
if (!file) { console.error('Usage: node pipeline/story.mjs stories/<file>.jpg'); process.exit(1); }
await publishStory(path.resolve(ROOT, file), path.basename(file));
