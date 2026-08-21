#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRoman } from '../src/normalize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const SECTION_CUT_PATTERNS = [
  /\(\s*[가나다라]\s*\)/,
  /성취기준\s*해설/,
  /적용\s*시\s*고려/,
  // <탐구 활동>·<진로 활동>은 성취기준 본문이 아닌 별도 하위 절이므로 잘라낸다.
  /<\s*[가-힣]{1,4}\s*활동\s*>/,
  // 수학과의 하위 주제 머리글(예: "◆ 정수와 유리수")은 심벌 폰트라 U+FFFD로 추출된다.
  // 본문 안에도 U+FFFD가 섞일 수 있으므로(수식 기호 등) 줄 첫머리인 경우만 절취한다.
  /(?:^|\n)[ \t]*\uFFFD/,
  // ── 이하 전문교과(별책23~39) 조판 전용 컷. 실측 근거: 1차 추출에서 8,425건 중
  // 2,945건에 아래 형태의 꼬리가 혼입됐다(성취기준 본문만 수록한다는 원칙 위반). ──
  // 고려 사항 헤딩이 '<성취기준 적용 시 고려 사항>' 형태라 '적용 시 고려' 컷만으로는
  // '<성취기준 ' 조각이 남는다(2,238건). '적용 고려 사항' 변형(별책37)도 이걸로 잡힌다.
  /<\s*성취기준/,
  // 성취기준 목록 사이의 내용 헤딩(예: '2) 산업 곤충의 종류', '나) 곤충의 생리 및 생태')은
  // 괄호 없는 '숫자)'·'글자)' 형식이라 기존 '(가)' 컷에 걸리지 않는다. 줄 첫머리만 절취한다.
  /(?:^|\n)[ \t]*\d{1,2}\s*\)\s/,
  /(?:^|\n)[ \t]*[가-힣]\s*\)\s/,
  // 헤딩 없이 고려 사항 글머리표(•)가 바로 이어지는 과목이 있다(별책31 세라믹 등).
  /(?:^|\n)[ \t]*•/,
  // 과목의 마지막 성취기준 뒤에는 헤딩 없이 '3. 교수‧학습' 절이 바로 온다(가운뎃점 이형 다수).
  /(?:^|\n)[ \t]*\d\s*\.\s*교수/,
  // 전공일반 과목이 NCS 능력단위의 일부 코드만 발췌 수록하는 경우, 다음 성취기준 행이
  // expectedCodes에 없어 절취 경계가 되지 못하고 딸려 들어온다(실측 12건). 줄 첫머리의
  // 코드 행([약칭 NN-NN…)에서 자른다 — 본문 문장 안에는 코드 상호참조가 나타나지 않는다.
  // 하이픈은 codePattern과 같은 정책으로 대시 이형까지 허용한다(별책26 등이 엔 대시 조판).
  /(?:^|\n)[ \t]*\[\S{1,8}\s?\d{2}\s*[-‐‑–—−]\s*\d{2}/,
];
// 컷 지점을 순회 탐색하려면 g 플래그가 필요하다. `^`는 (m 플래그가 없으므로) lastIndex가
// 0보다 클 때 절대 매치되지 않아, 재탐색이 줄 첫머리 조건을 무너뜨리지 않는다.
const SECTION_CUT_PATTERNS_G = SECTION_CUT_PATTERNS.map((p) => new RegExp(p.source, `${p.flags}g`));
const MAX_TEXT = 700;
const FALLBACK_WINDOW = 1200;
// 쪽 번호(아라비아 숫자 또는 앞부속의 로마자 소문자)만 있는 줄.
const PAGE_NUMBER_LINE = /^(?:\d{1,4}|[ivxlcdm]{1,7})$/i;
// 같은 문자열이 이 횟수 이상 쪽 첫 줄로 반복되면 머리글(running head)로 본다.
const RUNNING_HEAD_MIN_REPEAT = 3;
// 유니코드 사용자 정의 영역(Private Use Area) — 매핑되지 않은 수식 글리프.
const UNMAPPED_GLYPH = /[\uE000-\uF8FF]/;

