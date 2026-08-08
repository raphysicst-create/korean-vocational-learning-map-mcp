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

test('parseVocationalCode: 전공일반 2단 코드', () => {
  assert.deepEqual(parseVocationalCode('[간기 01-01]'), {
    abbrev: '간기', numbers: ['01', '01'], kind: 'major-general',
  });
});

test('parseVocationalCode: 전공실무 NCS 3단 코드 (숫자 시작 약칭 허용)', () => {
  assert.deepEqual(parseVocationalCode('[3개 01-02-03]'), {
    abbrev: '3개', numbers: ['01', '02', '03'], kind: 'major-practical',
    ncs: { unit: '01', element: '02', criterion: '03' },
  });
});

test('parseVocationalCode: 보통교과·비정형 코드는 null', () => {
  assert.equal(parseVocationalCode('[9과01-01]'), null);
  assert.equal(parseVocationalCode('아무말'), null);
  assert.equal(parseVocationalCode(''), null);
});
