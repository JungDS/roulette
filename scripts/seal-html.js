// dist/index.html 의 보안 정책(CSP) 을 마무리하고, 정책을 깨는 것이 섞여 들지 않았는지 확인한다.
//
// index.html 에는 CSP 가 <meta> 로 들어 있다 (GitHub Pages 는 응답 헤더를 정할 수 없다).
// 그런데 Parcel 이 빌드하면서 문서 맨 앞에 인라인 스크립트 <script type=importmap> 를 끼워 넣는다.
// 번들이 그림과 wasm 의 주소를 찾는 데 쓰는 표라서 없으면 페이지가 뜨지 않는다.
//
// - meta 로 준 CSP 는 그 태그보다 뒤에 오는 내용에만 적용되므로, CSP 를 문서 맨 앞으로 옮긴다.
// - 인라인 스크립트는 CSP 가 막으므로, importmap 내용의 해시를 script-src 에 넣어 이것 하나만 허용한다.
//   내용이 한 글자라도 바뀌면 해시가 맞지 않아 실행되지 않는다.
//
// 빌드할 때마다 아래 조건을 확인하고, 어긋나면 빌드를 실패시킨다.
// - importmap 말고는 인라인 스크립트가 없다
// - 인라인 이벤트 핸들러(onclick= 등) 와 style 속성이 없다
// - 다른 서버에서 불러오는 스크립트, 스타일, 그림이 없다

const assert = require('node:assert');
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');

const FILE = 'dist/index.html';
let html = readFileSync(FILE, 'utf-8');

const cspPattern = /<meta http-equiv="?Content-Security-Policy"? content="([^"]*)">/g;
const cspTags = [...html.matchAll(cspPattern)];
assert.strictEqual(cspTags.length, 1, 'CSP meta 태그가 정확히 하나 있어야 한다');
const [cspTag, policy] = cspTags[0];
assert(policy.includes("script-src 'self'"), "CSP 에 script-src 'self' 가 있어야 한다");
assert(!/unsafe-inline|unsafe-eval'|\*/.test(policy.replace(/'wasm-unsafe-eval'/g, '')), 'CSP 를 느슨하게 풀면 안 된다');

const charsetTag = html.match(/<meta charset="?[\w-]+"?>/)?.[0];
assert(charsetTag, '<meta charset> 이 있어야 한다');

const htmlOpenTag = html.match(/<html\b[^>]*>/)?.[0];
assert(htmlOpenTag, '<html> 태그가 있어야 한다');

// 인라인 스크립트는 Parcel 이 넣은 importmap 하나만 허용한다
const hashes = [];
for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/\bsrc=/.test(attributes)) {
    assert(body.trim() === '', 'src 가 있는 스크립트에는 내용이 없어야 한다');
    continue;
  }
  assert(/\btype="?importmap"?/.test(attributes), `importmap 이 아닌 인라인 스크립트가 있다: <script${attributes}>`);
  hashes.push(`'sha256-${createHash('sha256').update(body, 'utf-8').digest('base64')}'`);
}
assert(hashes.length <= 1, 'importmap 은 하나만 있어야 한다');

const sealedPolicy = policy.replace("script-src 'self'", ["script-src 'self'", ...hashes].join(' '));
const sealedTag = cspTag.replace(policy, sealedPolicy);

// charset 과 CSP 를 문서 맨 앞(<html> 바로 뒤) 으로 옮긴다. 그 뒤에 오는 모든 내용에 정책이 적용된다
html = html.replace(cspTag, '').replace(charsetTag, '');
html = html.replace(htmlOpenTag, `${htmlOpenTag}${charsetTag}${sealedTag}`);

const firstScript = html.indexOf('<script');
assert(firstScript === -1 || html.indexOf(sealedTag) < firstScript, 'CSP 가 첫 스크립트보다 앞에 있어야 한다');
assert(!/<[^>]+\son[a-z]+\s*=/i.test(html), '인라인 이벤트 핸들러(on...=) 가 있으면 안 된다');
assert(!/<[^>]+\sstyle\s*=/i.test(html), 'style 속성이 있으면 안 된다 (CSP 의 style-src 가 막는다)');
assert(!/<style\b/i.test(html), '<style> 태그가 있으면 안 된다 (CSP 의 style-src 가 막는다)');
// 다른 서버 주소는 눌러서 이동하는 링크(<a href>) 에만 있을 수 있다
for (const [tag] of html.matchAll(/<(?!a\b)[a-z][^>]*\b(?:src|href|action|data)="?(?:https?:)?\/\/[^>]*>/gi)) {
  assert.fail(`다른 서버에서 불러오는 것이 있다: ${tag}`);
}

writeFileSync(FILE, html);
console.log(`[seal-html] CSP: ${sealedPolicy}`);
