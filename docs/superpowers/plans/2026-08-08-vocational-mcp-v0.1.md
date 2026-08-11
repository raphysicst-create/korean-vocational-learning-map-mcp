# korean-vocational-learning-map-mcp v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 특성화고 전문교과(전공일반 216 + 전문공통 3과목) 성취기준·원문·주제를 계열별 분할 데이터 + 지연 로딩으로 제공하는 MCP 서버 v0.1.0을 완성한다.

**Architecture:** 중등판(korean-secondary-learning-map-mcp)의 계층 구조(data-store → 순수 함수 모듈 → server → cli)를 포크하되, data-store만 "core 즉시 로드 + 계열별 지연 로드"로 재설계한다. 파이프라인은 DECK6 고정 커밋의 `data/kr/high/*.json`에서 `courseCategory ∈ {major-general, specialized-common}`만 필터해 17계열 + 전문공통 폴더로 분할 산출하고, 별책23~39 PDF(2024-3호)에서 원문을 추출한다.

**Tech Stack:** Node ≥ 20.11, 순수 ESM `.mjs`, `@modelcontextprotocol/sdk` + `zod`(런타임 의존성 이 2종만), `node --test`, poppler `pdftotext`.

**승인된 스펙:** `docs/superpowers/specs/2026-08-08-vocational-mcp-design.md` — 이 계획과 어긋나면 스펙이 우선.

## Global Constraints

(스펙에서 전재. 모든 태스크에 암묵 적용된다.)

