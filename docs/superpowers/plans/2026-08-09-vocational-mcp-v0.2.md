# korean-vocational-learning-map-mcp v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전공실무 309과목(성취기준 39,200건)을 수록해 전문교과 전 범위(528과목·47,625건·원문 100%)를 완성하고, v0.1 최종 리뷰의 이연 정리 4건을 반영해 v0.2.0을 출시 준비 상태로 만든다.

**Architecture:** 기존 파이프라인·서버를 그대로 쓴다 — 수록 범위 상수(`RELEASE_SCOPE`) 확장 + 파이프라인 재실행이 본체다. 신규 코드는 (a) 추출 컷 패턴 회귀 테스트(재추출 전 필수 선행 조건), (b) 이연 정리 4건(get_standard majorField, data-store 검사 이동·사어 인덱스 제거, search 사어 필드, 서버 안내문 갱신)뿐이다.

**Tech Stack:** v0.1과 동일 (Node ≥20.11, 순수 ESM, `@modelcontextprotocol/sdk`+`zod` 2종, `node --test`, poppler pdftotext).

**승인된 스펙:** `docs/superpowers/specs/2026-08-08-vocational-mcp-design.md` — 단계 출시 절: "v0.2.0+ — 전공실무를 계열 단위로 추가. 계열 하나 추가 = 폴더 + 게이트 표 갱신 + 원문 추출". 이번 릴리스는 전공실무 **전체**(17계열 모두)를 한 번에 수록한다.

## Global Constraints

(v0.1과 동일 — 스펙 전재)

- 순수 ESM `.mjs`만, 의존성 2종만, stdout 프로토콜 전용(로그 `console.error`), 오류·설명 한국어.
- **출시 범위 = 원문 범위**: 수록 성취기준은 반드시 공식 원문 포함. 원문은 성취기준 본문 문장만.
- 게이트는 `pipeline/gates.json` — 수치는 빌드 실측으로 확정하고 사전 추정치를 게이트로 쓰지 않는다.
- 파이프라인 순서 고정 `fetch → build → extract → verify`. `.cache/`는 이미 확보되어 있어 fetch 재실행 불필요(변경 없음).
- topic·cluster ID 재채번 금지. PDF는 2024-3호판만(이미 검증됨).
- 코드 형식(2단/3단)은 카테고리와 1:1이 아니다 — `parseVocationalCode` kind는 `two-level`/`three-level-ncs`.
- 버전 bump 3곳: `package.json` + `server.json` 2곳 + `src/server.mjs` `SERVER_INFO.version`.
- 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 배포 실행(npm publish·mcp-publisher·push)은 계획 밖 — 완료 후 사용자 확인 단계.

## 알려진 실측값 (v0.1 시점)

- 전문교과 전체: 528과목 = 전공일반 216 + 전공실무 309 + 전문공통 3, 성취기준 47,625건 (v0.1 수록 8,425 + 전공실무 39,200).
- 주제는 고교에서 성취기준과 1:1이었다(v0.1에서 8,425:8,425) — 전 범위에서도 1:1로 예상하되 **확정은 빌드 실측**.
- 선수관계는 v0.1에서 35건(양끝 수록 필터) — 전공실무 주제가 수록되면 늘어난다. 실측 기입.
- 상류 알려진 결함(대응 불요, 기록만): `간호의 기초`에 `[치임 03-01]` 혼입(상류 충실 유지), `치과 간호 임상 실무`에는 동 코드 누락(그 과목 코드 목록에 없으므로 추출 게이트에 영향 없음), summary 오염 27건+α(본문은 정상).

---

### Task 1: 추출 컷 패턴·listItem 회귀 테스트 (선행 조건)

v0.1 Task 5가 추가한 전문교과 컷 패턴 5종과 listItem 보강("코드 뒤 공백" 판정)에는 단위 테스트가 없다. **39,200건 재추출 전에 이 동작을 테스트로 고정**해야 패턴 회귀를 전량 재추출+수동 실사 없이 잡을 수 있다.

