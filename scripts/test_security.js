const assert = require('assert');
global.window = global;

require('../js/dict.js');
require('../js/tagger.js');

console.log('--- Testing escapeJsInjection ---');
const escapeJsInjection = NDLSHTagger.escapeJsInjection;

// 1. Check backslash
assert.strictEqual(escapeJsInjection('C:\\path'), 'C:\\\\path');

// 2. Check single quote
assert.strictEqual(escapeJsInjection("alert('xss')"), "alert(\\'xss\\')");

// 3. Check double quote
assert.strictEqual(escapeJsInjection('alert("xss")'), 'alert(\\"xss\\")');

// 4. Check double slash and slash
assert.strictEqual(escapeJsInjection('// comment'), '\\/\\/ comment');
assert.strictEqual(escapeJsInjection('a/b'), 'a\\/b');

// 5. Check carriage return (\r)
assert.strictEqual(escapeJsInjection("line1\rline2"), "line1\\rline2");

// 6. Check line feed (\n)
assert.strictEqual(escapeJsInjection("line1\nline2"), "line1\\nline2");

// 7. Check tab (\t)
assert.strictEqual(escapeJsInjection("col1\tcol2"), "col1\\tcol2");

// 8. Check combo: \n/
assert.strictEqual(escapeJsInjection("test\n/payload"), "test\\n\\/payload");

// 9. Complex JS injection payload test
const payload = `\'; alert("XSS"); //\r\n\t\\`;
const escaped = escapeJsInjection(payload);
console.log('Original payload:', JSON.stringify(payload));
console.log('Escaped payload: ', JSON.stringify(escaped));
assert.strictEqual(escaped, `\\'; alert(\\"XSS\\"); \\/\\/\\r\\n\\t\\\\`);

console.log('--- Testing 1000 character limit in tagText ---');
const dict = new window.NDLSHDictionary();
dict.records = [];
dict.isLoaded = true;
const tagger = new window.NDLSHTagger(dict);
tagger.buildIndex();

const longText = 'あ'.repeat(1500);
const res = tagger.tagText(longText);
// Should not fail and should process text <= 1000 chars
console.log('Processed long text without errors.');

console.log('All tests passed successfully!');
