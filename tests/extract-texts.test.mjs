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
