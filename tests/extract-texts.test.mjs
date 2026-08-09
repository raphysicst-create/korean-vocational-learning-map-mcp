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

test('codePattern은 하이픈이 대시 이형으로 조판된 코드도 잡는다', () => {
  // 별책26(미용)은 일부 코드의 첫 하이픈을 엔 대시(U+2013)로 조판한다(실측 24건).
  assert.ok(codePattern('[네일 04-01-02]').test('[네일 04–01-02]')); // 엔 대시
  assert.ok(codePattern('[메크 14-01-02]').test('[메크 14–01–02]')); // 전부 대시여도
  assert.ok(codePattern('[네일 04-01-02]').test('[네일 04-01-02]'));     // 원형 유지
  assert.ok(!codePattern('[네일 04-01-02]').test('[네일 04-01-03]'));
});

test('extractTexts: 대시 이형 코드의 본문도 절취한다', () => {
  const pdf = [
    '[네일 04-01-01] 고객의 요청에 따라 적합한 네일 길이와 모양을 만들 수 있다.',
    '[네일 04–01-02] 네일 상태에 따라 표면을 정리하여 밀착력을 높일 수 있다.',
    '<성취기준 적용 시 고려 사항>',
  ].join('\n');
  const { texts, failures } = extractTexts(pdf, ['[네일 04-01-01]', '[네일 04-01-02]']);
  assert.equal(failures.length, 0);
  assert.equal(texts.get('[네일 04-01-01]'), '고객의 요청에 따라 적합한 네일 길이와 모양을 만들 수 있다.');
  assert.equal(texts.get('[네일 04-01-02]'), '네일 상태에 따라 표면을 정리하여 밀착력을 높일 수 있다.');
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
