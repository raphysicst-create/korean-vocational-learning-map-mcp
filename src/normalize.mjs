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
// 2단 `[간기 01-01]`(약칭+공백+NN-NN), 3단 `[3개 01-01-01]`(NCS 능력단위-요소-준거).
// 약칭은 숫자로 시작할 수 있다('3개' = 3D 프린터 개발). 공백 없는 보통교과 코드는 null.
// `kind`는 코드 **형식**만 뜻하며 과목 카테고리와 1:1이 아니다 — 2026-08-08 상류 실측 결과
// 전공일반(major-general) 216과목 중 124과목이 3단 코드를 쓴다. 카테고리 판정에 쓰지 말 것.
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