**Files:**
- Modify: `tests/extract-texts.test.mjs` (기존 6개 테스트 뒤에 추가)

**Interfaces:**
- Consumes: `extractTexts(pdfText, expectedCodes)`, `findCodePositions(norm, codes)` — `pipeline/extract-texts.mjs`의 기존 export. 컷 패턴은 `sliceStandardText` 내부에서 적용되므로 `extractTexts` 경유로 검증한다.
- Produces: 없음 (테스트만).

- [x] **Step 1: 회귀 테스트 추가** (`tests/extract-texts.test.mjs` 말미에)

```js
// ── v0.1에서 추가된 전문교과 조판 컷 패턴 5종 + listItem 보강 회귀 고정 ──

test('컷: <성취기준 …> 헤딩 변형에서 자른다', () => {
  const pdf = '[전기 01-01] 회로를 구성한다. <성취기준 적용 시 고려 사항> 이 부분은 잘려야 한다.';
  const { texts } = extractTexts(pdf, ['[전기 01-01]']);
  assert.equal(texts.get('[전기 01-01]'), '회로를 구성한다.');
});

test('컷: 줄 첫머리 숫자)·글자) 헤딩은 자르되 본문 안 표기는 살린다', () => {
  const pdf = [
    '[전기 01-01] 도면(부록 2) 기준으로 회로를 구성한다.',
    '2) 산업 곤충의 종류',
    '이 헤딩 이하는 잘려야 한다.',
    '[전기 01-02] 소자를 나) 항목 없이 구분한다.',
    '나) 곤충의 생리 및 생태',
  ].join('\n');
  const { texts } = extractTexts(pdf, ['[전기 01-01]', '[전기 01-02]']);
  // 본문 안 '(부록 2)'의 '2)'는 줄 첫머리가 아니므로 잘리지 않는다.
  assert.equal(texts.get('[전기 01-01]'), '도면(부록 2) 기준으로 회로를 구성한다.');
  // 본문 안 '나)'도 줄 첫머리가 아니므로 잘리지 않는다.
  assert.equal(texts.get('[전기 01-02]'), '소자를 나) 항목 없이 구분한다.');
});

test('컷: 줄 첫머리 글머리표 •에서 자른다', () => {
  const pdf = '[전기 01-01] 회로를 구성한다.\n• 고려 사항 글머리표는 잘려야 한다.';
  const { texts } = extractTexts(pdf, ['[전기 01-01]']);
  assert.equal(texts.get('[전기 01-01]'), '회로를 구성한다.');
});

test('컷: 줄 첫머리 "N. 교수" 절에서 자르되 본문 안 교수·학습 어휘는 살린다', () => {
  const pdf = '[전기 01-01] 교수·학습 상황에 맞게 회로를 구성한다.\n3. 교수‧학습 및 평가\n이하 잘려야 한다.';
  const { texts } = extractTexts(pdf, ['[전기 01-01]']);
  assert.equal(texts.get('[전기 01-01]'), '교수·학습 상황에 맞게 회로를 구성한다.');
});

test('컷: expectedCodes에 없는 코드 행(발췌 수록 이웃)에서 자른다', () => {
  const pdf = '[전기 01-01] 회로를 구성한다.\n[전기 01-03] 이 코드는 기대 목록에 없어 경계가 안 되지만 행 컷으로 잘린다.';
  const { texts, failures } = extractTexts(pdf, ['[전기 01-01]']);
  assert.equal(failures.length, 0);
  assert.equal(texts.get('[전기 01-01]'), '회로를 구성한다.');
});

test('listItem 보강: 코드 뒤에 조사가 붙은 상호참조 조각은 목록 항목이 아니다', () => {
  // 고려 사항의 '[산잠 03-01-06]과 연계하여'가 줄바꿈으로 갈라져 줄 첫머리에 온 경우 —
  // 코드 뒤가 공백이 아니므로(조사 '과') 목록 항목으로 오인하면 안 된다.
  const pdf = [
    '앞 과목 설명.',
    '[산잠 03-01-06]과 연계하여 지도한다.',
    '[산잠 03-01-06] 산업 곤충의 사육 환경을 조성한다.',
  ].join('\n');
  const norm = pdf.normalize('NFC');
  const positions = findCodePositions(norm, ['[산잠 03-01-06]']);
  assert.equal(positions.length, 2);
  assert.equal(positions[0].listItem, false); // 조사 붙은 조각
  assert.equal(positions[1].listItem, true);  // 진짜 목록 항목
  const { texts } = extractTexts(pdf, ['[산잠 03-01-06]']);
  assert.equal(texts.get('[산잠 03-01-06]'), '산업 곤충의 사육 환경을 조성한다.');
});
```

