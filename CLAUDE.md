# CLAUDE.md

한국 특성화고 전문교과 2022 개정 교육과정 학습 그래프 MCP 서버 (npm: `korean-vocational-learning-map-mcp`, 레지스트리: `io.github.raphysicst-create/korean-vocational-learning-map-mcp`). v0.2 수록: 전공일반 216 + 전공실무 309 + 전문공통 3 = 528과목(전문교과 전 범위), 성취기준 47,625건(공식 원문 전량), 주제 47,625건, 17계열 + 전문공통. stdio 완전 로컬, 도구 10종.

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

1. 버전 bump — **파일 4개, 값 6곳**: `package.json`, `package-lock.json`(최상위 `version` + `packages[""].version`), `server.json`(서버·packages), `src/server.mjs`의 `SERVER_INFO.version`. 하나라도 빠지면 게시본과 어긋난다 (0.3.0 때 `package-lock.json`이 0.2.0으로 남아 있었다).
2. `npm test && npm run pipeline:verify`
3. `npm publish --browser=false` (2FA)
4. `mcp-publisher publish` (릴리스 바이너리 사용)

## 관련 저장소

- 기반 데이터셋(MIT): https://github.com/DECK6/korean-secondary-learning-map — 고정 커밋은 `pipeline/sources.json`
- 보통교과·특목 계열: https://github.com/raphysicst-create/korean-secondary-learning-map-mcp