- 순수 ESM `.mjs`만. TypeScript·빌드 도구 금지. Node `>=20.11`.
- 런타임 의존성은 `@modelcontextprotocol/sdk` + `zod` **2종만**. devDependencies도 추가하지 않는다(테스트는 `node --test`).
- stdout은 MCP 프로토콜 전용 — 사람용 로그는 반드시 `console.error`.
- 도구 이름 영어 snake_case, 설명·에러 메시지는 전부 한국어.
- 검색: NFC 정규화 + 부분 문자열 일치만(형태소 분석기 금지). limit 기본 20, 최대 50. 결과 없으면 유사 후보 제안.
- 원문 수록 범위는 성취기준 본문 문장만 — 해설·적용 시 고려사항 금지.
- topic ID·cluster ID는 DECK6 원본 그대로(재채번 금지). curriculum ID는 `kr-2022-voc-<과목슬러그>`.
- 파이프라인 실행 순서 고정: `fetch → build → extract → verify`. `data/kr/**`는 커밋한다.
- PDF는 국가교육위원회 고시 제2024-3호(2024.8.16.)판만 사용. 저장소에 커밋 금지, `PDF_DIR`(기본: 저장소 부모 폴더)에서 찾는다.
- git 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 작업 디렉터리: `c:\Users\22\Desktop\Y-claude\korean-secondary-learning-map\korean-vocational-learning-map-mcp\` (git 저장소 초기화 완료, 스펙 커밋 2건 존재). 포크 원본은 형제 폴더 `..\korean-secondary-learning-map-mcp\` — **읽기만 하고 절대 수정하지 않는다.**

## File Structure

```
korean-vocational-learning-map-mcp/
├── src/
│   ├── cli.mjs               # stdio 진입점 (Task 9)
│   ├── server.mjs            # 도구 10종 (Task 9)
│   ├── data-store.mjs        # core 즉시 로드 + 계열 지연 로드 (Task 7)
│   ├── normalize.mjs         # NFC·로마숫자·공백 유연 코드 + parseVocationalCode (Task 2)
│   ├── search.mjs            # 검색·유사 후보 (Task 8)
│   ├── graph.mjs             # 선수관계 (Task 8)
│   └── roadmap.mjs           # 로드맵 (Task 8)
├── pipeline/
│   ├── fetch-sources.mjs     # DECK6 + PDF 확보·해시 검증 (Task 3)
│   ├── build-data.mjs        # 필터·계열 분할 산출 (Task 4)
│   ├── extract-texts.mjs     # PDF 원문 추출 (Task 5)
│   ├── verify.mjs            # 게이트·무결성·manifest (Task 6)
│   ├── sources.json          # 원본 대장 (Task 3)
│   ├── gates.json            # 계열별 성취기준 수 고정표 (Task 4에서 기록)
│   └── exceptions.json       # 추출 실패 수동 보정 (Task 5)
├── data/kr/
│   ├── core/{major-fields,curricula,dependencies,manifest}.json
│   └── fields/<slug>/{curriculum-standards,standard-texts,topics,clusters}.json
├── tests/*.test.mjs
└── package.json, server.json, README.md, LICENSE, NOTICE.md, CLAUDE.md, .gitignore
```

계열 슬러그 17종은 스펙의 확정 표를 따른다(business-finance … convergence-ip). 전문공통(specialized-common) 3과목은 의사(pseudo) 계열 슬러그 `specialized-common`에 배치한다.

---

### Task 1: 저장소 스캐폴드

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE`, `NOTICE.md`

**Interfaces:**
- Produces: npm 스크립트 `test`, `pipeline:fetch|build|extract|verify` — 이후 모든 태스크가 사용.

- [x] **Step 1: package.json 작성**

```json
{
  "name": "korean-vocational-learning-map-mcp",
  "version": "0.1.0",
  "mcpName": "io.github.raphysicst-create/korean-vocational-learning-map-mcp",
  "description": "한국 특성화고 전문교과 2022 개정 교육과정 학습 그래프 MCP 서버 (전공일반·전문공통 성취기준 원문 수록)",
  "type": "module",
  "license": "MIT",
  "homepage": "https://github.com/raphysicst-create/korean-vocational-learning-map-mcp#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/raphysicst-create/korean-vocational-learning-map-mcp.git"
  },
  "bin": {
    "korean-vocational-learning-map-mcp": "src/cli.mjs"
  },
  "files": ["src/", "data/", "README.md", "LICENSE", "NOTICE.md"],
  "engines": { "node": ">=20.11" },
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "pipeline:fetch": "node pipeline/fetch-sources.mjs",
    "pipeline:build": "node pipeline/build-data.mjs",
    "pipeline:extract": "node pipeline/extract-texts.mjs",
    "pipeline:verify": "node pipeline/verify.mjs"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0"
  }
}
```

- [x] **Step 2: .gitignore 작성**

```
node_modules/
.cache/
```

- [x] **Step 3: LICENSE 복사**

포크 원본 `..\korean-secondary-learning-map-mcp\LICENSE`(MIT)를 그대로 복사한다(저작권자 표기 동일 유지).

- [x] **Step 4: NOTICE.md 초안 작성**

```markdown
# NOTICE

## 데이터 원천

- **DECK6/korean-secondary-learning-map** (MIT License) — 성취기준·과목·영역·주제·클러스터 정규화 데이터.
  https://github.com/DECK6/korean-secondary-learning-map — 원 저작권 고지를 유지한다.
- **성취기준 공식 원문** — 국가교육위원회 고시 제2024-3호(2024.8.16.) 초·중등학교 교육과정
  별책23~39(전문교과) PDF에서 추출. 교육부·국가교육위원회 공표 공공저작물로서
  저작권법 제24조의2에 따라 출처를 표기해 이용한다. 출처: NCIC 국가교육과정정보센터(https://ncic.re.kr).

## 고지

- 이 패키지는 교육부·국가교육위원회·NCIC의 공식 산출물이 아니다.
- 세부 학습 주제(topics)의 설명·관찰 증거·평가 발문은 상류 저장소의 기계 파생물(candidate)이다.
```

- [x] **Step 5: npm install 후 커밋**

Run: `npm install` (lockfile 생성 확인) 후:

```bash
git add package.json package-lock.json .gitignore LICENSE NOTICE.md
git commit -m "chore: v0.1 스캐폴드 (패키지·라이선스·NOTICE)"
```

---

### Task 2: normalize.mjs — 코드 정규화 + 전문교과 코드 해석

**Files:**
- Create: `src/normalize.mjs`
- Test: `tests/normalize.test.mjs`

**Interfaces:**
- Produces: `normalizeRoman(value): string`, `normalizeCode(code): string`(괄호 안 공백 제거 → `[간기 01-01]`과 `[간기01-01]`이 같은 키), `normalizeText(value): string`, `parseVocationalCode(code): {abbrev, numbers, kind, ncs?} | null`.
- 이후 모든 src·pipeline 모듈이 사용.

- [x] **Step 1: 실패하는 테스트 작성** (`tests/normalize.test.mjs`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoman, normalizeCode, normalizeText, parseVocationalCode } from '../src/normalize.mjs';

test('normalizeCode는 괄호 안 공백을 제거해 같은 키를 만든다', () => {
  assert.equal(normalizeCode('[간기 01-01]'), '[간기01-01]');
  assert.equal(normalizeCode('간기 01-01'), '[간기01-01]');
  assert.equal(normalizeCode('[간기01-01]'), '[간기01-01]');
  assert.equal(normalizeCode('[3개 01-01-01]'), '[3개01-01-01]');
});

test('normalizeRoman은 전각 로마숫자를 ASCII로 바꾼다', () => {
  assert.equal(normalizeRoman('전자 회로Ⅱ'), '전자 회로II');
});

test('normalizeText는 NFC·소문자·공백 압축', () => {
  assert.equal(normalizeText('  전기·전자   기초 '), '전기·전자 기초');
});

test('parseVocationalCode: 2단 코드', () => {
  assert.deepEqual(parseVocationalCode('[간기 01-01]'), {
    abbrev: '간기', numbers: ['01', '01'], kind: 'two-level',
  });
});

test('parseVocationalCode: NCS 3단 코드 (숫자 시작 약칭 허용)', () => {
  assert.deepEqual(parseVocationalCode('[3개 01-02-03]'), {
    abbrev: '3개', numbers: ['01', '02', '03'], kind: 'three-level-ncs',
    ncs: { unit: '01', element: '02', criterion: '03' },
  });
});

test('parseVocationalCode: 보통교과·비정형 코드는 null', () => {
  assert.equal(parseVocationalCode('[9과01-01]'), null);
  assert.equal(parseVocationalCode('아무말'), null);
  assert.equal(parseVocationalCode(''), null);
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test tests/normalize.test.mjs`
Expected: FAIL — `Cannot find module '../src/normalize.mjs'`

- [x] **Step 3: 구현** (`src/normalize.mjs`)

포크 원본의 `normalizeRoman`/`normalizeCode`/`normalizeText`를 그대로 옮기고 `parseVocationalCode`를 추가한다. (원본 `normalizeCode`가 이미 `\s+` 전부 제거이므로 공백 유연 매칭은 무변경으로 충족된다.)

```js
const ROMAN = {
  'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV', 'Ⅴ': 'V', 'Ⅵ': 'VI',
  'Ⅶ': 'VII', 'Ⅷ': 'VIII', 'Ⅸ': 'IX', 'Ⅹ': 'X', 'Ⅺ': 'XI', 'Ⅻ': 'XII',
  'ⅰ': 'I', 'ⅱ': 'II', 'ⅲ': 'III', 'ⅳ': 'IV', 'ⅴ': 'V', 'ⅵ': 'VI',
  'ⅶ': 'VII', 'ⅷ': 'VIII', 'ⅸ': 'IX', 'ⅹ': 'X', 'ⅺ': 'XI', 'ⅻ': 'XII',
};

export function normalizeRoman(value) {
  return String(value ?? '').replace(/[Ⅰ-Ⅻⅰ-ⅻ]/g, (ch) => ROMAN[ch] ?? ch);
}

export function normalizeCode(code) {
  const compact = normalizeRoman(String(code ?? '').normalize('NFC')).replace(/\s+/g, '');
  if (!compact) return compact;
  return compact.startsWith('[') ? compact : `[${compact}]`;
}

export function normalizeText(value) {
  return normalizeRoman(String(value ?? '').normalize('NFC'))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// 전문교과 성취기준 코드 구조 해석.
// 2단 `[간기 01-01]`(약칭+공백+NN-NN), 3단 `[3개 01-01-01]`(NCS 능력단위-요소-준거; 형식은 카테고리와 1:1이 아님).
// 약칭은 숫자로 시작할 수 있다('3개' = 3D 프린터 개발). 공백 없는 보통교과 코드는 null.
export function parseVocationalCode(code) {
  const m = /^\[(\S+)\s+(\d{2})-(\d{2})(?:-(\d{2}))?\]$/.exec(
    String(code ?? '').normalize('NFC').trim()
  );
  if (!m) return null;
  const [, abbrev, a, b, c] = m;
  if (c === undefined) return { abbrev, numbers: [a, b], kind: 'two-level' };
  return {
    abbrev, numbers: [a, b, c], kind: 'three-level-ncs',
    ncs: { unit: a, element: b, criterion: c },
  };
}
```

- [x] **Step 4: 통과 확인**

Run: `node --test tests/normalize.test.mjs`
Expected: PASS (7 tests)

- [x] **Step 5: 커밋**

```bash
git add src/normalize.mjs tests/normalize.test.mjs
git commit -m "feat: 코드 정규화 + 전문교과 코드 구조 해석"
```

---

### Task 3: sources.json + fetch-sources.mjs — 원본 확보

**Files:**
- Create: `pipeline/sources.json`, `pipeline/fetch-sources.mjs`
- Test: `tests/fetch-sources.test.mjs`

**Interfaces:**
- Consumes: 없음 (독립).
- Produces: `.cache/deck6/high-*.json`·`shared-source-manifest.json`, `.cache/pdf-paths.json`(`{ annex23: "<절대경로>", … }`). 순수 함수 `cacheNameFor(path)`, `pdfPattern(annexNo): RegExp` export.

- [x] **Step 1: sources.json 작성**

DECK6 파일 해시는 포크 원본 `pipeline/sources.json`과 같은 커밋의 값이고, `shared/source-manifest.json`·`high/learning-relations.json` 해시도 동일 커밋 기준이다. PDF 17권의 URL·SHA-256은 sources.json에 **중복 기재하지 않고** 상류 `shared/source-manifest.json`(아래 files에 해시 고정)에서 실행 시 읽는다.

```json
{
  "deck6": {
    "repo": "DECK6/korean-secondary-learning-map",
    "commit": "68e62283cfc337e2de643a3cd1b0334e411acf54",
    "license": "MIT",
    "files": [
      { "path": "data/kr/high/subject-groups.json", "sha256": "331a4686d76fb0cbfdb2491e5bc5acf32da3e76a97d9423992218dc397c000e1" },
      { "path": "data/kr/high/courses.json", "sha256": "4e75c16607d8bfe47dbd488ce348fbf4439ef81dc8adb334bf4a20d8707f7dd2" },
      { "path": "data/kr/high/domains.json", "sha256": "5c64d280bcc9eb7c62c5359f2427ac7621a8e5953abf4d497e366851e4b09654" },
      { "path": "data/kr/high/standards.json", "sha256": "e1138674940c63d86c814b6a4a63b7e65876be9595d99bf11b7e5b5430c680df" },
      { "path": "data/kr/high/topics.json", "sha256": "efbb5fbc4b603525342c7e59f8acb1417f21b6e536ee15a0db6ee7a3a5835c74" },
      { "path": "data/kr/high/clusters.json", "sha256": "855d2c4237aa549dc72cd17cd0392938e729740608c148a95b3b379fbc1f37cc" },
      { "path": "data/kr/high/learning-relations.json", "sha256": "aa892e52e06004582f46833c2f6331f2ea6b5918ba06110c209aa563c4aa3257" },
      { "path": "data/kr/shared/source-manifest.json", "sha256": "61b4a8b5dfd7574e7a6836756174cc010fc2f9da336f96c5ae235c6291af79e0" }
    ]
  },
  "pdfAnnexes": { "from": 23, "to": 39 },
  "note": "PDF 17권(별책23~39)의 URL·SHA-256은 위에 해시 고정된 상류 shared/source-manifest.json의 kr-nec-2024-3-annex{N} 항목에서 읽는다. 국가교육위원회 고시 제2024-3호(2024.8.16.)판만 사용한다. PDF는 PDF_DIR 환경 변수(기본: 저장소 부모 폴더)에서 파일명 [별책N] 패턴으로 찾고, 없으면 URL에서 내려받는다. 저장소에 커밋하지 않는다."
}
```

- [x] **Step 2: 실패하는 테스트 작성** (`tests/fetch-sources.test.mjs`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheNameFor, pdfPattern, rawUrl } from '../pipeline/fetch-sources.mjs';

test('cacheNameFor는 경로 3번째 조각을 접두사로 쓴다', () => {
  assert.equal(cacheNameFor('data/kr/high/standards.json'), 'high-standards.json');
  assert.equal(cacheNameFor('data/kr/shared/source-manifest.json'), 'shared-source-manifest.json');
});

test('pdfPattern은 별책 번호를 공백·정확 일치로 잡는다', () => {
  assert.ok(pdfPattern(23).test('(2022개정)초·중등학교교육과정[별책23]경영·금융전문교과.pdf'));
  assert.ok(pdfPattern(27).test('(2022개정)초·중등학교 교육과정[별책27] 관광·레저 전문 교과.pdf'));
  assert.ok(!pdfPattern(3).test('[별책39]융복합.pdf'));
  assert.ok(!pdfPattern(23).test('[별책2]초등학교.pdf'));
});

test('rawUrl은 고정 커밋 raw URL을 만든다', () => {
  assert.equal(
    rawUrl('abc123', 'data/kr/high/courses.json'),
    'https://raw.githubusercontent.com/DECK6/korean-secondary-learning-map/abc123/data/kr/high/courses.json'
  );
});
```

- [x] **Step 3: 실패 확인**

Run: `node --test tests/fetch-sources.test.mjs`
Expected: FAIL — 모듈 없음

- [x] **Step 4: 구현** (`pipeline/fetch-sources.mjs`)

포크 원본을 기반으로 PDF 부분만 교체한다:

```js
#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const cacheDir = join(repoRoot, '.cache', 'deck6');
const sourcesPath = join(here, 'sources.json');

export function rawUrl(commit, path) {
  return `https://raw.githubusercontent.com/DECK6/korean-secondary-learning-map/${commit}/${path}`;
}

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function cacheNameFor(path) {
  // data/kr/high/standards.json → high-standards.json
  const parts = path.split('/');
  return `${parts[2]}-${basename(path)}`;
}

// [별책23] · [별책 23] · [ 별책23 ] 을 잡되 [별책2]·[별책230]은 잡지 않는다.
export function pdfPattern(annexNo) {
  return new RegExp(`\\[\\s*별\\s*책\\s*${annexNo}\\s*\\]`);
}

async function fetchDeck6Files(sources) {
  let failures = 0;
  mkdirSync(cacheDir, { recursive: true });
  for (const file of sources.deck6.files) {
    const dest = join(cacheDir, cacheNameFor(file.path));
    let body;
    if (existsSync(dest)) {
      body = readFileSync(dest);
    } else {
      const res = await fetch(rawUrl(sources.deck6.commit, file.path));
      if (!res.ok) { console.error(`✗ 다운로드 실패 ${file.path}: HTTP ${res.status}`); failures += 1; continue; }
      body = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest, body);
    }
    const hash = sha256Hex(body);
    if (file.sha256 !== hash) { console.error(`✗ 해시 불일치 ${file.path}\n  대장: ${file.sha256}\n  실제: ${hash}`); failures += 1; }
    else console.error(`✓ ${file.path}`);
  }
  return failures;
}

async function resolvePdfs(sources) {
  // PDF의 URL·SHA-256의 단일 진실 원천은 상류 shared/source-manifest.json이다 (해시는 위에서 검증됨).
  const manifest = JSON.parse(
    readFileSync(join(cacheDir, 'shared-source-manifest.json'), 'utf8')
  );
  const entries = manifest.sources ?? manifest;
  const pdfDir = resolve(repoRoot, process.env.PDF_DIR ?? '..');
  const pdfPaths = {};
  let failures = 0;
  for (let n = sources.pdfAnnexes.from; n <= sources.pdfAnnexes.to; n += 1) {
    const entry = entries.find((e) => e.id === `kr-nec-2024-3-annex${n}`);
    if (!entry) { console.error(`✗ 상류 매니페스트에 annex${n} 항목이 없습니다.`); failures += 1; continue; }
    const re = pdfPattern(n);
    let name = readdirSync(pdfDir).find((f) => f.toLowerCase().endsWith('.pdf') && re.test(f));
    if (!name) {
      console.error(`… annex${n} 로컬 PDF 없음 — NCIC에서 다운로드 시도`);
      const res = await fetch(entry.url);
      if (!res.ok) {
        console.error(`✗ annex${n} 다운로드 실패(HTTP ${res.status}) — ${entry.url} 을 브라우저로 받아 PDF_DIR에 두세요.`);
        failures += 1; continue;
      }
      name = `[별책${n}] 전문교과 교육과정(2024-3호).pdf`;
      writeFileSync(join(pdfDir, name), Buffer.from(await res.arrayBuffer()));
    }
    const p = join(pdfDir, name);
    const hash = sha256Hex(readFileSync(p));
    if (hash !== entry.sha256) {
      console.error(`✗ annex${n} 해시 불일치 — 구판(2022-33호) 가능성. 2024-3호 개정판으로 교체하세요.\n  파일: ${name}\n  대장: ${entry.sha256}\n  실제: ${hash}`);
      failures += 1; continue;
    }
    console.error(`✓ [별책${n}] ${name}`);
    pdfPaths[`annex${n}`] = p;
  }
  writeFileSync(join(repoRoot, '.cache', 'pdf-paths.json'), JSON.stringify(pdfPaths, null, 1));
  return failures;
}

async function main() {
  const sources = JSON.parse(readFileSync(sourcesPath, 'utf8'));
  const failures = (await fetchDeck6Files(sources)) + (await resolvePdfs(sources));
  if (failures) { console.error(`✗ 실패 ${failures}건`); process.exit(1); }
  console.error('✓ 원본 전체 확보·검증 완료');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
```

- [x] **Step 5: 테스트 통과 확인**

Run: `node --test tests/fetch-sources.test.mjs`
Expected: PASS

- [x] **Step 6: 실제 실행 — 원본 확보**

Run: `npm run pipeline:fetch`
Expected: DECK6 8파일(standards 54MB·topics 80MB 포함, 최초 1회 수 분) + PDF 17권 전부 `✓`, 종료 코드 0. PDF 17권은 이미 `PDF_DIR`(저장소 부모 폴더)에 2024-3호판으로 존재하며 SHA-256 일치가 사전 확인되어 있다 — `✗`가 나오면 데이터가 아니라 코드를 의심할 것.

- [x] **Step 7: 커밋**

```bash
git add pipeline/sources.json pipeline/fetch-sources.mjs tests/fetch-sources.test.mjs
git commit -m "feat: DECK6·별책23~39 원본 확보 파이프라인 (판본 해시 검증)"
```

---

### Task 4: build-data.mjs — 필터·계열 분할 산출 + gates 기록

**Files:**
- Create: `pipeline/build-data.mjs`, `pipeline/gates.json`(실행 산출)
- Test: `tests/build-data.test.mjs`

**Interfaces:**
- Consumes: `.cache/deck6/high-*.json` (Task 3).
- Produces:
  - `data/kr/core/major-fields.json` — `{ majorFields: [{ slug, labelKorean, annexId, courseCount: {카테고리별}, standardCount: {카테고리별}, includedCategories }] }`
  - `data/kr/core/curricula.json` — `{ curricula: [{ id, subjectKorean, majorFieldSlug, courseCategory, gradeBand, standardCount, included, deck6CourseId }] }` (전문교과 528과목 전부, 미수록은 `included: false`)
  - `data/kr/core/dependencies.json` — `{ dependencies: [{ topicId, prerequisiteId, strength, relationKind, scope, reason, basis }] }`
  - `data/kr/fields/<slug>/curriculum-standards.json` — `{ curricula: [수록 과목 전체 레코드] }`, standard 레코드: `{ key, code, gradeBand, subjectKorean, majorFieldSlug, courseCategory, domainKorean, summary, summaryKind, sourceRefs, sourceLocator, deck6Id }`
  - `data/kr/fields/<slug>/topics.json` — `{ topics: [{ id, titleKorean, subjectKorean, majorFieldSlug, gradeBand, domainKorean, facetKey, types, description, evidence, assessmentPrompts, standards, sourceRefs }] }`
  - `data/kr/fields/<slug>/clusters.json` — `{ clusters: [{ id, titleKorean, subjectKorean, majorFieldSlug, gradeBand, domainKorean, summary, topicCount, topics }] }`
  - `pipeline/gates.json` (`--record-gates` 시) — `{ release, includedCategories, totals: { courses, standards }, fields: { <slug>: { courses, standards } } }`
  - export: `VOCATIONAL_CATEGORIES`, `RELEASE_SCOPE`, `FIELD_SLUGS`, `resolveFieldSlug(groupLabel)`, `slugifyCourse(labelKorean)`, `buildVocational(raw)`

- [x] **Step 1: 실패하는 테스트 작성** (`tests/build-data.test.mjs`) — 합성 픽스처로 순수 함수 검증 (`.cache` 불필요, CI 가능)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RELEASE_SCOPE, resolveFieldSlug, slugifyCourse, buildVocational,
} from '../pipeline/build-data.mjs';

test('resolveFieldSlug는 계열명을 슬러그로 푼다 (공백·"계열" 수식 허용)', () => {
  assert.equal(resolveFieldSlug('경영·금융'), 'business-finance');
  assert.equal(resolveFieldSlug('전기·전자'), 'electrical-electronics');
  assert.equal(resolveFieldSlug('전기 · 전자 계열'), 'electrical-electronics');
  assert.throws(() => resolveFieldSlug('없는 계열'), /매핑되지 않은 계열/);
});

test('slugifyCourse는 kr-2022-voc- 접두 슬러그를 만든다', () => {
  assert.equal(slugifyCourse('간호의 기초'), 'kr-2022-voc-간호의-기초');
  assert.equal(slugifyCourse('전자 회로Ⅱ'), 'kr-2022-voc-전자-회로II');
});

function syntheticRaw() {
  return {
    subjectGroups: [
      { id: 'g-elec', labelKorean: '전기·전자' },
      { id: 'g-common', labelKorean: '보통 교과군' },
    ],
    courses: [
      { id: 'c1', labelKorean: '전기 기초', subjectGroupId: 'g-elec',
        courseCategory: 'major-general', sourceRefs: ['kr-nec-2024-3-annex34'] },
      { id: 'c2', labelKorean: '3D 프린터 개발', subjectGroupId: 'g-elec',
        courseCategory: 'major-practical', sourceRefs: ['kr-nec-2024-3-annex34'] },
      { id: 'c3', labelKorean: '성공적인 직업생활', subjectGroupId: 'g-elec',
        courseCategory: 'specialized-common', sourceRefs: ['kr-nec-2024-3-annex23'] },
      { id: 'c4', labelKorean: '물리학', subjectGroupId: 'g-common',
        courseCategory: 'general-elective', sourceRefs: [] },
    ],
    domains: [{ id: 'd1', labelKorean: '전기 회로' }],
    standards: [
      { id: 's1', courseId: 'c1', code: '[전기 01-01]', domainId: 'd1',
        summary: '요약1', summaryKind: 'mechanical', sourceRefs: [], sourceLocator: null },
      { id: 's2', courseId: 'c2', code: '[3개 01-01-01]', domainId: 'd1',
        summary: '요약2', summaryKind: 'mechanical', sourceRefs: [], sourceLocator: null },
      { id: 's3', courseId: 'c3', code: '[직생 01-01]', domainId: 'd1',
        summary: '요약3', summaryKind: 'mechanical', sourceRefs: [], sourceLocator: null },
      { id: 's4', courseId: 'c4', code: '[12물리01-01]', domainId: 'd1',
        summary: '요약4', summaryKind: 'mechanical', sourceRefs: [], sourceLocator: null },
    ],
    topics: [
      { id: 't1', labelKorean: '주제1', courseIds: ['c1'], domainId: 'd1', facetKey: 'f',
        types: [], description: '', evidence: [], assessmentPrompts: [],
        standardAlignments: [{ standardId: 's1' }], sourceRefs: [] },
      { id: 't2', labelKorean: '주제2(전공실무)', courseIds: ['c2'], domainId: 'd1', facetKey: 'f',
        types: [], description: '', evidence: [], assessmentPrompts: [],
        standardAlignments: [{ standardId: 's2' }], sourceRefs: [] },
    ],
    clusters: [
      { id: 'cl1', labelKorean: '묶음1', courseId: 'c1', domainId: 'd1',
        summary: '', topicIds: ['t1'] },
    ],
    learningRelations: [
      { dependentTopicId: 't1', prerequisiteTopicId: 't1', strength: 'required',
        relationKind: 'k', scope: 's', reason: 'r', basis: 'b' },
      { dependentTopicId: 't2', prerequisiteTopicId: 't1', strength: 'recommended',
        relationKind: 'k', scope: 's', reason: 'r', basis: 'b' },
    ],
  };
}

test('buildVocational: 수록 범위 필터·계열 분할·색인·의존 필터', () => {
  const out = buildVocational(syntheticRaw());
  // 보통교과(c4)는 색인에도 없다. 전문교과 3과목은 전부 색인에 있다.
  assert.deepEqual(out.curriculaIndex.map((c) => c.deck6CourseId).sort(), ['c1', 'c2', 'c3']);
  // v0.1 수록: major-general·specialized-common만 included.
  const included = Object.fromEntries(out.curriculaIndex.map((c) => [c.deck6CourseId, c.included]));
  assert.deepEqual(included, { c1: true, c2: false, c3: true });
  // 계열 파일: 전기·전자에 c1만 (c2는 미수록), specialized-common 의사 계열에 c3.
  assert.deepEqual([...out.fields.keys()].sort(), ['electrical-electronics', 'specialized-common']);
  assert.deepEqual(out.fields.get('electrical-electronics').curricula.map((c) => c.deck6CourseId), ['c1']);
  assert.deepEqual(out.fields.get('specialized-common').curricula.map((c) => c.deck6CourseId), ['c3']);
  // standard 레코드에 majorFieldSlug·courseCategory가 붙는다.
  const s = out.fields.get('electrical-electronics').curricula[0].standards[0];
  assert.equal(s.majorFieldSlug, 'electrical-electronics');
  assert.equal(s.courseCategory, 'major-general');
  assert.equal(s.key, `${out.fields.get('electrical-electronics').curricula[0].id}:[전기 01-01]`);
  assert.equal(s.gradeBand, '10-12');
  // 주제: 수록 과목 연결분만 (t2는 c2 전용이라 제외).
  assert.deepEqual(out.fields.get('electrical-electronics').topics.map((t) => t.id), ['t1']);
  // 선수관계: 양끝이 수록 주제인 것만 (t2 관련 엣지 드롭).
  assert.equal(out.dependencies.length, 1);
  assert.equal(out.dependencies[0].strength, 'hard');
  // major-fields: 카테고리별 수치 (미수록 포함 전체 집계).
  const elec = out.majorFields.find((f) => f.slug === 'electrical-electronics');
  assert.equal(elec.courseCount['major-general'], 1);
  assert.equal(elec.courseCount['major-practical'], 1);
  assert.equal(elec.standardCount['major-practical'], 1);
  assert.deepEqual(elec.includedCategories, [...RELEASE_SCOPE]);
  assert.equal(elec.annexId, 'kr-nec-2024-3-annex34');
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test tests/build-data.test.mjs`
Expected: FAIL — 모듈 없음

- [x] **Step 3: 구현** (`pipeline/build-data.mjs`)

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRoman, normalizeText } from '../src/normalize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const cacheDir = join(repoRoot, '.cache', 'deck6');
const outDir = join(repoRoot, 'data', 'kr');

export const VOCATIONAL_CATEGORIES = new Set(['major-general', 'major-practical', 'specialized-common']);
// v0.1 수록 범위. 전공실무 계열 추가 시 이 Set과 gates.json을 함께 갱신한다.
export const RELEASE_SCOPE = new Set(['major-general', 'specialized-common']);
export const EXPECTED_INCLUDED_COURSES = 219; // 전공일반 216 + 전문공통 3 (2026-08-08 상류 실측)

// 스펙 확정 표 (별책 23~39 순).
export const FIELD_SLUGS = new Map([
  ['경영·금융', 'business-finance'],
  ['보건·복지', 'health-welfare'],
  ['문화·예술·디자인·방송', 'culture-arts-design-broadcast'],
  ['미용', 'beauty'],
  ['관광·레저', 'tourism-leisure'],
  ['식품·조리', 'food-cooking'],
  ['건축·토목', 'construction-civil'],
  ['기계', 'machinery'],
  ['재료', 'materials'],
  ['화학공업', 'chemical-industry'],
  ['섬유·의류', 'textile-clothing'],
  ['전기·전자', 'electrical-electronics'],
  ['정보·통신', 'information-communication'],
  ['환경·안전·소방', 'environment-safety-fire'],
  ['농림·축산', 'agriculture-livestock'],
  ['수산·해운', 'fisheries-shipping'],
  ['융복합·지식재산', 'convergence-ip'],
]);
export const SPECIALIZED_COMMON_SLUG = 'specialized-common';

export function resolveFieldSlug(groupLabel) {
  const squash = (v) => normalizeText(v).replace(/\s+/g, '').replace(/(교과\(군\)|교과군|계열)$/, '');
  const target = squash(groupLabel);
  for (const [label, slug] of FIELD_SLUGS) {
    if (squash(label) === target) return slug;
  }
  throw new Error(`매핑되지 않은 계열: "${groupLabel}" — pipeline/build-data.mjs의 FIELD_SLUGS를 확인하세요.`);
}

export function slugifyCourse(labelKorean) {
  const label = normalizeRoman(String(labelKorean).normalize('NFC'))
    .replace(/[\s·/(),]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `kr-2022-voc-${label}`;
}

export function buildVocational(raw) {
  const groupLabel = new Map(raw.subjectGroups.map((g) => [g.id, g.labelKorean]));
  const domainLabel = new Map(raw.domains.map((d) => [d.id, d.labelKorean]));

  const vocCourses = raw.courses.filter((c) => VOCATIONAL_CATEGORIES.has(c.courseCategory));
  const fieldOf = (course) =>
    course.courseCategory === 'specialized-common'
      ? SPECIALIZED_COMMON_SLUG
      : resolveFieldSlug(groupLabel.get(course.subjectGroupId));

  const standardsByCourse = new Map();
  for (const s of raw.standards) {
    if (!standardsByCourse.has(s.courseId)) standardsByCourse.set(s.courseId, []);
    standardsByCourse.get(s.courseId).push(s);
  }

  // 색인(528과목 전부) + 수록 과목 전체 레코드.
  const curriculaIndex = [];
  const keyByDeck6StandardId = new Map();
  const includedCourseIds = new Map(); // deck6CourseId → { slug, record }
  const fields = new Map(); // slug → { curricula, topics, clusters }
  const ensureField = (slug) => {
    if (!fields.has(slug)) fields.set(slug, { curricula: [], topics: [], clusters: [] });
    return fields.get(slug);
  };

  for (const course of vocCourses) {
    const slug = fieldOf(course);
    const own = standardsByCourse.get(course.id) ?? [];
    const included = RELEASE_SCOPE.has(course.courseCategory);
    const id = slugifyCourse(course.labelKorean);
    curriculaIndex.push({
      id, subjectKorean: course.labelKorean, majorFieldSlug: slug,
      courseCategory: course.courseCategory, gradeBand: '10-12',
      standardCount: own.length, included, deck6CourseId: course.id,
    });
    if (!included) continue;
    const standards = own.map((s) => {
      const key = `${id}:${s.code}`;
      keyByDeck6StandardId.set(s.id, key);
      return {
        key, code: s.code, gradeBand: '10-12',
        subjectKorean: course.labelKorean, majorFieldSlug: slug,
        courseCategory: course.courseCategory,
        domainKorean: domainLabel.get(s.domainId) ?? null,
        summary: s.summary, summaryKind: s.summaryKind,
        sourceRefs: s.sourceRefs, sourceLocator: s.sourceLocator ?? null,
        deck6Id: s.id,
      };
    });
    if (standards.length === 0) continue;
    const record = {
      id, subjectKorean: course.labelKorean, majorFieldSlug: slug,
      subjectGroupKorean: groupLabel.get(course.subjectGroupId) ?? null,
      courseCategory: course.courseCategory, gradeBand: '10-12',
      name: `${course.labelKorean} 2022 개정 전문교과 교육과정`,
      deck6CourseId: course.id, sourceRefs: course.sourceRefs ?? [],
      standardCount: standards.length, standards,
    };
    ensureField(slug).curricula.push(record);
    includedCourseIds.set(course.id, { slug, record });
  }

  // 주제: 수록 과목에 연결된 것만, 첫 수록 과목 기준으로 계열 배정.
  const includedTopicIds = new Set();
  for (const t of raw.topics) {
    const hit = (t.courseIds ?? []).find((cid) => includedCourseIds.has(cid));
    if (!hit) continue;
    const { slug, record } = includedCourseIds.get(hit);
    includedTopicIds.add(t.id);
    ensureField(slug).topics.push({
      id: t.id, titleKorean: t.labelKorean,
      subjectKorean: record.subjectKorean, majorFieldSlug: slug, gradeBand: '10-12',
      domainKorean: domainLabel.get(t.domainId) ?? null,
      facetKey: t.facetKey ?? null, types: t.types ?? [],
      description: t.description, evidence: t.evidence ?? [],
      assessmentPrompts: t.assessmentPrompts ?? [],
      standards: (t.standardAlignments ?? [])
        .map((a) => keyByDeck6StandardId.get(a.standardId))
        .filter(Boolean),
      sourceRefs: t.sourceRefs ?? [],
    });
  }

  // 클러스터: 수록 과목의 것만.
  for (const c of raw.clusters) {
    if (!includedCourseIds.has(c.courseId)) continue;
    const { slug, record } = includedCourseIds.get(c.courseId);
    ensureField(slug).clusters.push({
      id: c.id, titleKorean: c.labelKorean,
      subjectKorean: record.subjectKorean, majorFieldSlug: slug, gradeBand: '10-12',
      domainKorean: domainLabel.get(c.domainId) ?? null,
      summary: c.summary, topicCount: (c.topicIds ?? []).length, topics: c.topicIds ?? [],
    });
  }

  // 선수관계: 양끝이 수록 주제인 것만 core에 통합 보관 (희소·계열 교차 허용).
  const dependencies = [];
  let droppedDeps = 0;
  for (const r of raw.learningRelations ?? []) {
    if (!includedTopicIds.has(r.dependentTopicId) || !includedTopicIds.has(r.prerequisiteTopicId)) {
      droppedDeps += 1; continue;
    }
    dependencies.push({
      topicId: r.dependentTopicId, prerequisiteId: r.prerequisiteTopicId,
      strength: r.strength === 'required' ? 'hard' : 'soft',
      relationKind: r.relationKind, scope: r.scope, reason: r.reason, basis: r.basis,
    });
  }

  // 계열 개요: 미수록 카테고리 포함 전체 집계.
  const fieldMeta = new Map(); // slug → { labelKorean, annexCount: Map, courseCount, standardCount }
  for (const course of vocCourses) {
    const slug = fieldOf(course);
    if (!fieldMeta.has(slug)) {
      fieldMeta.set(slug, {
        labelKorean: slug === SPECIALIZED_COMMON_SLUG ? '전문공통' : groupLabel.get(course.subjectGroupId),
        annexCount: new Map(), courseCount: {}, standardCount: {},
      });
    }
    const meta = fieldMeta.get(slug);
    const cat = course.courseCategory;
    meta.courseCount[cat] = (meta.courseCount[cat] ?? 0) + 1;
    meta.standardCount[cat] = (meta.standardCount[cat] ?? 0) + (standardsByCourse.get(course.id)?.length ?? 0);
    for (const ref of course.sourceRefs ?? []) {
      meta.annexCount.set(ref, (meta.annexCount.get(ref) ?? 0) + 1);
    }
  }
  const majorFields = [...fieldMeta.entries()].map(([slug, meta]) => ({
    slug, labelKorean: meta.labelKorean,
    annexId: [...meta.annexCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    courseCount: meta.courseCount, standardCount: meta.standardCount,
    includedCategories: [...RELEASE_SCOPE],
  })).sort((a, b) => a.slug.localeCompare(b.slug, 'en'));

  return { majorFields, curriculaIndex, fields, dependencies, droppedDeps };
}

function readCache(name) {
  return JSON.parse(readFileSync(join(cacheDir, name), 'utf8')).records;
}

function main() {
  const raw = {
    subjectGroups: readCache('high-subject-groups.json'),
    courses: readCache('high-courses.json'),
    domains: readCache('high-domains.json'),
    standards: readCache('high-standards.json'),
    topics: readCache('high-topics.json'),
    clusters: readCache('high-clusters.json'),
    learningRelations: readCache('high-learning-relations.json'),
  };
  const out = buildVocational(raw);

  const includedCourses = out.curriculaIndex.filter((c) => c.included);
  if (includedCourses.length !== EXPECTED_INCLUDED_COURSES) {
    throw new Error(`수록 과목 수 불일치: ${includedCourses.length} ≠ ${EXPECTED_INCLUDED_COURSES}`);
  }

  const write = (rel, payload) => {
    const p = join(outDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `${JSON.stringify(payload, null, 1)}\n`);
  };
  write('core/major-fields.json', { majorFields: out.majorFields });
  write('core/curricula.json', { curricula: out.curriculaIndex });
  write('core/dependencies.json', { dependencies: out.dependencies });
  const fieldCounts = {};
  for (const [slug, data] of [...out.fields.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en'))) {
    write(`fields/${slug}/curriculum-standards.json`, { curricula: data.curricula });
    write(`fields/${slug}/topics.json`, { topics: data.topics });
    write(`fields/${slug}/clusters.json`, { clusters: data.clusters });
    fieldCounts[slug] = {
      courses: data.curricula.length,
      standards: data.curricula.reduce((n, c) => n + c.standardCount, 0),
    };
  }

  const totals = {
    courses: includedCourses.length,
    standards: Object.values(fieldCounts).reduce((n, f) => n + f.standards, 0),
  };
  if (process.argv.includes('--record-gates')) {
    writeFileSync(join(here, 'gates.json'), `${JSON.stringify({
      release: 'v0.1.0',
      includedCategories: [...RELEASE_SCOPE],
      totals, fields: fieldCounts,
    }, null, 2)}\n`);
    console.error('✓ gates.json 기록 — 수치를 직접 확인한 뒤 커밋할 것');
  }
  console.error(`✓ 수록 과목 ${totals.courses} · 성취기준 ${totals.standards} · 계열 ${Object.keys(fieldCounts).length}`);
  console.error(`✓ 선수관계 ${out.dependencies.length} (드롭 ${out.droppedDeps})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [x] **Step 4: 테스트 통과 확인**

Run: `node --test tests/build-data.test.mjs`
Expected: PASS

- [x] **Step 5: 실제 빌드 + gates 기록**

Run: `node pipeline/build-data.mjs --record-gates`
Expected: 수록 과목 219 게이트 통과, `data/kr/core/*` + `data/kr/fields/<slug>/*`(18폴더: 17계열 + specialized-common — 단, 전공일반이 0과목인 계열이 있으면 그 계열 폴더가 없을 수 있다. 그 경우 실제 폴더 수를 기록하고 다음 단계에서 그대로 검증 기준으로 쓴다) 생성, `pipeline/gates.json` 기록.
만약 `매핑되지 않은 계열` 오류가 나면: 오류 메시지의 실제 계열 라벨을 보고 `FIELD_SLUGS`의 **키만**(슬러그는 스펙 고정) 실제 라벨에 맞게 수정한다.

- [x] **Step 6: gates.json 수치 육안 확인**

`pipeline/gates.json`을 열어 totals.courses=219, 각 계열 standards 합=totals.standards인지 확인하고, totals.standards 값을 커밋 메시지에 기록한다.

- [x] **Step 7: 커밋** (데이터는 Task 6 verify 통과 후에 커밋하므로 여기서는 코드·게이트만)

```bash
git add pipeline/build-data.mjs pipeline/gates.json tests/build-data.test.mjs
git commit -m "feat: 전문교과 필터·계열 분할 빌드 (수록 219과목, 성취기준 <실측값>건)"
```

---

### Task 5: extract-texts.mjs — PDF 원문 추출 (공백 유연 매칭)

**Files:**
- Create: `pipeline/extract-texts.mjs`, `pipeline/exceptions.json`
- Test: `tests/extract-texts.test.mjs`

**Interfaces:**
- Consumes: `data/kr/fields/<slug>/curriculum-standards.json` (Task 4), `.cache/pdf-paths.json` (Task 3).
- Produces: `data/kr/fields/<slug>/standard-texts.json` — `{ version, sourceNote, texts: [{ key, code, text, sourceId, locator }] }`. export: `normalizeWhitespace`, `stripPageFurniture`, `codePattern(code)`, `findCodePositions(norm, codes)`, `sliceStandardText`, `extractTexts(pdfText, expectedCodes)`, `summarySimilarity`, `pickVariant`.

- [x] **Step 1: 실패하는 테스트 작성** (`tests/extract-texts.test.mjs`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  codePattern, findCodePositions, extractTexts, stripPageFurniture, pickVariant,
} from '../pipeline/extract-texts.mjs';

test('codePattern은 코드 내 공백을 유연하게 잡는다', () => {
  assert.ok(codePattern('[간기 01-01]').test('[간기 01-01]'));
  assert.ok(codePattern('[간기 01-01]').test('[간기01-01]'));   // PDF가 공백을 잃은 경우
  assert.ok(codePattern('[간기 01-01]').test('[간기  01-01]'));  // 이중 공백
  assert.ok(codePattern('[간기 01-01]').test('[간기\n01-01]'));  // 줄바꿈 분단
  assert.ok(!codePattern('[간기 01-01]').test('[간기 01-02]'));
});

test('findCodePositions는 공백 변형 출현도 위치로 잡는다', () => {
  const text = '앞말\n[전기 01-01] 본문A입니다.\n[전기01-02] 본문B입니다.\n';
  const positions = findCodePositions(text, ['[전기 01-01]', '[전기 01-02]']);
  assert.equal(positions.length, 2);
  assert.equal(positions[0].code, '[전기 01-01]');
  assert.equal(positions[1].code, '[전기 01-02]');
  assert.ok(positions[0].listItem);
});

test('extractTexts: 코드 사이 본문 절취 + 해설 절 컷', () => {
  const pdf = [
    '[전기 01-01] 직류 회로의 전압·전류·저항 관계를 설명한다.',
    '(가) 성취기준 해설',
    '이 해설은 잘려야 한다.',
    '[전기 01-02] 회로 소자를 구분한다.',
  ].join('\n');
  const { texts, failures } = extractTexts(pdf, ['[전기 01-01]', '[전기 01-02]']);
  assert.equal(failures.length, 0);
  assert.equal(texts.get('[전기 01-01]'), '직류 회로의 전압·전류·저항 관계를 설명한다.');
  assert.equal(texts.get('[전기 01-02]'), '회로 소자를 구분한다.');
});

test('extractTexts: 코드 미발견은 failures로 보고한다', () => {
  const { texts, failures } = extractTexts('무관한 텍스트', ['[간기 01-01]']);
  assert.equal(texts.size, 0);
  assert.deepEqual(failures, [{ code: '[간기 01-01]', reason: 'code-not-found' }]);
});

test('stripPageFurniture는 반복 머리글·쪽 번호를 제거한다', () => {
  const page = (body) => `전문교과 교육과정\n${body}\n123`;
  const raw = [page('본문1'), page('본문2'), page('본문3')].join('\f');
  const cleaned = stripPageFurniture(raw);
  assert.ok(!cleaned.includes('전문교과 교육과정'));
  assert.ok(!/(^|\n)123(\n|$)/.test(cleaned));
});

test('pickVariant는 요약문과 가장 맞는 본문을 고른다', () => {
  const picked = pickVariant(['간호 과정을 설명한다.', '전기 회로를 구성한다.'], '전기 회로를 구성');
  assert.equal(picked.index, 1);
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test tests/extract-texts.test.mjs`
Expected: FAIL — 모듈 없음

- [x] **Step 3: 구현** (`pipeline/extract-texts.mjs`)

포크 원본 `..\korean-secondary-learning-map-mcp\pipeline\extract-texts.mjs`의 상수·헬퍼(`SECTION_CUT_PATTERNS`, `MAX_TEXT=700`, `FALLBACK_WINDOW`, `PAGE_NUMBER_LINE`, `RUNNING_HEAD_MIN_REPEAT`, `UNMAPPED_GLYPH`, `normalizeWhitespace`, `stripPageFurniture`, `isListItem`, `sliceStandardText`, `summarySimilarity`, `pickVariant`, `pdftotext`)를 그대로 옮긴 뒤, 다음 두 가지만 바꾼다.

**(a) 문자열 indexOf → 공백 유연 정규식 매칭:**

```js
// 코드 내 공백을 \s* 로 바꾼 정규식. 전문교과 코드([간기 01-01])는 PDF 조판에서
// 공백이 사라지거나 줄바꿈으로 갈라질 수 있다.
export function codePattern(code) {
  const escaped = normalizeRoman(String(code).normalize('NFC'))
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/(\\\s|\s)+/g, '\\s*');
  return new RegExp(escaped, 'g');
}

export function findCodePositions(pdfTextNorm, codes) {
  const positions = [];
  for (const code of codes) {
    const re = codePattern(code);
    let m;
    while ((m = re.exec(pdfTextNorm)) !== null) {
      positions.push({
        code, start: m.index, end: m.index + m[0].length,
        listItem: isListItem(pdfTextNorm, m.index),
      });
      re.lastIndex = m.index + 1;
    }
  }
  positions.sort((a, b) => a.start - b.start);
  return positions;
}
```

`extractTexts(pdfText, expectedCodes)`의 나머지 로직(목록 항목 우선, variants, MAX_TEXT·PUA 검사)은 원본 그대로 유지한다.

**(b) main(): 별책 단위 job → 계열 파일 출력.** 성취기준의 소속 별책은 과목 레코드의 `sourceRefs[0]`(`kr-nec-2024-3-annex34` 형식)에서 얻는다. 파일 상단 import에 `readdirSync`를 추가한다: `import { readdirSync, readFileSync, writeFileSync } from 'node:fs';`

```js
function main() {
  const fieldsDir = join(repoRoot, 'data', 'kr', 'fields');
  const exceptions = JSON.parse(readFileSync(join(here, 'exceptions.json'), 'utf8'));
  const pdfPaths = JSON.parse(readFileSync(join(repoRoot, '.cache', 'pdf-paths.json'), 'utf8'));

  // 계열 폴더 순회 → (별책, 계열)별로 성취기준을 모은다.
  const slugs = readdirSync(fieldsDir);
  const byAnnex = new Map(); // annexId → [{ key, code, summary, slug }]
  for (const slug of slugs) {
    const { curricula } = JSON.parse(
      readFileSync(join(fieldsDir, slug, 'curriculum-standards.json'), 'utf8')
    );
    for (const cur of curricula) {
      const annexRef = (cur.sourceRefs ?? [])[0];
      if (!annexRef) throw new Error(`과목 ${cur.id}에 sourceRefs가 없어 별책을 정할 수 없습니다.`);
      const annexId = annexRef.replace('kr-nec-2024-3-', ''); // → annex34
      if (!byAnnex.has(annexId)) byAnnex.set(annexId, []);
      for (const s of cur.standards) {
        byAnnex.get(annexId).push({ key: s.key, code: s.code, summary: s.summary ?? '', slug });
      }
    }
  }

  const bySlug = new Map(slugs.map((s) => [s, []]));
  const allFailures = [];
  let disambiguated = 0;
  for (const [annexId, standards] of [...byAnnex.entries()].sort()) {
    const pdfPath = pdfPaths[annexId];
    if (!pdfPath) throw new Error(`${annexId}의 PDF 경로가 없습니다 — pipeline:fetch를 먼저 실행하세요.`);
    const text = pdftotext(pdfPath);
    const codes = standards.map((s) => s.code);
    const { texts, failures, variants } = extractTexts(text, codes);

    const shared = new Map();
    for (const code of codes) shared.set(code, (shared.get(code) ?? 0) + 1);
    const usedVariants = new Map();
    for (const s of standards) {
      const override = exceptions[s.key] ?? exceptions[s.code];
      let extracted = override ?? texts.get(s.code);
      if (!override && (shared.get(s.code) ?? 0) > 1) {
        const candidates = variants.get(s.code) ?? [];
        if (candidates.length > 1) {
          const used = usedVariants.get(s.code) ?? new Set();
          const picked = pickVariant(candidates, s.summary, used);
          if (picked) {
            used.add(picked.index);
            usedVariants.set(s.code, used);
            if (picked.text !== extracted) disambiguated += 1;
            extracted = picked.text;
          }
        }
      }
      if (!extracted) continue;
      bySlug.get(s.slug).push({
        key: s.key, code: s.code, text: normalizeWhitespace(extracted),
        sourceId: annexId, locator: override ? 'manual-exception' : 'pattern-match',
      });
    }
    allFailures.push(...failures.filter((f) => !exceptions[f.code] &&
      !standards.some((s) => s.code === f.code && exceptions[s.key])));
  }

  for (const [slug, collected] of bySlug) {
    collected.sort((a, b) => a.key.localeCompare(b.key, 'en'));
    writeFileSync(join(fieldsDir, slug, 'standard-texts.json'), `${JSON.stringify({
      version: 'kr-vocational-standard-texts-v1',
      sourceNote:
        '국가교육위원회 고시 제2024-3호 초·중등학교 교육과정 별책23~39(전문교과) PDF에서 추출한 성취기준 본문. 공공저작물로서 저작권법 제24조의2에 따라 출처를 표기해 이용한다.',
      texts: collected,
    }, null, 1)}\n`);
  }

  const total = [...bySlug.values()].reduce((n, arr) => n + arr.length, 0);
  console.error(`✓ 원문 ${total}건 기록`);
  if (disambiguated) console.error(`  · 공유 코드 ${disambiguated}건은 요약문 대조로 과목별 배정`);
  if (allFailures.length) {
    console.error(`✗ 미해결 ${allFailures.length}건 — pipeline/exceptions.json에 수동 기입 후 재실행:`);
    for (const f of allFailures.slice(0, 50)) {
      console.error(`  - ${f.code} [${f.reason}]${f.preview ? ` ${f.preview}…` : ''}`);
    }
    process.exit(1);
  }
}
```

`exceptions.json`은 빈 객체 `{}`로 시작한다. 키는 성취기준 `key`(과목 한정) 또는 `code`(전역) 둘 다 허용.

- [x] **Step 4: 테스트 통과 확인**

Run: `node --test tests/extract-texts.test.mjs`
Expected: PASS

- [x] **Step 5: 실제 추출 실행 + 예외 보정 반복**

Run: `npm run pipeline:extract`
Expected: 첫 실행에서 미해결 건이 나올 수 있다(수식 글리프·비정형 조판). 각 실패 건에 대해:
1. 해당 별책 PDF를 열어 코드의 실제 본문 문장을 확인하고
2. `pipeline/exceptions.json`에 `"<key 또는 code>": "<본문 문장>"`으로 기입 후 재실행.
3. **본문 문장만** 기입한다(해설·고려사항 금지). 실패가 0이 될 때까지 반복.
`suspiciously-long`(>700자) 실패가 다수(>50건)면 개별 기입 대신 `MAX_TEXT`를 실측 최장 본문 기준으로 상향하고 그 근거(최장 실측치)를 커밋 메시지에 기록한다.

- [x] **Step 6: 커밋** (코드·예외만 — 데이터는 Task 6에서)

```bash
git add pipeline/extract-texts.mjs pipeline/exceptions.json tests/extract-texts.test.mjs
git commit -m "feat: 별책23~39 원문 추출 (공백 유연 코드 매칭, 예외 <실측>건)"
```

---

### Task 6: verify.mjs — 게이트·무결성·manifest + 데이터 커밋

**Files:**
- Create: `pipeline/verify.mjs`
- Test: `tests/verify.test.mjs`

**Interfaces:**
- Consumes: `data/kr/**` (Task 4·5), `pipeline/gates.json` (Task 4).
- Produces: `data/kr/core/manifest.json` — `{ dataset, taxonomyVersion, generatedAt, counts, files: { "<상대경로>": { bytes, sha256 } } }` (경로는 `core/curricula.json`·`fields/<slug>/topics.json` 형식). export: `verifyAll(dataDir, gates)`.

- [x] **Step 1: 실패하는 테스트 작성** (`tests/verify.test.mjs`) — 임시 폴더에 합성 데이터로 검증 로직 테스트

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyAll } from '../pipeline/verify.mjs';

function writeFixture(root) {
  const w = (rel, obj) => {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, JSON.stringify(obj));
  };
  const standard = {
    key: 'kr-2022-voc-전기-기초:[전기 01-01]', code: '[전기 01-01]', gradeBand: '10-12',
    subjectKorean: '전기 기초', majorFieldSlug: 'electrical-electronics',
    courseCategory: 'major-general', domainKorean: '전기 회로',
    summary: '요약', summaryKind: 'mechanical', sourceRefs: [], sourceLocator: null, deck6Id: 's1',
  };
  w('core/major-fields.json', { majorFields: [{ slug: 'electrical-electronics', labelKorean: '전기·전자', annexId: 'kr-nec-2024-3-annex34', courseCount: { 'major-general': 1 }, standardCount: { 'major-general': 1 }, includedCategories: ['major-general', 'specialized-common'] }] });
  w('core/curricula.json', { curricula: [{ id: 'kr-2022-voc-전기-기초', subjectKorean: '전기 기초', majorFieldSlug: 'electrical-electronics', courseCategory: 'major-general', gradeBand: '10-12', standardCount: 1, included: true, deck6CourseId: 'c1' }] });
  w('core/dependencies.json', { dependencies: [] });
  w('fields/electrical-electronics/curriculum-standards.json', { curricula: [{ id: 'kr-2022-voc-전기-기초', subjectKorean: '전기 기초', majorFieldSlug: 'electrical-electronics', subjectGroupKorean: '전기·전자', courseCategory: 'major-general', gradeBand: '10-12', name: '전기 기초 2022 개정 전문교과 교육과정', deck6CourseId: 'c1', sourceRefs: ['kr-nec-2024-3-annex34'], standardCount: 1, standards: [standard] }] });
  w('fields/electrical-electronics/standard-texts.json', { version: 'v1', sourceNote: '', texts: [{ key: standard.key, code: standard.code, text: '본문.', sourceId: 'annex34', locator: 'pattern-match' }] });
  w('fields/electrical-electronics/topics.json', { topics: [{ id: 't1', titleKorean: '주제', subjectKorean: '전기 기초', majorFieldSlug: 'electrical-electronics', gradeBand: '10-12', domainKorean: '전기 회로', facetKey: 'f', types: [], description: '', evidence: [], assessmentPrompts: [], standards: [standard.key], sourceRefs: [] }] });
  w('fields/electrical-electronics/clusters.json', { clusters: [{ id: 'cl1', titleKorean: '묶음', subjectKorean: '전기 기초', majorFieldSlug: 'electrical-electronics', gradeBand: '10-12', domainKorean: '전기 회로', summary: '', topicCount: 1, topics: ['t1'] }] });
  return root;
}

const GATES = {
  release: 'v0.1.0', includedCategories: ['major-general', 'specialized-common'],
  totals: { courses: 1, standards: 1 },
  fields: { 'electrical-electronics': { courses: 1, standards: 1 } },
};

test('verifyAll: 정상 데이터는 통과하고 counts를 준다', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  const { ok, errors, counts } = verifyAll(root, GATES);
  assert.deepEqual(errors, []);
  assert.ok(ok);
  assert.equal(counts.standards, 1);
  assert.equal(counts.texts, 1);
  assert.equal(counts.fields, 1);
});

test('verifyAll: 원문 누락을 잡는다', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  writeFileSync(join(root, 'fields/electrical-electronics/standard-texts.json'),
    JSON.stringify({ version: 'v1', sourceNote: '', texts: [] }));
  const { ok, errors } = verifyAll(root, GATES);
  assert.ok(!ok);
  assert.ok(errors.some((e) => e.includes('원문 누락')));
});

test('verifyAll: gates 수치 불일치를 잡는다', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  const wrongGates = { ...GATES, totals: { courses: 2, standards: 1 } };
  const { ok, errors } = verifyAll(root, wrongGates);
  assert.ok(!ok);
  assert.ok(errors.some((e) => e.includes('게이트')));
});

test('verifyAll: 미수록 카테고리 데이터 존재를 잡는다', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  const p = join(root, 'fields/electrical-electronics/curriculum-standards.json');
  const data = JSON.parse(readFileSync(p, 'utf8'));
  data.curricula[0].courseCategory = 'major-practical';
  writeFileSync(p, JSON.stringify(data));
  const { ok, errors } = verifyAll(root, GATES);
  assert.ok(!ok);
  assert.ok(errors.some((e) => e.includes('미수록 카테고리')));
});
```

(이 테스트 파일 상단 import에 `readFileSync`를 추가한다: `import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';`)

- [x] **Step 2: 실패 확인**

Run: `node --test tests/verify.test.mjs`
Expected: FAIL — 모듈 없음

- [x] **Step 3: 구현** (`pipeline/verify.mjs`)

```js
#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultDataDir = join(here, '..', 'data', 'kr');
export const CORE_FILES = ['major-fields.json', 'curricula.json', 'dependencies.json'];
export const FIELD_FILES = ['curriculum-standards.json', 'standard-texts.json', 'topics.json', 'clusters.json'];

export function verifyAll(dataDir = defaultDataDir, gates) {
  const read = (rel) => JSON.parse(readFileSync(join(dataDir, rel), 'utf8'));
  const errors = [];

  const { majorFields } = read('core/major-fields.json');
  const { curricula: index } = read('core/curricula.json');
  const { dependencies } = read('core/dependencies.json');
  const includedSet = new Set(gates.includedCategories);

  const slugs = readdirSync(join(dataDir, 'fields')).sort();
  const allStandards = [];
  const allTopics = [];
  const curriculumIds = new Set();
  const fieldCounts = {};
  const textsByField = new Map();

  for (const slug of slugs) {
    const { curricula } = read(`fields/${slug}/curriculum-standards.json`);
    const { texts } = read(`fields/${slug}/standard-texts.json`);
    const { topics } = read(`fields/${slug}/topics.json`);
    const { clusters } = read(`fields/${slug}/clusters.json`);
    textsByField.set(slug, texts);

    for (const c of curricula) {
      if (curriculumIds.has(c.id)) errors.push(`curriculum id 중복: ${c.id}`);
      curriculumIds.add(c.id);
      if (!includedSet.has(c.courseCategory)) {
        errors.push(`미수록 카테고리 데이터 존재: ${c.id} (${c.courseCategory})`);
      }
      if (c.majorFieldSlug !== slug) errors.push(`계열 폴더 불일치: ${c.id}가 ${slug}에 있음`);
      for (const s of c.standards) allStandards.push(s);
    }
    for (const t of topics) allTopics.push(t);

    const keySet = new Set(curricula.flatMap((c) => c.standards.map((s) => s.key)));
    const textKeys = new Set();
    for (const t of texts) {
      if (!keySet.has(t.key)) errors.push(`미지 key 원문: ${t.key}`);
      if (textKeys.has(t.key)) errors.push(`중복 원문: ${t.key}`);
      textKeys.add(t.key);
      if (!t.text || !t.text.trim()) errors.push(`빈 원문: ${t.key}`);
    }
    for (const key of keySet) if (!textKeys.has(key)) errors.push(`원문 누락: ${key}`);

    const topicIds = new Set(topics.map((t) => t.id));
    for (const cl of clusters) {
      for (const id of cl.topics) if (!topicIds.has(id)) errors.push(`클러스터 ${cl.id}의 미지 주제: ${id}`);
    }
    fieldCounts[slug] = {
      courses: curricula.length,
      standards: curricula.reduce((n, c) => n + c.standardCount, 0),
    };
  }

  // 주제 → 성취기준 key 참조 (계열 교차 없음 가정 없이 전역 대조)
  const globalKeys = new Set(allStandards.map((s) => s.key));
  for (const t of allTopics) {
    for (const key of t.standards) {
      if (!globalKeys.has(key)) errors.push(`주제 ${t.id}의 미지 성취기준 key: ${key}`);
    }
  }
  // 선수관계 → 주제 참조
  const globalTopicIds = new Set(allTopics.map((t) => t.id));
  for (const d of dependencies) {
    if (!globalTopicIds.has(d.topicId)) errors.push(`선수관계 미지 주제: ${d.topicId}`);
    if (!globalTopicIds.has(d.prerequisiteId)) errors.push(`선수관계 미지 주제: ${d.prerequisiteId}`);
  }
  // 색인 ↔ 실데이터 정합
  const indexById = new Map(index.map((c) => [c.id, c]));
  for (const id of curriculumIds) {
    const entry = indexById.get(id);
    if (!entry) errors.push(`색인에 없는 수록 과목: ${id}`);
    else if (!entry.included) errors.push(`색인 included=false인데 데이터 존재: ${id}`);
  }
  for (const c of index) {
    if (c.included && !curriculumIds.has(c.id)) errors.push(`색인 included=true인데 데이터 없음: ${c.id}`);
  }
  // major-fields ↔ 폴더
  const fieldSlugSet = new Set(majorFields.map((f) => f.slug));
  for (const slug of slugs) if (!fieldSlugSet.has(slug)) errors.push(`major-fields에 없는 폴더: ${slug}`);

  // 게이트 대조
  const totals = {
    courses: Object.values(fieldCounts).reduce((n, f) => n + f.courses, 0),
    standards: Object.values(fieldCounts).reduce((n, f) => n + f.standards, 0),
  };
  if (totals.courses !== gates.totals.courses) errors.push(`게이트 불일치: 과목 ${totals.courses} ≠ ${gates.totals.courses}`);
  if (totals.standards !== gates.totals.standards) errors.push(`게이트 불일치: 성취기준 ${totals.standards} ≠ ${gates.totals.standards}`);
  for (const [slug, expected] of Object.entries(gates.fields)) {
    const actual = fieldCounts[slug];
    if (!actual) { errors.push(`게이트 불일치: 계열 ${slug} 데이터 없음`); continue; }
    if (actual.courses !== expected.courses || actual.standards !== expected.standards) {
      errors.push(`게이트 불일치: ${slug} 과목 ${actual.courses}/${expected.courses} · 성취기준 ${actual.standards}/${expected.standards}`);
    }
  }
  for (const slug of Object.keys(fieldCounts)) {
    if (!gates.fields[slug]) errors.push(`게이트에 없는 계열: ${slug}`);
  }

  const counts = {
    fields: slugs.length,
    curricula: totals.courses,
    curriculaIndexed: index.length,
    standards: totals.standards,
    topics: allTopics.length,
    dependencies: dependencies.length,
    texts: [...textsByField.values()].reduce((n, t) => n + t.length, 0),
  };
  return { ok: errors.length === 0, errors, counts, fieldCounts };
}

function main() {
  const gates = JSON.parse(readFileSync(join(here, 'gates.json'), 'utf8'));
  const { ok, errors, counts } = verifyAll(defaultDataDir, gates);
  if (!ok) {
    console.error(`✗ 검증 실패 ${errors.length}건:`);
    for (const e of errors.slice(0, 40)) console.error(`  - ${e}`);
    if (errors.length > 40) console.error(`  … 외 ${errors.length - 40}건`);
    process.exit(1);
  }
  const files = {};
  const record = (rel) => {
    const raw = readFileSync(join(defaultDataDir, rel));
    files[rel] = { bytes: raw.byteLength, sha256: createHash('sha256').update(raw).digest('hex') };
  };
  for (const name of CORE_FILES) record(`core/${name}`);
  for (const slug of readdirSync(join(defaultDataDir, 'fields')).sort()) {
    for (const name of FIELD_FILES) record(`fields/${slug}/${name}`);
  }
  const manifest = {
    dataset: 'korean-vocational-learning-map',
    taxonomyVersion: 'kr-vocational-v0.1',
    generatedAt: new Date().toISOString(),
    counts, files,
  };
  writeFileSync(join(defaultDataDir, 'core', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.error(`✓ 전수 검증 통과 — manifest 기록 (성취기준 ${counts.standards} · 원문 ${counts.texts})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [x] **Step 4: 테스트 통과 확인**

Run: `node --test tests/verify.test.mjs`
Expected: PASS

- [x] **Step 5: 실제 검증 실행**

Run: `npm run pipeline:verify`
Expected: `✓ 전수 검증 통과` + `data/kr/core/manifest.json` 생성. 실패하면 원인(대부분 원문 누락 → Task 5의 exceptions 반복)을 해결하고 `extract → verify` 재실행.

- [x] **Step 6: 데이터 전체 커밋**

```bash
git add data/kr pipeline/verify.mjs tests/verify.test.mjs
git commit -m "feat: v0.1 데이터 산출 (계열 <N>개, 성취기준 <실측>건, 원문 100%)"
```

---

### Task 7: data-store.mjs — core 즉시 로드 + 계열 지연 로드

**Files:**
- Create: `src/data-store.mjs`
- Test: `tests/data-store.test.mjs`

**Interfaces:**
- Consumes: `data/kr/**` (Task 6 커밋본), `normalizeCode` (Task 2).
- Produces: `createStore(dataDir?)` → store 객체:
  - 즉시 가용: `manifest`, `majorFields`, `majorFieldsBySlug: Map`, `curriculaIndex`, `dependencies`, `prerequisitesByTopic: Map`, `unlocksByTopic: Map`, `includedFieldSlugs: string[]`, `loadedFields: Set`
  - 집계(로드된 계열만 반영, ensureField가 병합): `curricula`, `topics`, `clusters`, `allStandards`, `standardsByCode: Map`, `standardsByCodeAll: Map`, `standardsByKey: Map`, `textsByKey: Map`, `topicsById: Map`, `clustersById: Map`, `topicsByStandardKey: Map`
  - 메서드: `ensureField(slug): void`(미지 슬러그·미수록 시 한국어 Error throw), `ensureAllIncluded(): void`
- Task 8·9의 모든 모듈이 이 store를 소비한다.

- [x] **Step 1: 실패하는 테스트 작성** (`tests/data-store.test.mjs`) — 실데이터 사용

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createStore } from '../src/data-store.mjs';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'kr');

test('기동 시 core만 로드되고 계열 데이터는 비어 있다', () => {
  const store = createStore(dataDir);
  assert.ok(store.majorFields.length >= 1);
  assert.ok(store.curriculaIndex.length >= 219); // 미수록 전공실무 포함 색인(총 528)
  assert.equal(store.loadedFields.size, 0);
  assert.equal(store.allStandards.length, 0);
});

test('ensureField는 해당 계열을 로드·병합하고 캐시한다', () => {
  const store = createStore(dataDir);
  const slug = store.includedFieldSlugs[0];
  store.ensureField(slug);
  assert.ok(store.loadedFields.has(slug));
  assert.ok(store.allStandards.length >= 1);
  const before = store.allStandards.length;
  store.ensureField(slug); // 재호출은 no-op
  assert.equal(store.allStandards.length, before);
});

test('로드된 계열은 원문 수 = 성취기준 수', () => {
  const store = createStore(dataDir);
  const slug = store.includedFieldSlugs[0];
  store.ensureField(slug);
  assert.equal(store.textsByKey.size, store.allStandards.length);
});

test('ensureAllIncluded 후 전체 수치가 manifest counts와 일치한다', () => {
  const store = createStore(dataDir);
  store.ensureAllIncluded();
  assert.equal(store.allStandards.length, store.manifest.counts.standards);
  assert.equal(store.textsByKey.size, store.manifest.counts.texts);
  assert.equal(store.topics.length, store.manifest.counts.topics);
});

test('미지 계열 슬러그는 한국어 오류', () => {
  const store = createStore(dataDir);
  assert.throws(() => store.ensureField('no-such-field'), /계열/);
});

test('코드 조회는 공백 유무와 무관하다', () => {
  const store = createStore(dataDir);
  store.ensureAllIncluded();
  const withSpace = store.allStandards.find((s) => /\s/.test(s.code));
  assert.ok(withSpace, '전문교과 코드에는 공백이 있어야 한다');
  const spaceless = withSpace.code.replace(/\s+/g, '');
  assert.ok(store.standardsByCodeAll.get(store.normalizeCode(spaceless)).some((s) => s.key === withSpace.key));
});

test('계열 파일 변조 시 지연 로드가 거부한다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'voc-store-'));
  cpSync(dataDir, tmp, { recursive: true });
  const store = createStore(tmp);
  const slug = store.includedFieldSlugs[0];
  const p = join(tmp, 'fields', slug, 'topics.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('{', '{ '));
  assert.throws(() => store.ensureField(slug), /체크섬 불일치/);
});

test('core 파일 변조 시 기동이 거부된다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'voc-store-'));
  cpSync(dataDir, tmp, { recursive: true });
  const p = join(tmp, 'core', 'curricula.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('{', '{ '));
  assert.throws(() => createStore(tmp), /체크섬 불일치/);
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test tests/data-store.test.mjs`
Expected: FAIL — 모듈 없음

- [x] **Step 3: 구현** (`src/data-store.mjs`)

```js
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCode } from './normalize.mjs';

const defaultDataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'kr');

export const CORE_FILES = ['major-fields.json', 'curricula.json', 'dependencies.json'];
export const FIELD_FILES = ['curriculum-standards.json', 'standard-texts.json', 'topics.json', 'clusters.json'];

function readVerified(dataDir, manifest, rel) {
  const expected = manifest.files[rel];
  if (!expected) throw new Error(`manifest.json에 ${rel} 항목이 없습니다.`);
  const raw = readFileSync(join(dataDir, rel));
  const sha256 = createHash('sha256').update(raw).digest('hex');
  if (sha256 !== expected.sha256) {
    throw new Error(
      `${rel} 체크섬 불일치 — 설치본이 손상되었습니다. 패키지를 재설치하세요. (manifest=${expected.sha256}, 실제=${sha256})`
    );
  }
  return JSON.parse(raw.toString('utf8'));
}

export function createStore(dataDir = defaultDataDir) {
  const manifest = JSON.parse(readFileSync(join(dataDir, 'core', 'manifest.json'), 'utf8'));
  const { majorFields } = readVerified(dataDir, manifest, 'core/major-fields.json');
  const { curricula: curriculaIndex } = readVerified(dataDir, manifest, 'core/curricula.json');
  const { dependencies } = readVerified(dataDir, manifest, 'core/dependencies.json');

  const prerequisitesByTopic = new Map();
  const unlocksByTopic = new Map();
  for (const edge of dependencies) {
    if (!prerequisitesByTopic.has(edge.topicId)) prerequisitesByTopic.set(edge.topicId, []);
    prerequisitesByTopic.get(edge.topicId).push(edge);
    if (!unlocksByTopic.has(edge.prerequisiteId)) unlocksByTopic.set(edge.prerequisiteId, []);
    unlocksByTopic.get(edge.prerequisiteId).push(edge);
  }

  const majorFieldsBySlug = new Map(majorFields.map((f) => [f.slug, f]));
  // 수록 데이터가 실재하는 계열 = manifest.files에 폴더가 기록된 계열.
  const includedFieldSlugs = [...new Set(
    Object.keys(manifest.files)
      .filter((rel) => rel.startsWith('fields/'))
      .map((rel) => rel.split('/')[1])
  )].sort();

  const store = {
    manifest, majorFields, majorFieldsBySlug, curriculaIndex, dependencies,
    prerequisitesByTopic, unlocksByTopic, includedFieldSlugs,
    normalizeCode,
    loadedFields: new Set(),
    curricula: [], topics: [], clusters: [], allStandards: [],
    standardsByCode: new Map(), standardsByCodeAll: new Map(), standardsByKey: new Map(),
    textsByKey: new Map(), topicsById: new Map(), clustersById: new Map(),
    topicsByStandardKey: new Map(),
  };

  store.ensureField = (slug) => {
    if (store.loadedFields.has(slug)) return;
    if (!includedFieldSlugs.includes(slug)) {
      const known = majorFieldsBySlug.get(slug);
      throw new Error(
        known
          ? `계열 ${slug}(${known.labelKorean})은 아직 수록되지 않았습니다. 수록 현황은 list_major_fields로 확인하세요.`
          : `계열 ${slug}을(를) 찾을 수 없습니다. 유효한 슬러그: ${includedFieldSlugs.join(', ')}`
      );
    }
    const { curricula } = readVerified(dataDir, manifest, `fields/${slug}/curriculum-standards.json`);
    const { texts } = readVerified(dataDir, manifest, `fields/${slug}/standard-texts.json`);
    const { topics } = readVerified(dataDir, manifest, `fields/${slug}/topics.json`);
    const { clusters } = readVerified(dataDir, manifest, `fields/${slug}/clusters.json`);

    let added = 0;
    for (const curriculum of curricula) {
      store.curricula.push(curriculum);
      for (const standard of curriculum.standards) {
        const record = { ...standard, curriculumId: curriculum.id };
        store.allStandards.push(record);
        added += 1;
        const codeKey = normalizeCode(standard.code);
        if (!store.standardsByCode.has(codeKey)) store.standardsByCode.set(codeKey, record);
        if (!store.standardsByCodeAll.has(codeKey)) store.standardsByCodeAll.set(codeKey, []);
        store.standardsByCodeAll.get(codeKey).push(record);
        store.standardsByKey.set(standard.key, record);
      }
    }
    for (const entry of texts) store.textsByKey.set(entry.key, entry.text);
    if (texts.length !== added) {
      throw new Error(`계열 ${slug}: 원문 수(${texts.length})가 성취기준 수(${added})와 다릅니다 — pipeline/verify.mjs를 실행하세요.`);
    }
    for (const topic of topics) {
      store.topics.push(topic);
      store.topicsById.set(topic.id, topic);
      for (const key of topic.standards ?? []) {
        if (!store.topicsByStandardKey.has(key)) store.topicsByStandardKey.set(key, []);
        store.topicsByStandardKey.get(key).push(topic);
      }
    }
    for (const cluster of clusters) {
      store.clusters.push(cluster);
      store.clustersById.set(cluster.id, cluster);
    }
    store.loadedFields.add(slug);
  };

  store.ensureAllIncluded = () => {
    for (const slug of includedFieldSlugs) store.ensureField(slug);
  };

  return store;
}
```

- [x] **Step 4: 통과 확인**

Run: `node --test tests/data-store.test.mjs`
Expected: PASS (8 tests)

- [x] **Step 5: 커밋**

```bash
git add src/data-store.mjs tests/data-store.test.mjs
git commit -m "feat: core 즉시 로드 + 계열 지연 로드 data-store"
```

---

### Task 8: search.mjs · graph.mjs · roadmap.mjs — 순수 함수 모듈 포팅

**Files:**
- Create: `src/search.mjs`, `src/graph.mjs`, `src/roadmap.mjs`
- Test: `tests/search.test.mjs`, `tests/graph.test.mjs`, `tests/roadmap.test.mjs`

**Interfaces:**
- Consumes: store (Task 7 — 호출 전에 필요한 계열이 로드되어 있다고 가정하는 순수 함수).
- Produces:
  - `searchStandards(store, { query, subject, majorField, domain, limit })` → `{ total, results: compactStandard[] }`
  - `searchTopics(store, { query, subject, majorField, facetKey, standardCode, limit })` → `{ total, results: compactTopic[] }`
  - `searchStandardTexts(store, { query, subject, majorField, limit })` → `{ total, results: [{ code, subjectKorean, majorFieldSlug, snippet }] }`
  - `suggestSimilar(input, candidates, max?)`, `compactStandard`, `compactTopic`, `normalizeText` re-export
  - `directEdges(store, topicId, { direction, strength })`, `learningPath(store, topicId, { direction, strength })` — 포크 원본 그대로
  - `buildRoadmap(store, { subject, majorField, domain })` → `{ subject, majorFieldSlug, gradeBand, standardCount, domains: [{ domainKorean, clusters, standards }] }` 또는 `{ error: 'unknown-subject', suggestions }` / `{ error: 'ambiguous-subject', fields }`

- [x] **Step 1: 실패하는 테스트 작성**

`tests/search.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/data-store.mjs';
import { searchStandards, searchTopics, searchStandardTexts, suggestSimilar } from '../src/search.mjs';

const store = createStore();
store.ensureAllIncluded();

test('searchStandards: 코드 정확 일치가 최상위 (공백 없이 질의)', () => {
  const sample = store.allStandards.find((s) => /\s/.test(s.code));
  const spaceless = sample.code.replace(/\s+/g, '').replace(/[[\]]/g, '');
  const { results } = searchStandards(store, { query: spaceless });
  assert.equal(results[0].code, sample.code);
});

test('searchStandards: majorField 필터', () => {
  const slug = store.includedFieldSlugs.find((s) => s !== 'specialized-common');
  const { total, results } = searchStandards(store, { majorField: slug, limit: 50 });
  assert.ok(total >= 1);
  assert.ok(results.every((r) => r.majorFieldSlug === slug));
});

test('searchStandards: limit 상한 50', () => {
  const { results } = searchStandards(store, { limit: 999 });
  assert.ok(results.length <= 50);
});

test('searchTopics: standardCode로 연결 주제 조회', () => {
  const topic = store.topics.find((t) => t.standards.length >= 1);
  const standard = store.standardsByKey.get(topic.standards[0]);
  const { results } = searchTopics(store, { standardCode: standard.code });
  assert.ok(results.some((r) => r.id === topic.id));
});

test('searchStandardTexts: 원문 스니펫 검색', () => {
  const [key, text] = [...store.textsByKey.entries()][0];
  const word = text.split(' ').find((w) => w.length >= 2);
  const { total, results } = searchStandardTexts(store, { query: word });
  assert.ok(total >= 1);
  assert.ok(results[0].snippet.length >= word.length);
});

test('suggestSimilar: 오타에 유사 후보', () => {
  const subject = store.curricula[0].subjectKorean;
  const typo = `${subject}x`;
  assert.ok(suggestSimilar(typo, store.curricula.map((c) => c.subjectKorean)).includes(subject));
});
```

`tests/graph.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/data-store.mjs';
import { directEdges, learningPath } from '../src/graph.mjs';

const store = createStore();
store.ensureAllIncluded();

test('선수관계가 있으면 directEdges가 관련 주제를 준다 (없으면 빈 배열)', () => {
  if (store.dependencies.length === 0) {
    // 전문교과는 공식 선수관계가 희소하다 — 0건이면 빈 결과 규약만 확인.
    assert.deepEqual(directEdges(store, store.topics[0].id), []);
    return;
  }
  const edge = store.dependencies[0];
  const edges = directEdges(store, edge.topicId);
  assert.ok(edges.some((e) => e.relatedTopicId === edge.prerequisiteId));
  const path = learningPath(store, edge.topicId);
  assert.ok(path.length >= 2);
  assert.equal(path[path.length - 1].topicId, edge.topicId);
});
```

`tests/roadmap.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/data-store.mjs';
import { buildRoadmap } from '../src/roadmap.mjs';

const store = createStore();
store.ensureAllIncluded();

test('buildRoadmap: 실과목의 영역→클러스터 로드맵', () => {
  const curriculum = store.curricula[0];
  const roadmap = buildRoadmap(store, { subject: curriculum.subjectKorean, majorField: curriculum.majorFieldSlug });
  assert.equal(roadmap.subject, curriculum.subjectKorean);
  assert.equal(roadmap.standardCount, curriculum.standardCount);
  assert.ok(roadmap.domains.length >= 1);
  assert.ok(roadmap.domains[0].standards.length >= 1);
});

test('buildRoadmap: 미지 과목은 unknown-subject + 유사 후보', () => {
  const roadmap = buildRoadmap(store, { subject: '존재하지 않는 과목명' });
  assert.equal(roadmap.error, 'unknown-subject');
  assert.ok(Array.isArray(roadmap.suggestions));
});

test('buildRoadmap: 동명 과목이 여러 계열에 있으면 ambiguous-subject', () => {
  const byName = new Map();
  for (const c of store.curricula) {
    byName.set(c.subjectKorean, [...(byName.get(c.subjectKorean) ?? []), c]);
  }
  const dup = [...byName.values()].find((list) => new Set(list.map((c) => c.majorFieldSlug)).size > 1);
  if (!dup) return; // 동명 과목이 없으면 이 케이스는 데이터상 성립하지 않음
  const roadmap = buildRoadmap(store, { subject: dup[0].subjectKorean });
  assert.equal(roadmap.error, 'ambiguous-subject');
  assert.ok(roadmap.fields.length > 1);
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test tests/search.test.mjs tests/graph.test.mjs tests/roadmap.test.mjs`
Expected: FAIL — 모듈 없음

- [x] **Step 3: 구현**

`src/graph.mjs`: 포크 원본을 **그대로 복사**한다(수정 없음 — store 인터페이스가 동일).

`src/search.mjs`: 포크 원본에서 다음만 바꾼다.
- `compactStandard`: `schoolLevel` 필드 제거, `majorFieldSlug`·`courseCategory` 추가:

```js
export function compactStandard(standard) {
  return {
    key: standard.key,
    code: standard.code,
    subjectKorean: standard.subjectKorean,
    majorFieldSlug: standard.majorFieldSlug,
    courseCategory: standard.courseCategory,
    gradeBand: standard.gradeBand,
    domainKorean: standard.domainKorean,
    summary: standard.summary,
  };
}

export function compactTopic(topic) {
  return {
    id: topic.id,
    titleKorean: topic.titleKorean,
    subjectKorean: topic.subjectKorean,
    majorFieldSlug: topic.majorFieldSlug,
    gradeBand: topic.gradeBand,
    domainKorean: topic.domainKorean,
    facetKey: topic.facetKey,
    types: topic.types,
  };
}
```

- `searchStandards`·`searchTopics`·`searchStandardTexts`: 파라미터 `schoolLevel`·`gradeBand`를 `majorField`로 교체. 각 함수에서 `if (schoolLevel) …`·`if (gradeBand) …` 필터 줄을 삭제하고 다음으로 대체:

```js
if (majorField) candidates = candidates.filter((s) => s.majorFieldSlug === majorField);
```

- `searchStandardTexts` 결과 항목: `gradeBand` 대신 `majorFieldSlug`를 담는다: `{ code, subjectKorean, majorFieldSlug, snippet }`.
- 나머지(`levenshtein`, `suggestSimilar`, `matchesFilter`, `scoreByFields`, `rankByQuery`, `makeSnippet`, 점수 가중치, MAX_LIMIT=50)는 원본 그대로.

`src/roadmap.mjs`: 원본을 기반으로 schoolLevel·gradeBand 로직을 계열로 교체:

```js
import { normalizeText } from './normalize.mjs';
import { suggestSimilar } from './search.mjs';

export function buildRoadmap(store, { subject, majorField, domain } = {}) {
  const target = normalizeText(subject);
  let matches = store.curricula.filter((c) => normalizeText(c.subjectKorean) === target);
  if (majorField) matches = matches.filter((c) => c.majorFieldSlug === majorField);
  if (matches.length === 0) {
    return {
      error: 'unknown-subject',
      suggestions: suggestSimilar(subject, store.curricula.map((c) => c.subjectKorean)),
    };
  }
  if (new Set(matches.map((c) => c.majorFieldSlug)).size > 1) {
    return { error: 'ambiguous-subject', fields: [...new Set(matches.map((c) => c.majorFieldSlug))] };
  }
  const curriculum = matches[0];
  let standards = curriculum.standards;
  if (domain) {
    const domainTarget = normalizeText(domain);
    standards = standards.filter((s) => normalizeText(s.domainKorean) === domainTarget);
  }

  const domainMap = new Map();
  standards.forEach((standard, index) => {
    if (!domainMap.has(standard.domainKorean)) {
      domainMap.set(standard.domainKorean, { domainKorean: standard.domainKorean, firstSeen: index, standards: [] });
    }
    domainMap.get(standard.domainKorean).standards.push({
      code: standard.code,
      summary: standard.summary,
      topicCount: (store.topicsByStandardKey.get(standard.key) ?? []).length,
    });
  });

  const domains = [...domainMap.values()]
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .map((group) => ({
      domainKorean: group.domainKorean,
      clusters: store.clusters
        .filter(
          (cluster) =>
            normalizeText(cluster.subjectKorean) === normalizeText(curriculum.subjectKorean) &&
            cluster.majorFieldSlug === curriculum.majorFieldSlug &&
            normalizeText(cluster.domainKorean) === normalizeText(group.domainKorean)
        )
        .map((cluster) => ({ id: cluster.id, titleKorean: cluster.titleKorean })),
      standards: group.standards,
    }));

  return {
    subject: curriculum.subjectKorean,
    majorFieldSlug: curriculum.majorFieldSlug,
    gradeBand: curriculum.gradeBand,
    standardCount: standards.length,
    domains,
  };
}
```

- [x] **Step 4: 통과 확인**

Run: `node --test tests/search.test.mjs tests/graph.test.mjs tests/roadmap.test.mjs`
Expected: PASS

- [x] **Step 5: 커밋**

```bash
git add src/search.mjs src/graph.mjs src/roadmap.mjs tests/search.test.mjs tests/graph.test.mjs tests/roadmap.test.mjs
git commit -m "feat: 검색·그래프·로드맵 모듈 (majorField 체계로 포팅)"
```

---

### Task 9: server.mjs + cli.mjs — 도구 10종 + stdio 진입점

**Files:**
- Create: `src/server.mjs`, `src/cli.mjs`
- Test: `tests/server.test.mjs`

**Interfaces:**
- Consumes: Task 2·7·8의 모든 export.
- Produces: `createServer(store)` — MCP 서버(도구 10종 + about 리소스). `SERVER_INFO = { name: 'korean-vocational-learning-map', version: '0.1.0' }`.

- [x] **Step 1: 실패하는 테스트 작성** (`tests/server.test.mjs`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createStore } from '../src/data-store.mjs';
import { createServer } from '../src/server.mjs';

async function connect(store = createStore()) {
  const server = createServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(clientTransport);
  return { client, store };
}

function payloadOf(result) {
  return JSON.parse(result.content[0].text);
}

test('도구 10종이 등록되어 있다', async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [
      'get_learning_roadmap', 'get_prerequisites', 'get_standard', 'get_topic',
      'list_clusters', 'list_curricula', 'list_major_fields',
      'search_standard_text', 'search_standards', 'search_topics',
    ]
  );
});

test('list_major_fields: 계열 개요 + 수록 여부', async () => {
  const { client } = await connect();
  const payload = payloadOf(await client.callTool({ name: 'list_major_fields', arguments: {} }));
  assert.ok(payload.fields.length >= 1);
  const f = payload.fields[0];
  assert.ok('slug' in f && 'labelKorean' in f && 'includedCategories' in f);
});

test('list_curricula: 무필터는 계열 요약, majorField 지정 시 과목 목록(미수록 표시 포함)', async () => {
  const { client, store } = await connect();
  const summary = payloadOf(await client.callTool({ name: 'list_curricula', arguments: {} }));
  assert.ok(summary.groups.length >= 1);
  const slug = store.includedFieldSlugs[0];
  const detail = payloadOf(
    await client.callTool({ name: 'list_curricula', arguments: { majorField: slug } })
  );
  assert.ok(detail.courses.length >= 1);
  assert.ok(detail.courses.every((c) => typeof c.included === 'boolean'));
});

test('검색은 계열을 지연 로드한다 (서버 생성 시 0, 검색 후 ≥1)', async () => {
  const { client, store } = await connect();
  assert.equal(store.loadedFields.size, 0);
  const slug = store.includedFieldSlugs[0];
  await client.callTool({ name: 'search_standards', arguments: { majorField: slug } });
  assert.ok(store.loadedFields.has(slug));
  assert.equal(store.loadedFields.size, 1); // 다른 계열은 안 로드됨
});

test('search_standards → get_standard 왕복 (원문 + 코드 구조 해석)', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const sample = store.allStandards.find((s) => /\s/.test(s.code));
  const detail = payloadOf(
    await client.callTool({ name: 'get_standard', arguments: { code: sample.code, subject: sample.subjectKorean } })
  );
  assert.equal(detail.code, sample.code);
  assert.ok(detail.officialText.length > 5);
  assert.ok(detail.codeStructure === null || typeof detail.codeStructure.abbrev === 'string');
});

test('get_standard: 미지 코드는 유사 후보와 함께 실패', async () => {
  const { client } = await connect();
  const result = await client.callTool({ name: 'get_standard', arguments: { code: '[없음 99-99]' } });
  assert.ok(result.isError);
  assert.ok(result.content[0].text.includes('찾을 수 없습니다'));
});

test('get_topic: 주제 전체 레코드 (기계 파생 고지 포함)', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const topic = store.topics[0];
  const payload = payloadOf(await client.callTool({ name: 'get_topic', arguments: { topicId: topic.id } }));
  assert.equal(payload.id, topic.id);
  assert.ok(payload.note.includes('기계'));
});

test('get_prerequisites: 없는 주제 실패 / 있는 주제는 edges 반환 + 희소 안내', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const topic = store.topics[0];
  const payload = payloadOf(
    await client.callTool({ name: 'get_prerequisites', arguments: { topicId: topic.id } })
  );
  assert.ok(Array.isArray(payload.edges));
  if (payload.edges.length === 0) assert.ok(payload.hint.includes('희소'));
});

test('get_learning_roadmap: 과목 로드맵', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const curriculum = store.curricula[0];
  const payload = payloadOf(
    await client.callTool({
      name: 'get_learning_roadmap',
      arguments: { subject: curriculum.subjectKorean, majorField: curriculum.majorFieldSlug },
    })
  );
  assert.equal(payload.standardCount, curriculum.standardCount);
});

test('list_clusters: 요약 목록과 단건 상세', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  if (store.clusters.length === 0) return; // 전문교과에 클러스터가 없으면 스킵
  const list = payloadOf(await client.callTool({ name: 'list_clusters', arguments: {} }));
  assert.ok(list.total >= 1);
  const detail = payloadOf(
    await client.callTool({ name: 'list_clusters', arguments: { clusterId: list.results[0].id } })
  );
  assert.equal(detail.id, list.results[0].id);
});

test('search_standard_text: 원문 검색', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const text = [...store.textsByKey.values()][0];
  const word = text.split(' ').find((w) => w.length >= 2);
  const payload = payloadOf(
    await client.callTool({ name: 'search_standard_text', arguments: { query: word } })
  );
  assert.ok(payload.total >= 1);
});

test('미지 majorField는 한국어 오류 + 유효 슬러그 안내', async () => {
  const { client } = await connect();
  const result = await client.callTool({
    name: 'search_standards', arguments: { majorField: 'no-such' },
  });
  assert.ok(result.isError);
  assert.ok(result.content[0].text.includes('계열'));
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test tests/server.test.mjs`
Expected: FAIL — 모듈 없음

- [x] **Step 3: server.mjs 구현**

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { normalizeCode, parseVocationalCode } from './normalize.mjs';
import {
  normalizeText, searchStandards, searchStandardTexts, searchTopics, suggestSimilar,
} from './search.mjs';
import { directEdges, learningPath } from './graph.mjs';
import { buildRoadmap } from './roadmap.mjs';

const SERVER_INFO = { name: 'korean-vocational-learning-map', version: '0.1.0' };

const MAJOR_FIELD = z.string().max(100).optional()
  .describe('계열 슬러그 또는 계열명 (예: electrical-electronics, 전기·전자)');
const EMPTY_HINT =
  '검색 결과가 없습니다. query를 더 짧은 핵심어로 바꾸거나 majorField 필터를 확인하세요. 계열 목록은 list_major_fields.';
const SPARSE_DEPS_HINT =
  '전문교과는 공식 문서에 선수관계 명시가 희소합니다 — 관계가 없는 것이 정상일 수 있습니다.';
const MECHANICAL_NOTE =
  '이 주제의 설명·관찰 증거·평가 발문은 상류 데이터의 기계 파생물(candidate)입니다. 성취기준 공식 원문은 get_standard로 확인하세요.';

function ok(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 1) }] };
}

function fail(message, suggestions = []) {
  const text = suggestions.length ? `${message} 유사 후보: ${suggestions.join(', ')}` : message;
  return { content: [{ type: 'text', text }], isError: true };
}

// majorField 입력(슬러그 또는 한국어 계열명)을 슬러그로 푼다. 실패 시 Error(한국어).
function resolveMajorField(store, input) {
  if (!input) return null;
  const squash = (v) => normalizeText(v).replace(/\s+/g, '');
  const target = squash(input);
  const hit = store.majorFields.find(
    (f) => f.slug === input || squash(f.labelKorean) === target
  );
  if (!hit) {
    throw new Error(
      `계열 "${input}"을(를) 찾을 수 없습니다. 유효한 계열: ${store.majorFields.map((f) => f.slug).join(', ')}`
    );
  }
  return hit.slug;
}

// 과목명이 주어지면 그 과목이 속한 계열만, 아니면 majorField 또는 전체를 로드한다.
function ensureScope(store, { subject, majorField }) {
  if (majorField) { store.ensureField(majorField); return; }
  if (subject) {
    const squash = (v) => normalizeText(v).replace(/\s+/g, '');
    const target = squash(subject);
    const hits = store.curriculaIndex.filter((c) => c.included && squash(c.subjectKorean) === target);
    if (hits.length > 0) {
      for (const hit of hits) store.ensureField(hit.majorFieldSlug);
      return;
    }
  }
  store.ensureAllIncluded();
}

// 과목명 공백 무시 대조로 실제 라벨 복원 (색인 기준 — 로드 여부 무관).
function resolveSubjectLabel(store, label) {
  const squash = (v) => normalizeText(v).replace(/\s+/g, '');
  const target = squash(label);
  if (!target) return label;
  return store.curriculaIndex.find((c) => squash(c.subjectKorean) === target)?.subjectKorean ?? label;
}

function aboutText(store) {
  const { taxonomyVersion, counts } = store.manifest;
  return [
    '# 한국 특성화고 전문교과 학습지도 MCP 서버',
    '',
    `- 데이터 릴리스: ${taxonomyVersion}`,
    `- 수량: 수록 과목 ${counts.curricula}/${counts.curriculaIndexed} · 성취기준 ${counts.standards} · 주제 ${counts.topics} · 선수관계 ${counts.dependencies} · 계열 ${counts.fields}`,
    '- 라이선스: MIT. 데이터 원천은 DECK6/korean-secondary-learning-map(MIT)이며 원 저작권 고지를 유지한다.',
    '- 성취기준 공식 원문을 수록한다. 원문은 국가교육위원회 고시 제2024-3호 별책23~39(전문교과) 공공저작물로서 저작권법 제24조의2에 따라 출처를 표기해 이용한다.',
    '- 범위: 특성화고·마이스터고 전문교과 전공일반·전문공통(v0.1). 전공실무는 이후 버전에서 계열 단위로 추가한다. 보통교과·특목 계열은 korean-secondary-learning-map-mcp가 담당한다.',
    '- 세부 학습 주제의 설명·증거·발문은 상류의 기계 파생물(candidate)이다.',
    '- 교육부·국가교육위원회·NCIC의 공식 산출물이 아니며, 개별 학습자를 진단하지 않는다.',
    '- 출처·방법론: https://github.com/DECK6/korean-secondary-learning-map',
  ].join('\n');
}

export function createServer(store) {
  const server = new McpServer(SERVER_INFO);

  // 도구 핸들러 공통 래퍼: resolve·ensure 단계의 Error를 isError 응답으로 변환.
  const guarded = (fn) => async (args) => {
    try {
      return await fn(args);
    } catch (error) {
      return fail(error.message);
    }
  };

  server.registerResource(
    'about',
    'about://korean-vocational-learning-map',
    {
      title: '데이터 출처·라이선스 안내',
      description: '데이터 릴리스, 수량, 라이선스, 수록 범위 고지',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: aboutText(store) }],
    })
  );

  server.registerTool(
    'list_major_fields',
    {
      title: '전문교과 계열 목록',
      description:
        '17개 계열 + 전문공통의 개요(과목 수·성취기준 수·수록 여부·근거 별책)를 반환한다. 미수록 카테고리는 이후 버전에서 추가된다.',
      inputSchema: {},
    },
    guarded(async () => ok({
      release: store.manifest.taxonomyVersion,
      fields: store.majorFields.map((f) => ({
        slug: f.slug,
        labelKorean: f.labelKorean,
        annexId: f.annexId,
        courseCount: f.courseCount,
        standardCount: f.standardCount,
        includedCategories: f.includedCategories,
        dataAvailable: store.includedFieldSlugs.includes(f.slug),
      })),
      note: '전공실무(major-practical)는 v0.1에 미수록 — 이후 버전에서 계열 단위로 추가 예정.',
    }))
  );

  server.registerTool(
    'list_curricula',
    {
      title: '과목 목록',
      description:
        '필터가 없으면 계열 단위 요약을 반환한다. majorField를 주면 그 계열의 과목 목록(미수록 과목은 included:false로 표시)을 반환한다.',
      inputSchema: { majorField: MAJOR_FIELD },
    },
    guarded(async ({ majorField }) => {
      const slug = resolveMajorField(store, majorField);
      if (!slug) {
        const groups = new Map();
        for (const c of store.curriculaIndex) {
          if (!groups.has(c.majorFieldSlug)) {
            const field = store.majorFieldsBySlug.get(c.majorFieldSlug);
            groups.set(c.majorFieldSlug, {
              majorFieldSlug: c.majorFieldSlug,
              labelKorean: field?.labelKorean ?? null,
              courseCount: 0, includedCourseCount: 0, standardCount: 0,
            });
          }
          const g = groups.get(c.majorFieldSlug);
          g.courseCount += 1;
          if (c.included) g.includedCourseCount += 1;
          g.standardCount += c.standardCount;
        }
        return ok({
          groups: [...groups.values()].sort((a, b) => a.majorFieldSlug.localeCompare(b.majorFieldSlug, 'en')),
        });
      }
      const courses = store.curriculaIndex
        .filter((c) => c.majorFieldSlug === slug)
        .map((c) => ({
          id: c.id, subjectKorean: c.subjectKorean, courseCategory: c.courseCategory,
          gradeBand: c.gradeBand, standardCount: c.standardCount, included: c.included,
        }));
      return ok({
        majorFieldSlug: slug,
        courses,
        hint: courses.some((c) => !c.included)
          ? '전공실무(included:false) 과목은 이후 버전에서 수록 예정입니다.'
          : undefined,
      });
    })
  );

  server.registerTool(
    'search_standards',
    {
      title: '성취기준 검색',
      description:
        '성취기준을 코드·키워드·필터로 검색해 요약 목록을 반환한다. 상세는 get_standard로 조회한다.',
      inputSchema: {
        query: z.string().max(200).optional().describe('키워드 또는 코드 (예: 회로, 간기 01-01)'),
        subject: z.string().max(200).optional().describe('과목명'),
        majorField: MAJOR_FIELD,
        domain: z.string().max(200).optional().describe('영역명'),
        limit: z.number().int().min(1).max(50).optional().describe('최대 결과 수 (기본 20)'),
      },
    },
    guarded(async (args) => {
      const majorField = resolveMajorField(store, args.majorField);
      ensureScope(store, { subject: args.subject, majorField });
      const result = searchStandards(store, {
        ...args, majorField, subject: args.subject ? resolveSubjectLabel(store, args.subject) : undefined,
      });
      if (result.total === 0) result.hint = EMPTY_HINT;
      return ok(result);
    })
  );

  server.registerTool(
    'search_standard_text',
    {
      title: '성취기준 원문 검색',
      description:
        '성취기준 공식 원문 전문에서 키워드를 검색해 코드와 스니펫을 반환한다. 상세 원문은 get_standard의 officialText.',
      inputSchema: {
        query: z.string().min(1).max(200).describe('원문에서 찾을 키워드'),
        subject: z.string().max(200).optional().describe('과목명 필터'),
        majorField: MAJOR_FIELD,
        limit: z.number().int().min(1).max(50).optional().describe('최대 결과 수 (기본 20)'),
      },
    },
    guarded(async (args) => {
      const majorField = resolveMajorField(store, args.majorField);
      ensureScope(store, { subject: args.subject, majorField });
      const result = searchStandardTexts(store, {
        ...args, majorField, subject: args.subject ? resolveSubjectLabel(store, args.subject) : undefined,
      });
      if (result.total === 0) result.hint = EMPTY_HINT;
      return ok(result);
    })
  );

  server.registerTool(
    'get_standard',
    {
      title: '성취기준 상세',
      description:
        '성취기준 코드([간기 01-01] — 공백 유무 무관)로 전체 레코드, 공식 원문, 연결 주제, 코드 구조 해석을 조회한다. 일부 코드는 두 과목이 공유할 수 있어 subject로 구분한다.',
      inputSchema: {
        code: z.string().max(200).describe('성취기준 코드'),
        subject: z.string().max(200).optional().describe('과목명 (공유 코드 구분용)'),
      },
    },
    guarded(async ({ code, subject }) => {
      ensureScope(store, { subject });
      const normalized = normalizeCode(code);
      const all = store.standardsByCodeAll.get(normalized) ?? [];
      let candidates = all;
      if (subject && all.length > 0) {
        const target = normalizeText(resolveSubjectLabel(store, subject));
        candidates = all.filter((s) => normalizeText(s.subjectKorean) === target);
        if (candidates.length === 0) {
          return fail(
            `코드 ${normalized}에 과목 ${subject}은(는) 없습니다. 이 코드의 과목: ${all.map((s) => s.subjectKorean).join(', ')}`
          );
        }
      }
      if (candidates.length === 0) {
        return fail(
          `성취기준 ${normalized}을(를) 찾을 수 없습니다.`,
          suggestSimilar(normalized, [...store.standardsByCodeAll.keys()])
        );
      }
      if (candidates.length > 1) {
        return fail(
          `코드 ${normalized}는 과목 ${candidates.map((s) => s.subjectKorean).join(', ')}에 모두 존재합니다. subject로 과목을 지정하세요.`
        );
      }
      const standard = candidates[0];
      const linked = store.topicsByStandardKey.get(standard.key) ?? [];
      return ok({
        ...standard,
        officialText: store.textsByKey.get(standard.key) ?? null,
        codeStructure: parseVocationalCode(standard.code),
        linkedTopics: linked.map((topic) => ({ id: topic.id, titleKorean: topic.titleKorean })),
      });
    })
  );

  server.registerTool(
    'search_topics',
    {
      title: '학습 주제 검색',
      description:
        '세부 학습 주제를 키워드·필터로 검색한다. 주제는 상류 기계 파생물(candidate)이다. 상세는 get_topic.',
      inputSchema: {
        query: z.string().max(200).optional().describe('키워드'),
        subject: z.string().max(200).optional().describe('과목명'),
        majorField: MAJOR_FIELD,
        facetKey: z.string().max(200).optional().describe('주제 관점 키'),
        standardCode: z.string().max(200).optional().describe('이 성취기준에 연결된 주제만'),
        limit: z.number().int().min(1).max(50).optional().describe('최대 결과 수 (기본 20)'),
      },
    },
    guarded(async (args) => {
      const majorField = resolveMajorField(store, args.majorField);
      ensureScope(store, { subject: args.subject, majorField });
      const result = searchTopics(store, {
        ...args, majorField, subject: args.subject ? resolveSubjectLabel(store, args.subject) : undefined,
      });
      if (result.total === 0) result.hint = EMPTY_HINT;
      return ok(result);
    })
  );

  server.registerTool(
    'get_topic',
    {
      title: '학습 주제 상세',
      description:
        '주제 ID로 전체 레코드를 조회한다. 설명·증거·발문은 상류 기계 파생물(candidate)이다.',
      inputSchema: { topicId: z.string().max(200).describe('주제 ID (예: kr.topic.2022.high.…)') },
    },
    guarded(async ({ topicId }) => {
      if (!store.topicsById.has(topicId)) store.ensureAllIncluded();
      const topic = store.topicsById.get(topicId);
      if (!topic) {
        return fail(
          `주제 ${topicId}을(를) 찾을 수 없습니다.`,
          suggestSimilar(topicId, [...store.topicsById.keys()].slice(0, 2000))
        );
      }
      return ok({ ...topic, note: MECHANICAL_NOTE });
    })
  );

  server.registerTool(
    'get_prerequisites',
    {
      title: '선수관계 조회',
      description:
        '주제의 선수(prerequisites)/후속(unlocks) 관계를 조회한다. 전문교과는 공식 선수관계가 희소해 빈 결과가 정상일 수 있다. depth=all이면 전이 경로를 위상 순서로 반환한다.',
      inputSchema: {
        topicId: z.string().max(200).describe('주제 ID'),
        direction: z.enum(['prerequisites', 'unlocks']).optional().describe('기본 prerequisites'),
        depth: z.union([z.literal(1), z.literal('all')]).optional().describe('1(직접) 또는 all(전이)'),
        strength: z.enum(['hard', 'soft']).optional().describe('관계 강도 필터'),
      },
    },
    guarded(async ({ topicId, direction = 'prerequisites', depth = 1, strength }) => {
      if (!store.topicsById.has(topicId)) store.ensureAllIncluded();
      if (!store.topicsById.has(topicId)) {
        return fail(
          `주제 ${topicId}을(를) 찾을 수 없습니다.`,
          suggestSimilar(topicId, [...store.topicsById.keys()].slice(0, 2000))
        );
      }
      if (depth === 'all') {
        return ok({
          topicId, direction,
          pathOrder: learningPath(store, topicId, { direction, strength }),
        });
      }
      const edges = directEdges(store, topicId, { direction, strength });
      return ok({
        topicId, direction, edges,
        hint: edges.length === 0 ? SPARSE_DEPS_HINT : undefined,
      });
    })
  );

  server.registerTool(
    'get_learning_roadmap',
    {
      title: '학습 로드맵 요약',
      description:
        '과목의 성취기준을 영역→클러스터 계층으로 집계한 로드맵을 반환한다. 기존 데이터의 집계이며 새 순서를 만들지 않는다.',
      inputSchema: {
        subject: z.string().max(200).describe('과목명'),
        majorField: MAJOR_FIELD,
        domain: z.string().max(200).optional().describe('영역명 필터'),
      },
    },
    guarded(async ({ subject, majorField, domain }) => {
      const slug = resolveMajorField(store, majorField);
      ensureScope(store, { subject, majorField: slug });
      const resolved = resolveSubjectLabel(store, subject);
      const roadmap = buildRoadmap(store, { subject: resolved, majorField: slug, domain });
      if (roadmap.error === 'unknown-subject') {
        return fail(`과목 ${subject}을(를) 찾을 수 없습니다.`, roadmap.suggestions);
      }
      if (roadmap.error === 'ambiguous-subject') {
        return fail(
          `과목 ${subject}은(는) 여러 계열에 있습니다: ${roadmap.fields.join(', ')}. majorField로 계열을 지정하세요.`
        );
      }
      if (roadmap.standardCount === 0) {
        roadmap.hint = '해당 영역 필터에 성취기준이 없습니다. domain 이름을 확인하세요.';
      }
      return ok(roadmap);
    })
  );

  server.registerTool(
    'list_clusters',
    {
      title: '클러스터 조회',
      description:
        '학습 클러스터(단원 묶음) 목록을 조회한다. clusterId를 주면 단건 전체 레코드를 반환한다.',
      inputSchema: {
        clusterId: z.string().max(200).optional().describe('클러스터 ID (단건 상세)'),
        subject: z.string().max(200).optional().describe('과목명 필터'),
        majorField: MAJOR_FIELD,
      },
    },
    guarded(async ({ clusterId, subject, majorField }) => {
      const slug = resolveMajorField(store, majorField);
      if (clusterId) {
        if (!store.clustersById.has(clusterId)) store.ensureAllIncluded();
        const cluster = store.clustersById.get(clusterId);
        if (!cluster) {
          return fail(
            `클러스터 ${clusterId}을(를) 찾을 수 없습니다.`,
            suggestSimilar(clusterId, [...store.clustersById.keys()].slice(0, 2000))
          );
        }
        return ok(cluster);
      }
      ensureScope(store, { subject, majorField: slug });
      let candidates = store.clusters;
      if (subject) {
        const target = normalizeText(resolveSubjectLabel(store, subject));
        candidates = candidates.filter((c) => normalizeText(c.subjectKorean) === target);
      }
      if (slug) candidates = candidates.filter((c) => c.majorFieldSlug === slug);
      return ok({
        total: candidates.length,
        results: candidates.map((c) => ({
          id: c.id, titleKorean: c.titleKorean, subjectKorean: c.subjectKorean,
          majorFieldSlug: c.majorFieldSlug, topicCount: c.topicCount,
        })),
      });
    })
  );

  return server;
}
```

- [x] **Step 4: cli.mjs 구현**

```js
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createStore } from './data-store.mjs';
import { createServer } from './server.mjs';

try {
  const store = createStore();
  const server = createServer(store);
  await server.connect(new StdioServerTransport());
  console.error(
    `korean-vocational-learning-map-mcp ${store.manifest.taxonomyVersion}: stdio 서버 시작됨 (계열 ${store.includedFieldSlugs.length}개 지연 로드)`
  );
} catch (error) {
  console.error(`서버 시작 실패: ${error.message}`);
  process.exit(1);
}
```

- [x] **Step 5: 통과 확인 + 전체 테스트**

Run: `node --test tests/server.test.mjs` → PASS
Run: `npm test` → 전체 PASS

- [x] **Step 6: stdio 스모크**

Run (Git Bash):
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' | node src/cli.mjs
```
Expected: stdout에 initialize 응답 JSON 1줄, stderr에 시작 로그. 기동 시간이 1초 미만인지 확인(core만 로드).

- [x] **Step 7: 커밋**

```bash
git add src/server.mjs src/cli.mjs tests/server.test.mjs
git commit -m "feat: MCP 서버 도구 10종 + stdio 진입점 (계열 지연 로드)"
```

---

### Task 10: 문서·배포 준비

**Files:**
- Create: `README.md`, `CLAUDE.md`, `server.json`
- Modify: `NOTICE.md`(수치 확정)

**Interfaces:**
- Consumes: `pipeline/gates.json`·`data/kr/core/manifest.json`의 실측 수치 (아래 `<…>` 자리에 그 값을 그대로 넣는다 — 추정 금지).

- [x] **Step 1: README.md 작성**

```markdown
# korean-vocational-learning-map-mcp

한국 특성화고·마이스터고 전문교과 2022 개정 교육과정(국가교육위원회 고시 제2024-3호) 학습 그래프 MCP 서버.
성취기준 <manifest.counts.standards>건(전공일반·전문공통, 공식 원문 전량 수록) · 주제 <manifest.counts.topics>건 · 17계열을 패키지에 내장하고 stdio로 완전 로컬 동작한다. 도구 10종.

## 설치

```json
{ "mcpServers": { "korean-vocational-learning-map": {
  "command": "npx", "args": ["-y", "korean-vocational-learning-map-mcp"] } } }
```

## 수록 범위 (v0.1)

- **수록**: 전공일반 216과목 + 전문공통 3과목 = 219과목, 성취기준 <gates.totals.standards>건. 성취기준마다 공식 원문(별책23~39, 2024-3호) 수록.
- **미수록**: 전공실무 309과목(성취기준 39,200건) — 이후 버전에서 계열 단위로 추가 예정. `list_major_fields`·`list_curricula`에서 미수록 여부를 표시한다.
- 보통교과·특목 계열은 [korean-secondary-learning-map-mcp](https://github.com/raphysicst-create/korean-secondary-learning-map-mcp) 사용.

## 도구 10종

list_major_fields · list_curricula · search_standards · search_standard_text · get_standard · search_topics · get_topic · get_prerequisites · get_learning_roadmap · list_clusters

## 데이터 특성 고지

- 세부 학습 주제(topics)의 설명·관찰 증거·평가 발문은 상류 데이터의 기계 파생물(candidate)이다.
- 전문교과는 공식 문서에 선수관계 명시가 희소해 get_prerequisites가 빈 결과를 주는 것이 정상일 수 있다.
- 교육부·국가교육위원회·NCIC의 공식 산출물이 아니다.

## 라이선스·출처

MIT. 데이터 원천: [DECK6/korean-secondary-learning-map](https://github.com/DECK6/korean-secondary-learning-map)(MIT).
성취기준 원문은 공공저작물(저작권법 제24조의2), 출처는 NOTICE.md 참조.
```

`<…>` 자리는 gates.json·manifest.json의 실제 값으로 치환한다.

- [x] **Step 2: server.json 작성**

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.raphysicst-create/korean-vocational-learning-map-mcp",
  "description": "한국 특성화고 전문교과 2022 개정 교육과정 학습 그래프 MCP 서버 (전공일반·전문공통 성취기준 원문 수록)",
  "repository": {
    "url": "https://github.com/raphysicst-create/korean-vocational-learning-map-mcp",
    "source": "github"
  },
  "version": "0.1.0",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "korean-vocational-learning-map-mcp",
      "version": "0.1.0",
      "transport": { "type": "stdio" }
    }
  ]
}
```

- [x] **Step 3: CLAUDE.md 작성** — 아래 내용으로 작성하되 `<…>` 자리는 gates.json·manifest.json 실측값으로 치환한다.

```markdown
# CLAUDE.md

한국 특성화고 전문교과 2022 개정 교육과정 학습 그래프 MCP 서버 (npm: `korean-vocational-learning-map-mcp`, 레지스트리: `io.github.raphysicst-create/korean-vocational-learning-map-mcp`). v0.1 수록: 전공일반 216 + 전문공통 3 = 219과목, 성취기준 <실측>건(공식 원문 전량), 주제 <실측>건, 17계열 + 전문공통. 전공실무 309과목은 미수록(색인에만 존재). stdio 완전 로컬, 도구 10종.

## 명령

- `npm test` — 테스트 전체 (`node --test tests/*.test.mjs`)
- `npm run pipeline:fetch` — DECK6 원본 8파일 + NCIC 별책23~39 PDF 17권 확보·SHA-256 대조 (`.cache/`, git 미추적). PDF는 `PDF_DIR`(기본: 저장소 부모 폴더)
- `npm run pipeline:build` — 전문교과 필터·계열 분할 산출. `--record-gates`로 `pipeline/gates.json` 갱신
- `npm run pipeline:extract` — PDF 원문 추출, 실패분은 `pipeline/exceptions.json` 수동 보정
- `npm run pipeline:verify` — gates.json 게이트 + 참조 무결성 전수 + `core/manifest.json` 기록 (**데이터 변경 후 필수**)

파이프라인은 반드시 `fetch → build → extract → verify` 순서. `data/kr/**`는 커밋되어 있어 일반 개발엔 재현 불필요.

## 규칙

- 순수 ESM `.mjs`만, TypeScript·빌드 금지. 런타임 의존성 `@modelcontextprotocol/sdk` + `zod` 2종만.
- stdout은 MCP 프로토콜 전용 — 사람용 로그는 `console.error`.
- 도구 이름 영어 snake_case, 설명·에러 한국어. 검색 limit 기본 20 최대 50, NFC + 부분 일치만.
- 원문은 성취기준 본문 문장만. 출시 범위 = 원문 범위 (원문 없는 성취기준 출시 금지).
- 아키텍처: data-store(core 즉시 로드 + 계열 지연 로드·해시 검증) → search/graph/roadmap(순수 함수) → server → cli. 역방향 의존 금지.

## 데이터 특성 (가정 금지)

- 게이트는 고정 상수가 아니라 `pipeline/gates.json`이다. 수치가 어긋나면 build 필터를 먼저 의심할 것.
- 전문교과 코드는 괄호 안 공백 포함(`[간기 01-01]`·`[3개 01-01-01]`). `normalizeCode`가 공백을 제거해 매칭하므로 원시 문자열 비교 금지. 약칭은 숫자로 시작 가능.
- 계열 데이터는 요청 시 로드된다 — `store.ensureField(slug)`/`ensureAllIncluded()` 이전엔 집계 인덱스가 비어 있다.
- topic·cluster ID는 DECK6 원본 유지(재채번 금지).
- PDF 17권은 국가교육위원회 고시 제2024-3호(2024.8.16.)판만 유효 — 구판(2022-33호)은 fetch가 해시 불일치로 거부한다.
- 선수관계는 희소(전문교과 특성) — 빈 결과가 정상일 수 있다.

## 배포 절차

1. 버전 bump 3곳: `package.json` + `server.json`(서버·packages) + `src/server.mjs`의 `SERVER_INFO.version`
2. `npm test && npm run pipeline:verify`
3. `npm publish --browser=false` (2FA)
4. `mcp-publisher publish` (릴리스 바이너리 사용)

## 관련 저장소

- 기반 데이터셋(MIT): https://github.com/DECK6/korean-secondary-learning-map — 고정 커밋은 `pipeline/sources.json`
- 보통교과·특목 계열: https://github.com/raphysicst-create/korean-secondary-learning-map-mcp
```

- [x] **Step 4: 최종 검증**

Run: `npm test && npm run pipeline:verify`
Expected: 전체 PASS + 검증 통과.
Run: `npm pack --dry-run`
Expected: tarball에 `src/`·`data/`·README·LICENSE·NOTICE만 포함, 크기 확인해 README에 기록할 것.

- [x] **Step 5: 커밋**

```bash
git add README.md CLAUDE.md server.json NOTICE.md
git commit -m "docs: v0.1 문서·배포 메타데이터"
```

- [x] **Step 6: 배포는 사용자 확인 후** — `npm publish`(2FA 필요)와 mcp-publisher 등록, GitHub 저장소 생성·push는 **사용자에게 확인받고 진행**한다(계정 인증 필요).

---

## 계획 자체 점검 노트

- **스펙 커버리지**: 계열 분할·지연 로딩(Task 4·7), 출시 범위=원문 범위(Task 5·6 게이트), 주제 전량(Task 4 트리밍 없음), 코드체계(Task 2·5), 도구 10종(Task 9), 게이트 표(Task 4·6), 오류 처리(Task 7·9), 배포 3곳 bump(Task 10 CLAUDE.md) — 스펙의 모든 절이 태스크에 대응된다.
- **스펙 정정 1건**: `dependencies.json`을 계열 폴더가 아닌 `core/`에 둔다(계열 교차 엣지 가능·극소량). 스펙 §2에 반영 완료.
- **테스트 수**: 이 계획의 명시 테스트는 약 54개다. 스펙 목표(75개 내외)에 맞추려면 각 태스크에서 포크 원본 `..\korean-secondary-learning-map-mcp\tests\`의 해당 모듈 테스트 중 전문교과에 유효한 경계 케이스(빈 질의, limit 경계, 필터 조합 등)를 추가로 포팅한다 — 원본 테스트가 곧 구체 코드이므로 별도 명세는 생략한다.
- **실측 의존 값**: 성취기준 총수·계열별 수치는 Task 4에서 gates.json으로 확정하고, 이후 태스크·문서가 그 값을 인용한다. 과목 수 219는 2026-08-08 빌드 실측으로 확정 — 설계 시 추정 161(159+2)은 상류 오집계였다.
- **미확정 리스크**: (a) 상류 계열 라벨 표기가 FIELD_SLUGS 키와 다를 수 있음 — Task 4 Step 5에 복구 절차 명시. (b) PDF 조판 변형으로 추출 실패 다수 가능 — Task 5 Step 5에 exceptions 반복 절차 명시. (c) 전문공통 3과목의 별책 소속 — 과목 sourceRefs로 자동 해결되며 없으면 명시적 오류.
```