- [x] **Step 2: 실행 — 전부 PASS 확인** (기존 동작 고정이므로 즉시 통과해야 정상)

Run: `node --test tests/extract-texts.test.mjs`
Expected: 12 pass (기존 6 + 신규 6)

- [x] **Step 3: 변이 검증 — 테스트의 실효성 증명** (v0.1 Task 6과 같은 방식)

`pipeline/extract-texts.mjs`의 전문교과 컷 패턴 5종(`/<\s*성취기준/`부터 코드 행 컷까지)을 임시로 주석 처리하고 테스트 실행 → **신규 테스트 중 해당 패턴을 덮는 것들이 실제로 실패**하는지 확인. listItem 보강(`&& (after === undefined || /\s/.test(after))`)도 임시 제거해 6번 테스트가 실패하는지 확인. 확인 후 **원상 복구**하고 파일이 원본과 동일함을 `git diff pipeline/extract-texts.mjs`(출력 없음)로 증명. 변이별 실패 테스트 목록을 보고서에 기록.

- [x] **Step 4: 전체 스위트 회귀 확인**

Run: `npm test`
Expected: 60 pass (기존 54 + 신규 6)

- [x] **Step 5: 커밋**

```bash
git add tests/extract-texts.test.mjs
git commit -m "test: 전문교과 컷 패턴·listItem 보강 회귀 고정 (재추출 선행 조건)"
```

---

### Task 2: 수록 범위 확장 — RELEASE_SCOPE + 게이트 528

**Files:**
- Modify: `pipeline/build-data.mjs` (RELEASE_SCOPE·EXPECTED_INCLUDED_COURSES·주석)
- Modify: `tests/build-data.test.mjs` (합성 픽스처 기대값 — 전공실무 수록 반영)
- Modify: `pipeline/gates.json` (실행 산출 — `--record-gates`)

**Interfaces:**
- Produces: `RELEASE_SCOPE = {major-general, major-practical, specialized-common}`, `EXPECTED_INCLUDED_COURSES = 528`. Task 3·4가 이 산출 데이터를 소비.

- [x] **Step 1: 합성 픽스처 테스트 기대값을 새 범위로 갱신 (TDD — 먼저 바꿔 RED)**

`tests/build-data.test.mjs`의 `buildVocational` 테스트에서 v0.1 범위를 전제한 단언들을 다음으로 교체:

