const fs = require('fs');

global.window = global;

require('../js/dict.js');
require('../js/tagger.js');

const raw = fs.readFileSync('./data/ndlsh.json', 'utf8');
const json = JSON.parse(raw);

const dict = new window.NDLSHDictionary();
dict.records = json.records;
dict.totalHeadings = json.totalHeadings;
dict.totalSynonyms = json.totalSynonyms;
dict.isLoaded = true;

const tagger = new window.NDLSHTagger(dict);
tagger.buildIndex();

const text = '夏目漱石の文学作品における近代日本社会の変容と西洋哲学の影響。洋上風力発電と人工知能、図書館情報学への応用。';
const res = tagger.tagText(text, { minLen: 2, useWordBoundary: true, overlap: 'longest' });

console.log('Total matches:', res.stats.totalMatches);
console.log('Unique headings:', res.stats.uniqueHeadings);
console.log('Time (ms):', res.stats.timeMs);
for (const m of res.matches) {
  console.log(`- Matched: [${m.matchedText}] => Heading: [${m.entry.prefHeading}] (isPref: ${m.entry.isPref}, NDC: ${m.record ? m.record.ndc : ''})`);
}

const html = tagger.renderHtml(text, res.matches, 'modern');
console.log('Rendered HTML snippet:', html.substring(0, 150) + '...');