export function normalizeWhitespace(value) {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * pdftotext -layout 출력에서 쪽 머리글·쪽 번호를 제거한다.
 * 별책 PDF는 쪽마다 첫 줄이 머리글(과목명/'고등학교 교육과정'), 마지막 줄이 쪽 번호라
 * 그대로 두면 쪽 경계를 넘는 성취기준 본문에 "226 과학" 같은 조각이 섞여 들어간다.
 * 머리글 목록을 하드코딩하지 않고 "여러 쪽에서 반복되는 첫 줄"로 판정한다.
 */
export function stripPageFurniture(rawText) {
  const pages = rawText.split('\f');
  if (pages.length < RUNNING_HEAD_MIN_REPEAT) return rawText;

  const headCount = new Map();
  for (const page of pages) {
    const first = page.split(/\r?\n/).find((line) => line.trim());
    if (first) headCount.set(first.trim(), (headCount.get(first.trim()) ?? 0) + 1);
  }

  return pages
    .map((page) => {
      const lines = page.split(/\r?\n/);
      let start = 0;
      while (start < lines.length && !lines[start].trim()) start += 1;
      if (start < lines.length && (headCount.get(lines[start].trim()) ?? 0) >= RUNNING_HEAD_MIN_REPEAT) {
        lines[start] = '';
      }
      let end = lines.length - 1;
      while (end >= 0 && !lines[end].trim()) end -= 1;
      if (end >= 0 && PAGE_NUMBER_LINE.test(lines[end].trim())) lines[end] = '';
      return lines.join('\n');
    })
    .join('\n');
}

/** 코드가 줄 첫머리에 오는지(= 성취기준 목록 항목인지) 판정. 앞에 글머리표 •가 있으면 해설 항목이다. */
function isListItem(text, idx) {
  for (let i = idx - 1; i >= 0 && text[i] !== '\n'; i -= 1) {
    if (!/\s/.test(text[i])) return false;
  }
  return true;
}

/**
 * 컷 후보 지점 앞 구간에 닫히지 않은 여는 괄호가 남아 있는지.
 * 여는 괄호가 열린 채라면 그 지점의 ')'는 헤딩 기호가 아니라 괄호구의 일부다.
 * 짝 없는 닫는 괄호로 깊이가 음수가 되지 않게 0에서 막아, 뒤따르는 진짜 괄호구를 가리지 않는다.
 */
function hasUnclosedParen(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(' || ch === '（') depth += 1;
    else if (ch === ')' || ch === '）') depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

export function sliceStandardText(fullText, startIdx, endIdx) {
  let chunk = fullText.slice(startIdx, endIdx);
  for (const pattern of SECTION_CUT_PATTERNS_G) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(chunk)) !== null) {
      // PDF가 괄호구를 줄바꿈으로 갈라 닫는 괄호가 줄 첫머리에 오면('밀링(머시닝센 / 터)')
      // 헤딩 컷으로 오인해 본문이 단어 중간에서 잘린다(실측 3건). 앞 구간의 괄호가
      // 열린 채면 이 지점은 헤딩이 아니므로 건너뛰고 다음 후보를 본다.
      // 진짜 헤딩('나) 곤충의 생리')은 앞에 열린 괄호가 없어 그대로 잘린다.
      if (!hasUnclosedParen(chunk.slice(0, m.index))) {
        chunk = chunk.slice(0, m.index);
        break;
      }
      pattern.lastIndex = m.index + 1;
    }
  }
  return normalizeWhitespace(chunk);
}

// 코드 내 공백을 \s* 로 바꾼 정규식. 전문교과 코드([간기 01-01])는 PDF 조판에서
// 공백이 사라지거나 줄바꿈으로 갈라질 수 있다.
// 하이픈도 대시 이형으로 조판될 수 있다 — 실측: 별책26(미용)이 24건([네일] 22·[메크] 2)의
// 첫 하이픈을 엔 대시(U+2013)로 조판. 유사 이형(U+2010·2011·2014·2212)까지 함께 허용한다.
// 본문 텍스트는 건드리지 않고 코드 대조 시에만 허용하므로 추출 원문은 원본 그대로 남는다.
export function codePattern(code) {
  const escaped = normalizeRoman(String(code).normalize('NFC'))
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/-/g, '[-‐‑–—−]')
    .replace(/(\\\s|\s)+/g, '\\s*');
  return new RegExp(escaped, 'g');
}