```js
test('buildVocational: 수록 범위 필터·계열 분할·색인·의존 필터', () => {
  const out = buildVocational(syntheticRaw());
  // 보통교과(c4)는 색인에도 없다. 전문교과 3과목은 전부 색인에 있다.
  assert.deepEqual(out.curriculaIndex.map((c) => c.deck6CourseId).sort(), ['c1', 'c2', 'c3']);
  // v0.2 수록: 전문교과 3카테고리 전부 included.
  const included = Object.fromEntries(out.curriculaIndex.map((c) => [c.deck6CourseId, c.included]));
  assert.deepEqual(included, { c1: true, c2: true, c3: true });
  // 계열 파일: 전기·전자에 c1·c2(전공실무 포함), specialized-common 의사 계열에 c3.
  assert.deepEqual([...out.fields.keys()].sort(), ['electrical-electronics', 'specialized-common']);
  assert.deepEqual(
    out.fields.get('electrical-electronics').curricula.map((c) => c.deck6CourseId).sort(),
    ['c1', 'c2']
  );
  assert.deepEqual(out.fields.get('specialized-common').curricula.map((c) => c.deck6CourseId), ['c3']);
  // standard 레코드에 majorFieldSlug·courseCategory가 붙는다.
  const c1cur = out.fields.get('electrical-electronics').curricula.find((c) => c.deck6CourseId === 'c1');
  const s = c1cur.standards[0];
  assert.equal(s.majorFieldSlug, 'electrical-electronics');
  assert.equal(s.courseCategory, 'major-general');
  assert.equal(s.key, `${c1cur.id}:[전기 01-01]`);
  assert.equal(s.gradeBand, '10-12');
  // 주제: 수록 과목 연결분 전부 (t2는 c2가 수록되어 이제 포함).
  assert.deepEqual(
    out.fields.get('electrical-electronics').topics.map((t) => t.id).sort(),
    ['t1', 't2']
  );
  // 선수관계: 양끝 수록 — t1 자기엣지 + t2→t1 둘 다 유지.
  assert.equal(out.dependencies.length, 2);
  assert.deepEqual(out.dependencies.map((d) => d.strength).sort(), ['hard', 'soft']);
  // major-fields: 카테고리별 수치 + includedCategories 3종.
  const elec = out.majorFields.find((f) => f.slug === 'electrical-electronics');
  assert.equal(elec.courseCount['major-general'], 1);
  assert.equal(elec.courseCount['major-practical'], 1);
  assert.equal(elec.standardCount['major-practical'], 1);
  assert.deepEqual(elec.includedCategories, [...RELEASE_SCOPE]);
  assert.equal(elec.annexId, 'kr-nec-2024-3-annex34');
});
```

(`syntheticRaw()` 픽스처 자체는 수정하지 않는다.)

- [x] **Step 2: RED 확인**

Run: `node --test tests/build-data.test.mjs`
Expected: FAIL — included·fields·dependencies 단언들이 현행 v0.1 범위와 충돌

- [x] **Step 3: RELEASE_SCOPE 확장** (`pipeline/build-data.mjs`)

```js
// v0.2 수록 범위: 전문교과 전 범위. (v0.1은 major-general+specialized-common만이었다.)
export const RELEASE_SCOPE = new Set(['major-general', 'major-practical', 'specialized-common']);
export const EXPECTED_INCLUDED_COURSES = 528; // 전공일반 216 + 전공실무 309 + 전문공통 3 (상류 실측)
```

- [x] **Step 4: GREEN 확인 + 전체 회귀**

Run: `node --test tests/build-data.test.mjs` → PASS
Run: `npm test` → 60 pass (주의: data-store·server 테스트는 아직 v0.1 데이터 기준 — 이 시점엔 데이터 미재생성이라 그대로 통과해야 한다)

- [x] **Step 5: 실제 빌드 + gates 재기록**

Run: `node pipeline/build-data.mjs --record-gates`
Expected: `수록 과목 528 · 성취기준 47625 · 계열 18` 로그, gates.json에 totals `{courses: 528, standards: 47625}`. 성취기준이 47,625가 아니면 상류 필터를 의심하고 진단(README 기준선 총수와 대조), 해결 못 하면 BLOCKED.
gates.json을 열어 계열 합계=totals 일치 육안 확인, 주제·선수관계 실측치를 로그에서 보고서에 기록.

- [x] **Step 6: 커밋** (데이터 산출물은 Task 4에서 — 코드·테스트·gates만)

```bash
git add pipeline/build-data.mjs pipeline/gates.json tests/build-data.test.mjs
git commit -m "feat: 수록 범위를 전문교과 전 범위로 확장 (528과목·성취기준 47,625건 게이트)"
```

---

### Task 3: 원문 추출 — 39,200건 추가 (총 47,625건)

**Files:**
- Modify: `pipeline/exceptions.json` (실패분 수동 보정 — 기존 3건 유지)
- 산출: `data/kr/fields/<slug>/standard-texts.json` 18개 재생성 (커밋은 Task 4)

**Interfaces:**
- Consumes: Task 2의 재생성된 `data/kr/fields/**/curriculum-standards.json`, `.cache/pdf-paths.json` (v0.1 그대로 유효).
- Produces: 원문 47,625건 (실패 0).

주의: 이 태스크 동안 작업 트리의 `data/kr`은 재생성됐지만 `manifest.json`은 아직 v0.1 것이다 — **이 시점에 `npm test`를 돌리면 data-store 해시 검증 테스트가 실패하는 것이 정상**이다(Task 4의 verify가 manifest를 재기록한 뒤에야 전체 스위트가 돌아간다). 이 태스크에서는 전체 스위트를 돌리지 말 것.

- [x] **Step 1: 추출 실행**

Run: `npm run pipeline:extract` (수 분 소요 가능 — Bash timeout 600000)
Expected: 첫 실행에서 미해결 건이 나올 수 있다(전공실무 39,200건은 v0.1의 4.7배 규모).

- [x] **Step 2: 예외 보정 반복** (v0.1 Task 5와 동일 절차)

각 실패 코드에 대해 해당 별책 PDF의 pdftotext 출력에서 실제 본문을 grep/node 원라이너로 좁혀 확인 → `pipeline/exceptions.json`에 `"<key 또는 code>": "<본문 문장만>"` 기입 → 재실행. 실패 0까지 반복.
- `suspiciously-long`(>700자)이 50건을 넘으면 개별 기입 대신 `MAX_TEXT`를 실측 최장 본문 기준으로 상향하고 근거를 커밋 메시지에 기록 (이 경우 Task 1의 테스트에 영향 없음 — 컷 패턴 무관).
- 반복 30회 초과 또는 구조적 문제(코드가 PDF에 대량 부재 등)면 중간 결과 정리 후 BLOCKED.
- 기존 예외 3건(v0.1)이 여전히 유효한지 재실행 로그로 확인.

- [x] **Step 3: 총수 확인**

각 계열 standard-texts.json의 texts 합 = 47,625 (node 원라이너로 집계해 보고서에 기록).

- [x] **Step 4: 커밋** (코드·예외만)

```bash
git add pipeline/exceptions.json
git commit -m "feat: 전공실무 원문 39,200건 추출 (총 47,625건, 예외 <실측>건)"
```

(exceptions.json 무변경이면 이 커밋은 생략하고 보고서에 "예외 추가 0건"을 기록.)

---

### Task 4: 전수 검증 + 데이터 커밋

**Files:**
- 산출 커밋: `data/kr/**` 전체 (재생성분)

**Interfaces:**
- Consumes: `pipeline/verify.mjs`(v0.1 그대로 — 코드 무변경), `pipeline/gates.json`(Task 2).
- Produces: `data/kr/core/manifest.json` 갱신 (counts: curricula 528 · standards 47,625 · texts 47,625 · topics 실측 · dependencies 실측).

- [x] **Step 1: 검증 실행**

Run: `npm run pipeline:verify`
Expected: `✓ 전수 검증 통과`. 실패 시 원인 진단(원문 누락 → Task 3 반복 / 게이트 불일치 → Task 2 재확인). 데이터 산출물을 손으로 고치지 말 것.

- [x] **Step 2: 전체 테스트 재실행** (이제 실데이터가 v0.2 규모)

Run: `npm test`
Expected: 60 pass. data-store·search·server 테스트는 manifest counts 동적 참조라 그대로 통과해야 한다. `ensureAllIncluded` 계열 테스트가 눈에 띄게 느려질 수 있다(전체 ~120MB 로드) — 실패가 아니면 정상. 총 소요 시간을 보고서에 기록.

- [x] **Step 3: 데이터 커밋**

```bash
git add data/kr
git commit -m "feat: v0.2 데이터 — 전문교과 전 범위 528과목·성취기준 47,625건·원문 100%"
```

- [x] **Step 4: 저장소 크기 확인**

`git count-objects -vH`와 `du -sh data/kr` 결과를 보고서에 기록 (README 패키지 크기 절 갱신용 기초 자료).

---

### Task 5: 이연 정리 묶음 (v0.1 최종 리뷰 반영)