export function findCodePositions(pdfTextNorm, codes) {
  const positions = [];
  for (const code of codes) {
    const re = codePattern(code);
    let m;
    while ((m = re.exec(pdfTextNorm)) !== null) {
      // 줄 첫머리라도 코드 뒤에 조사·쉼표가 붙으면(예: '[산잠 03-01-06]과 연계하여 지도한다')
      // 고려 사항 상호참조가 줄바꿈으로 갈라진 조각이다 — 진짜 목록 항목은 코드 뒤가 공백이다.
      const after = pdfTextNorm[m.index + m[0].length];
      positions.push({
        code, start: m.index, end: m.index + m[0].length,
        listItem: isListItem(pdfTextNorm, m.index) && (after === undefined || /\s/.test(after)),
      });
      re.lastIndex = m.index + 1;
    }
  }
  positions.sort((a, b) => a.start - b.start);
  return positions;
}

/** 한 코드 출현 지점에서 다음 코드 직전까지를 본문으로 잘라낸다. */
function sliceFrom(norm, positions, pos) {
  const next = positions.find((p) => p.start > pos.end);
  const endIdx = next ? next.start : Math.min(norm.length, pos.end + FALLBACK_WINDOW);
  return sliceStandardText(norm, pos.end, endIdx);
}

/**
 * 반환값의 texts는 코드당 하나(첫 목록 항목)지만, variants에는 목록 항목마다의 본문이 모두 담긴다.
 * 서로 다른 과목이 같은 코드를 쓰는 경우가 있어 호출 측에서 과목별로 골라 쓸 수 있게 한다.
 */
export function extractTexts(pdfText, expectedCodes) {
  const norm = normalizeRoman(stripPageFurniture(pdfText).normalize('NFC'));
  const positions = findCodePositions(norm, expectedCodes);
  const texts = new Map();
  const variants = new Map();
  const failures = [];
  const seen = new Set();
  for (const code of expectedCodes) {
    if (seen.has(code)) continue;
    seen.add(code);
    const own = positions.filter((p) => p.code === code);
    // 성취기준 목록 항목(줄 첫머리)을 우선한다. 해설 안의 상호참조가 앞서 나올 수 있기 때문.
    const listItems = own.filter((p) => p.listItem);
    const usable = listItems.length ? listItems : own.slice(0, 1);
    if (!usable.length) { failures.push({ code, reason: 'code-not-found' }); continue; }
    const candidates = usable.map((pos) => sliceFrom(norm, positions, pos));
    variants.set(code, candidates.filter(Boolean));
    const text = candidates[0];
    if (!text) { failures.push({ code, reason: 'empty-after-slice' }); continue; }
    if (text.length > MAX_TEXT) { failures.push({ code, reason: 'suspiciously-long', preview: text.slice(0, 80) }); continue; }
    // 수식이 심벌 폰트로 조판된 성취기준은 사용자 정의 영역(PUA) 글자로 추출된다.
    // 그대로 두면 깨진 문자가 남으므로 미해결로 보고해 exceptions.json에 원문을 받도록 한다.
    if (UNMAPPED_GLYPH.test(text)) { failures.push({ code, reason: 'unmapped-glyph', preview: text.slice(0, 80) }); continue; }
    texts.set(code, text);
  }
  return { texts, failures, variants };
}

/** 비교용 압축 표기 — 공백·문장부호를 제거해 조판 차이를 무시한다. */
function compactForCompare(value) {
  return normalizeRoman(String(value ?? '').normalize('NFC')).replace(/[\s⋅·,.()]/g, '');
}

/** 요약문과의 앞부분 일치 비율. 요약문은 어미만 바꾼 기계적 파생물이라 접두 일치가 잘 통한다. */
export function summarySimilarity(text, summary) {
  const a = compactForCompare(text);
  const b = compactForCompare(summary);
  if (!a || !b) return 0;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i / b.length;
}

/** 같은 코드를 여러 과목이 공유할 때, 해당 과목의 요약문과 가장 잘 맞는 본문을 고른다. */
export function pickVariant(candidates, summary, used = new Set()) {
  let best = null;
  let bestScore = -1;
  for (const [i, candidate] of candidates.entries()) {
    const score = summarySimilarity(candidate, summary) - (used.has(i) ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best === null ? null : { index: best, text: candidates[best] };
}

function pdftotext(pdfPath) {
  return execFileSync('pdftotext', ['-enc', 'UTF-8', '-layout', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
}

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
        '국가교육위원회 고시 제2024-3호 초·중등학교 교육과정 별책23~39 PDF에서 추출한 성취기준 본문. 저작권법 제7조 제2호에 따라 보호받지 않는 고시 원문이며 정확성·추적성을 위해 출처를 표기한다.',
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