**Files:**
- Modify: `src/server.mjs` (get_standard majorField 파라미터, list_major_fields 정적 note 제거, aboutText 범위 문구)
- Modify: `src/data-store.mjs` (원문 수 검사 병합 전 이동, 사어 인덱스 standardsByCode 제거)
- Modify: `src/search.mjs` (사어 필드 s.subject·s.domain·t.subject 참조 제거)
- Test: `tests/server.test.mjs`, `tests/data-store.test.mjs` (신규 케이스 추가)

**Interfaces:**
- Consumes: 기존 store·검색 인터페이스.
- Produces: `get_standard` inputSchema에 `majorField`(선택) 추가. `store.standardsByCode` **제거** — 소비처가 없음을 grep으로 확인 후 진행(있으면 BLOCKED).

- [x] **Step 1: 사전 확인 — standardsByCode 소비처 없음 증명**

Run: `grep -rn "standardsByCode\b" src tests` (standardsByCodeAll 제외)
Expected: `src/data-store.mjs`의 생성 3줄만. 다른 소비처가 나오면 제거하지 말고 BLOCKED 보고.

- [x] **Step 2: 실패하는 테스트 추가**

`tests/server.test.mjs`에:

```js
test('get_standard: majorField로 계열을 좁혀 조회한다', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const sample = store.allStandards[0];
  const detail = payloadOf(
    await client.callTool({
      name: 'get_standard',
      arguments: { code: sample.code, subject: sample.subjectKorean, majorField: sample.majorFieldSlug },
    })
  );
  assert.equal(detail.key, sample.key);
  // 잘못된 계열을 주면 해당 계열엔 그 코드가 없다는 오류.
  const wrongField = store.includedFieldSlugs.find((s) => s !== sample.majorFieldSlug);
  const miss = await client.callTool({
    name: 'get_standard',
    arguments: { code: sample.code, majorField: wrongField },
  });
  // 다른 계열에 같은 코드가 실존할 수도 있으므로: 성공하면 그 계열 소속이어야 하고, 실패면 한국어 오류.
  if (miss.isError) assert.ok(miss.content[0].text.includes('찾을 수 없습니다'));
  else assert.equal(payloadOf(miss).majorFieldSlug, wrongField);
});

test('list_major_fields: 전 범위 수록 후 정적 미수록 note가 없다', async () => {
  const { client } = await connect();
  const payload = payloadOf(await client.callTool({ name: 'list_major_fields', arguments: {} }));
  assert.equal(payload.note, undefined);
  assert.ok(payload.fields.every((f) => f.includedCategories.includes('major-practical')));
});
```

`tests/data-store.test.mjs`에 (원문 수 검사 이동의 무오염 보증):

```js
test('원문 수 불일치 시 병합 전에 거부되어 집계가 오염되지 않는다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'voc-store-'));
  cpSync(dataDir, tmp, { recursive: true });
  const store0 = createStore(tmp);
  const slug = store0.includedFieldSlugs[0];
  // 원문 1건을 제거하고 manifest 해시를 재계산해 sha 게이트는 통과시키되 count 불변식만 깨뜨린다.
  const textsPath = join(tmp, 'fields', slug, 'standard-texts.json');
  const data = JSON.parse(readFileSync(textsPath, 'utf8'));
  data.texts.pop();
  const raw = Buffer.from(`${JSON.stringify(data, null, 1)}\n`);
  writeFileSync(textsPath, raw);
  const manifestPath = join(tmp, 'core', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.files[`fields/${slug}/standard-texts.json`] = {
    bytes: raw.byteLength,
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const store = createStore(tmp);
  assert.throws(() => store.ensureField(slug), /원문 수/);
  // 핵심: throw 후에도 집계가 비어 있어야 한다(부분 병합 잔류 금지).
  assert.equal(store.allStandards.length, 0);
  assert.equal(store.loadedFields.size, 0);
});
```

(이 테스트 파일 상단 import에 `createHash`를 추가: `import { createHash } from 'node:crypto';`)

- [x] **Step 3: RED 확인**

Run: `node --test tests/server.test.mjs tests/data-store.test.mjs`
Expected: 신규 3건 FAIL (get_standard가 majorField를 모름 / note 존재 / count 검사가 병합 후라 allStandards 잔류)

- [x] **Step 4: 구현**

**(a) `src/data-store.mjs`** — `ensureField` 내에서 4파일 `readVerified` 직후·병합 시작 전에 count 검사를 이동:

```js
    const expectedTexts = curricula.reduce((n, c) => n + c.standards.length, 0);
    if (texts.length !== expectedTexts) {
      throw new Error(
        `계열 ${slug}: 원문 수(${texts.length})가 성취기준 수(${expectedTexts})와 다릅니다 — pipeline/verify.mjs를 실행하세요.`
      );
    }
```

기존의 병합 후 `if (texts.length !== added) …` 블록과 `added` 카운터는 제거. `standardsByCode` 맵 선언·기입 3줄도 제거(Step 1에서 소비처 부재 확인됨).

**(b) `src/server.mjs`** —
- `get_standard` inputSchema에 `majorField: MAJOR_FIELD` 추가, 핸들러 시작을:

```js
    guarded(async ({ code, subject, majorField }) => {
      const slug = resolveMajorField(store, majorField);
      if (slug) store.ensureField(slug);
      else ensureScope(store, { subject });
      const normalized = normalizeCode(code);
      let all = store.standardsByCodeAll.get(normalized) ?? [];
      if (slug) all = all.filter((s) => s.majorFieldSlug === slug);
```

이하 로직(subject 소거·모호성·응답)은 기존 그대로 (`all` 변수를 이어서 사용).
- `list_major_fields` 응답의 정적 `note`(전공실무 미수록 안내) 필드 제거.
- `aboutText`의 범위 줄을 다음으로 교체:

```js
    '- 범위: 특성화고·마이스터고 전문교과 전 범위(전공일반·전공실무·전문공통). 보통교과·특목 계열은 korean-secondary-learning-map-mcp가 담당한다.',
```

- `get_standard` description의 "일부 코드는 두 과목이 공유할 수 있어 subject로 구분한다"를 "일부 코드는 여러 과목·계열이 공유할 수 있어 subject·majorField로 구분한다"로 갱신.

**(c) `src/search.mjs`** — 사어 필드 참조 제거:
- `matchesFilter(subject, s.subject, s.subjectKorean)` → `matchesFilter(subject, s.subjectKorean)` (searchStandards·searchStandardTexts)
- `matchesFilter(subject, t.subject, t.subjectKorean)` → `matchesFilter(subject, t.subjectKorean)` (searchTopics)
- `matchesFilter(domain, s.domain, s.domainKorean)` → `matchesFilter(domain, s.domainKorean)` (searchStandards)

- [x] **Step 5: GREEN + 전체 회귀**

Run: `node --test tests/server.test.mjs tests/data-store.test.mjs` → PASS
Run: `npm test` → 63 pass (60 + 신규 3)

- [x] **Step 6: 커밋**

```bash
git add src/server.mjs src/data-store.mjs src/search.mjs tests/server.test.mjs tests/data-store.test.mjs
git commit -m "refactor: v0.1 최종 리뷰 이연 반영 — get_standard majorField, count 검사 선행, 사어 인덱스·필드 제거, 전 범위 안내문"
```

---

### Task 6: 문서·버전 0.2.0

**Files:**
- Modify: `package.json`, `server.json`, `src/server.mjs`(SERVER_INFO), `README.md`, `CLAUDE.md`
- Create: `CHANGELOG.md`

**Interfaces:**
- Consumes: gates.json·manifest.json의 v0.2 실측값 — 문서의 `<…>` 자리는 그 값으로 치환(추정 금지).

- [x] **Step 1: 버전 bump 3곳** — `package.json` version 0.2.0, `server.json` version 2곳 0.2.0, `src/server.mjs` `SERVER_INFO.version` '0.2.0'.

- [x] **Step 2: README.md 갱신** — 수록 범위 절을 전 범위로 재작성:

```markdown
## 수록 범위 (v0.2)

- **전문교과 전 범위**: 전공일반 216 + 전공실무 309 + 전문공통 3 = 528과목, 성취기준 47,625건.
  모든 성취기준에 공식 원문(국가교육위원회 고시 제2024-3호 별책23~39) 수록.
- 주제 <manifest.counts.topics>건 · 클러스터 <실측>건 · 선수관계 <manifest.counts.dependencies>건(희소 — 공식 문서 명시분만).
- 보통교과·특목 계열은 [korean-secondary-learning-map-mcp](https://github.com/raphysicst-create/korean-secondary-learning-map-mcp) 사용.
```

첫 문단 요약 수치·패키지 크기 절(`npm pack --dry-run` 실측)도 갱신. "미수록·이후 버전" 문구는 전부 제거.

- [x] **Step 3: CLAUDE.md 갱신** — 첫 문단을 v0.2 수치로(528과목·47,625건·원문 전량·주제 실측), "전공실무 309과목은 미수록" 문구 삭제.

- [x] **Step 4: CHANGELOG.md 작성**

```markdown
# Changelog

## 0.2.0 — 2026-08-09

- 전공실무 309과목(성취기준 39,200건) 수록 — 전문교과 전 범위 완성 (528과목·47,625건·원문 100%)
- get_standard에 majorField 파라미터 추가 (계열 지정 조회)
- data-store: 원문 수 검사를 병합 전으로 이동(부분 병합 잔류 제거), 사어 인덱스 제거
- 추출 컷 패턴·listItem 판정 회귀 테스트 추가

## 0.1.0 — 2026-08-09

- 최초 공개: 전공일반 216 + 전문공통 3 = 219과목, 성취기준 8,425건(공식 원문 전량),
  18계열 분할 + 지연 로딩, MCP 도구 10종
```

- [x] **Step 5: 최종 검증**

Run: `npm test && npm run pipeline:verify` → 전체 통과
Run: `npm pack --dry-run` → 파일 구성(src/·data/·문서 5종) 확인 + tarball/unpacked 크기 README에 기록. tarball이 100MB를 넘으면 BLOCKED(예상: 압축 후 ~10-20MB).

- [x] **Step 6: 커밋**

```bash
git add package.json server.json src/server.mjs README.md CLAUDE.md CHANGELOG.md
git commit -m "docs: v0.2.0 — 전문교과 전 범위 수록 (버전 3곳 bump, CHANGELOG 신설)"
```

---

## 계획 자체 점검 노트

- **스펙 커버리지**: 단계 출시 절(전공실무 추가 = 게이트 갱신+원문 추출) → Task 2·3·4. 출시 범위=원문 범위 → Task 3 실패 0 + Task 4 verify. 이연 4건+서버 안내문 → Task 5. 선행 조건(컷 패턴 테스트) → Task 1이 Task 3보다 앞에 있음. 배포 3곳 bump → Task 6.
- **v0.1과 달리 서버·파이프라인 코드 본체는 거의 무변경** — 리스크는 Task 3(39,200건 추출)에 집중되며, Task 1의 회귀 테스트와 기존 verify 게이트가 안전망.
- **실측 의존 값**: 주제·선수관계·예외 건수·크기는 Task 2~4 실행에서 확정해 문서에 기입. 528·47,625·39,200은 v0.1 빌드에서 이미 상류 실측된 값.
- **미확정 리스크**: (a) 전공실무 조판이 전공일반과 달라 신규 컷 패턴이 필요할 수 있음 — 그 경우 Task 3 구현자는 패턴 추가 전 Task 1 테스트에 해당 케이스를 먼저 추가(RED)하고 패턴을 넣는다(GREEN). (b) 공유 코드가 전공실무에서 급증하면 pickVariant 소거 부하 — variants·disambiguated 로그로 관찰, 오배정 의심 시 표본 대조. (c) 전체 로드 메모리 — 테스트에서 실측, 문제 시 보고만(아키텍처가 이미 지연 로딩).
