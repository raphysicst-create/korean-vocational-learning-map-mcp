# korean-vocational-learning-map-mcp 설계

2026-08-08 확정. 한국 특성화고·마이스터고 전문교과 2022 개정 교육과정(국가교육위원회 고시 제2024-3호) 학습 그래프 MCP 서버.

## 목적

교사·학생·AI가 특성화고 전문교과의 성취기준, 세부 학습 주제, 계열·과목 구조를 MCP 도구로 조회할 수 있게 한다. 초등판·중등판과 동일한 사용 경험·품질 기준(공식 원문 전량 수록, stdio 완전 로컬 동작)을 전문교과에서 재현한다. 보통교과·특목 계열은 [korean-secondary-learning-map-mcp](../../../../korean-secondary-learning-map-mcp/) 영역이므로 제외 — 두 서버의 수록 범위는 겹치지 않는다.

## 데이터 원천

| 원천 | 내용 | 입수 방식 |
|---|---|---|
| [DECK6/korean-secondary-learning-map](https://github.com/DECK6/korean-secondary-learning-map) (MIT) | 전문교과 성취기준·과목·영역·주제·클러스터 정규화 JSON — `data/kr/high/*.json`에 보통교과와 통합 수록, `courseCategory`로 구분 | 파이프라인이 고정 커밋 SHA에서 다운로드 → `.cache/` (git 미추적) |
| 별책23~39 PDF 17권 (국교위 고시 제2024-3호, 2024.8.16.) | 전문교과 성취기준 원문 (계열별 1권) | **NCIC에서 다운로드** — URL·SHA-256은 상류 `data/kr/shared/source-manifest.json`에 전부 수록. `PDF_DIR`에 저장, 커밋하지 않음 |

주의: 작업 폴더에 있는 별책23~39 로컬 PDF 17권은 **교육부 고시 제2022-33호 구판이므로 사용 금지**. 반드시 상류 매니페스트의 2024-3호 개정판을 받는다.

## 범위 (확정)

**포함** — `courseCategory` 3종, 총 548과목, 성취기준 47,625건(고교 전체의 93.8%), 17개 계열(별책23~39와 1:1):

| courseCategory | 한국어 | 과목 수 | 코드 형식 |
|---|---|---|---|
| major-general | 전공일반 | 159 | `[약칭 NN-NN]` (예: `[간기 01-01]`) |
| major-practical | 전공실무 | 387 | `[약칭 NN-NN-NN]` (NCS 3단계, 예: `[3개 01-01-01]`) |
| specialized-common | 전문공통 | 2 | 빌드 시 확인 |

**제외**: 보통교과·특목 계열(중등판 수록), 중→고 전이·과목 선후 데이터(전문교과에 없음).

**단계 출시**: 아키텍처는 전체 47,625건을 감당하도록 설계하되 출시는 단계적으로 한다.

- v0.1.0 — 전공일반 159과목 + 전문공통 2과목. 코드체계가 단순하고 17권 PDF의 전공일반 장만 추출하면 된다.
- v0.2.0+ — 전공실무를 계열 단위로 추가(묶음 크기·순서는 수요에 따라 결정). 계열 하나 추가 = `data/kr/fields/` 폴더 하나 + 게이트 표 갱신 + 원문 추출.

**출시 범위 = 원문 범위**: 수록된 성취기준은 반드시 공식 원문을 포함한다. 원문 추출이 안 끝난 계열은 출시하지 않는다. 카테고리·계열별 정확한 성취기준 수는 빌드 시 상류 데이터로 확정해 게이트 표에 기록한다(사전 추정치를 게이트로 쓰지 않는다).

**주제(topics) 전량 포함**: 상류 주제는 기계 파생(candidate·mechanical-derivative)이지만 트리밍 없이 전량 수록한다. 근거: (1) 템플릿 반복 텍스트는 gzip 압축률이 극히 높아 배포 부담이 작고, (2) 계열별 분할로 메모리가 사용 계열에 비례하며, (3) 스키마를 중등판과 동일하게 유지해야 포크 코드 재사용이 최대화된다. 기계 파생 상태는 README에 명시한다.

## 아키텍처 (A안: 중등판 포크 + 계열별 분할 + 지연 로딩)

중등판의 계층 구조를 계승: data-store(로드·인덱스·해시 검증) → search/graph/roadmap(순수 함수) → server(도구 정의) → cli(stdio 진입점). 역방향 의존 금지. 순수 ESM `.mjs`, TypeScript·빌드 금지, 런타임 의존성 `@modelcontextprotocol/sdk` + `zod` 2종만, Node ≥ 20.11. stdout은 MCP 프로토콜 전용, 사람용 로그는 `console.error`.

중등판과의 유일한 구조적 차이는 **data-store의 지연 로딩**이다. 규모가 12~16배이므로 단일 파일 전체 로드(기동 메모리 400~600MB)를 피하고, 데이터를 계열 단위로 분할해 요청 시 로드한다.

```
korean-vocational-learning-map-mcp/
├── src/
│   ├── cli.mjs               # stdio 진입점
│   ├── server.mjs            # 도구 10종 정의
│   ├── data-store.mjs        # core 즉시 로드 + 계열별 지연 로드·해시 검증·캐시
│   ├── normalize.mjs         # NFC + 전문교과 코드 공백 유연 매칭
│   ├── search.mjs            # 성취기준·원문·주제 검색
│   ├── graph.mjs             # 선수관계 (희소)
│   └── roadmap.mjs           # 계열·과목 로드맵
├── data/kr/
│   ├── core/                 # 기동 시 항상 로드 (~1MB)
│   │   ├── major-fields.json # 17계열+전문공통: 이름·별책·과목수·성취기준수·수록여부
│   │   ├── curricula.json    # 548과목 색인 (계열 슬러그·카테고리·성취기준 수)
│   │   ├── dependencies.json # 선수관계 — 계열 교차 엣지 가능·극소량이라 core에 통합 보관
│   │   └── manifest.json     # 전 파일 SHA-256
│   └── fields/<계열-슬러그>/  # 조회 시 지연 로드 (중등판과 동일 스키마)
│       ├── curriculum-standards.json
│       ├── standard-texts.json
│       ├── topics.json
│       └── clusters.json
├── pipeline/                 # 개발 시에만 실행
│   ├── fetch-sources.mjs
│   ├── extract-texts.mjs
│   ├── build-data.mjs
│   ├── verify.mjs
│   ├── sources.json          # DECK6 커밋·파일 해시 + NCIC PDF 17권 URL·SHA-256
│   ├── gates.json            # 계열·카테고리별 성취기준 수 고정표 (단계 출시마다 갱신)
│   └── exceptions.json       # PDF 추출 실패분 수동 보정
├── tests/
└── package.json, server.json, README.md, LICENSE, NOTICE.md, CLAUDE.md
```

### 지연 로딩 동작

- 기동 시 `core/` 3개 파일만 로드하고 manifest 해시를 검증한다. 불일치 시 기동 거부(한국어 오류, 재설치 안내).
- 계열 데이터는 해당 계열을 처음 조회하는 시점에 로드하며, 로드 시 manifest의 SHA-256과 대조한다. 불일치 시 해당 요청을 오류로 반환(서버는 유지).
- 로드된 계열은 프로세스 종료까지 캐시한다. 메모리는 사용 계열 수에 비례한다(전 계열 로드 시 ≈ 전량 로드와 동일 — 허용).
- **미수록 계열**(단계 출시 중)은 core 색인에 `included: false`로 존재하며, 조회 시 "v0.x에서 추가 예정" 안내를 반환한다.

### 검색 의미론

검색 도구는 선택 파라미터 `major_field`(계열 슬러그)를 받는다. 지정 시 해당 계열만 로드해 검색하고, 미지정 시 수록된 전 계열을 순차 지연 로드 후 검색한다(첫 전역 검색 때만 전체 로드 비용 지불, 이후 캐시). ID 체계·레코드 스키마는 중등판과 동일하게 유지한다: topic ID·cluster ID는 DECK6 원본 유지(재채번 금지), curriculum ID는 읽을 수 있는 슬러그(`kr-2022-voc-<과목슬러그>` 형식), 성취기준 key는 `<curriculumId>:[코드]`.

## 코드체계·정규화

전문교과 성취기준 코드는 보통교과와 다르다 — 파서·정규화 재설계가 이 프로젝트의 핵심 신규 작업이다.

| 구분 | 형식 | 예 | 비고 |
|---|---|---|---|
| 보통교과 (중등판) | `[9기가01-01]` | 공백 없음 | 학년 접두 |
| 전공일반 | `[약칭 NN-NN]` | `[간기 01-01]` | 괄호 안 공백, 학년 접두 없음 |
| 전공실무 | `[약칭 NN-NN-NN]` | `[3개 01-01-01]` | NCS 3단계(능력단위-요소-준거 대응) |

- 코드 매칭은 **괄호 안 공백 유연 처리**: `[간기01-01]`로 입력해도 `[간기 01-01]`에 매칭. NFC 정규화 유지. 로마숫자 정규화는 중등판 것을 계승(전문교과 과목명에도 등장 가능).
- 과목 약칭이 숫자로 시작할 수 있음(`3개` = "3D 프린터 개발")을 파서가 허용한다.
- 약칭의 계열 간 충돌 가능성은 중등판의 `standardsByCodeAll`(코드당 배열) 패턴으로 흡수 — `get_standard`는 `major_field`·`subject`로 소거.
- 상류에 NCS 세분류 코드(예: `1901010101_14v2`)가 있는지는 구현 단계에서 확인한다. 있으면 성취기준 레코드에 보존하되, **전용 조회 도구는 데이터 확인 전에는 만들지 않는다.**

## 도구 10종

계승 9종 (중등판에서 포팅, `school_level` 파라미터 제거, 선택 파라미터 `major_field` 추가):

1. `list_curricula` — 기본은 계열 단위 요약(과목 수·성취기준 수), 계열 지정 시 과목 목록 상세.
2. `search_standards` — 코드 정확 일치 우선 + 키워드 검색.
3. `search_standard_text` — 수록 원문 전문 검색.
4. `get_standard` — 전체 레코드 + 원문 + 연결 주제. 전공실무 코드는 NCS 3단계 구조 해석(능력단위-요소-준거 번호)을 응답에 포함.
5. `search_topics` — 주제 검색.
6. `get_topic` — 주제 상세(관찰 증거·평가 발문 포함 — 중등판 동일. 기계 파생임을 응답에 명시).
7. `get_prerequisites` — 선수/후속 관계. 도구 설명에 "전문교과는 공식 선수관계가 희소함(문서에 명시가 없는 게 정상)"을 명시.
8. `get_learning_roadmap` — 계열·과목 기준 영역→모듈 로드맵.
9. `list_clusters` — 단원 묶음 조회.

신규 1종:

10. `list_major_fields` — 17계열+전문공통 개요: 이름·별책 근거·과목 수·성취기준 수·**수록 여부**. 단계 출시 중 미수록 계열을 여기서 투명하게 안내한다.

제외 2종: `get_transitions`·`get_course_pathway` — 전이·과목 선후 데이터가 전문교과에 없다.

검색 규칙(중등판 계승): NFC 정규화 + 부분 문자열 일치(형태소 분석기 금지), limit 기본 20 최대 50, 결과 없으면 유사 후보 제안. 도구 이름 영어 snake_case, 설명·에러 메시지 한국어.

## 파이프라인

`fetch → build → extract → verify` 순서 고정. `data/kr/**`는 커밋되므로 일반 개발에는 재현 불필요.

1. `fetch-sources.mjs` — DECK6 고정 커밋에서 `data/kr/high/*.json` + `data/kr/shared/*.json` 다운로드 → `.cache/`. NCIC 별책23~39 PDF 17권을 상류 source-manifest의 URL로 다운로드 → `PDF_DIR`. 모든 입력의 SHA-256을 `sources.json`과 대조, 불일치 시 중단.
2. `extract-texts.mjs` — pdftotext -layout으로 원문 추출. 전공일반 2단·전공실무 3단 코드 패턴 대응. 성취기준 본문 문장만(해설·적용 시 고려사항 제외 — 기존 정책 동일). 패턴 실패분은 `exceptions.json` 수동 보정.
3. `build-data.mjs` — `courseCategory ∈ {major-general, major-practical, specialized-common}` 필터 → 계열별 분할 산출. 계열 슬러그는 아래 확정 표를 따른다. 전문공통 과목의 소속 별책·배치는 빌드에서 확인해 확정. 출시 범위 밖 계열은 산출하지 않되 core 색인에는 `included: false`로 기록.

   | 별책 | 계열 | 슬러그 |
   |---|---|---|
   | 23 | 경영·금융 | `business-finance` |
   | 24 | 보건·복지 | `health-welfare` |
   | 25 | 문화·예술·디자인·방송 | `culture-arts-design-broadcast` |
   | 26 | 미용 | `beauty` |
   | 27 | 관광·레저 | `tourism-leisure` |
   | 28 | 식품·조리 | `food-cooking` |
   | 29 | 건축·토목 | `construction-civil` |
   | 30 | 기계 | `machinery` |
   | 31 | 재료 | `materials` |
   | 32 | 화학공업 | `chemical-industry` |
   | 33 | 섬유·의류 | `textile-clothing` |
   | 34 | 전기·전자 | `electrical-electronics` |
   | 35 | 정보·통신 | `information-communication` |
   | 36 | 환경·안전·소방 | `environment-safety-fire` |
   | 37 | 농림·축산 | `agriculture-livestock` |
   | 38 | 수산·해운 | `fisheries-shipping` |
   | 39 | 융복합·지식재산 | `convergence-ip` |
4. `verify.mjs` — `gates.json` 기반 전수 게이트: (a) 수록 계열·카테고리별 성취기준 수가 고정표와 일치, (b) 원문 수 = 수록 성취기준 수, (c) 주제·클러스터·선수관계의 참조 무결성(모든 ID 실재), (d) 미수록 계열 데이터 부재 확인. 통과 시에만 `manifest.json` SHA-256 기록. **데이터 변경 후 필수.**

## 오류 처리

- 기동 시 core manifest 해시 재검증 — 불일치 시 기동 거부.
- 계열 파일은 지연 로드 시점에 해시 검증 — 불일치 시 해당 요청만 오류(서버 유지).
- 미수록 계열 조회 시 수록 예정 안내(`list_major_fields` 참조 유도).
- 존재하지 않는 코드·ID 조회 시 유사 후보 제안(공백 유연 매칭 포함).

## 테스트

중등판 63개 테스트를 전문교과 데이터 기대값으로 포팅 + 신규: 지연 로딩(미로드 계열 조회 시 로드, 해시 불일치 시 거부), 공백 유연 코드 매칭(2단·3단), `gates.json` 게이트, `list_major_fields`, 미수록 계열 응답, NCS 코드 구조 해석. 목표 75개 내외. `node --test tests/*.test.mjs`.

## 배포

- GitHub 공개 저장소 + `npm publish --browser=false`(2FA) + mcp-publisher(릴리스 바이너리 사용, 미설치 상태 주의)로 MCP 레지스트리 등록. 레지스트리명 `io.github.raphysicst-create/korean-vocational-learning-map-mcp`.
- 버전 bump 3곳 동시: `package.json` + `server.json`(서버·packages) + `src/server.mjs`의 `SERVER_INFO.version`.
- 라이선스 MIT. NOTICE.md에 DECK6(MIT) 출처, 교육과정 원문의 공공저작물 근거(저작권법 제24조의2), 국가교육위원회 고시 제2024-3호 표기. 상류 주제 데이터의 기계 파생(candidate) 상태를 README에 명시.
- 용량 전망: 전량 수록 시 원시 JSON 약 110~130MB, tarball 압축 후 15~20MB 수준(템플릿 텍스트 고압축). v0.1은 이보다 훨씬 작다.

## 결정 로그

| 결정 | 선택 | 근거 |
|---|---|---|
| 범위 | 전체 설계 + 단계 출시 (v0.1 전공일반+전문공통 → 전공실무 계열별) | 리스크 분산, 아키텍처는 전체 감당 |
| 원문 | 출시 범위 = 원문 범위 | "수록된 것은 반드시 원문 포함" 품질 기준 유지 |
| 주제 | 전량 포함 (트리밍 없음) | gzip 고압축·계열별 분할로 비용 완화, 스키마 동일성 = 포크 재사용 최대화 |
| 아키텍처 | 중등판 포크 + 계열별 분할·지연 로딩 | 규모 12~16배 대응, 단계 출시와 구조 일치 |
| 도구 | 9종 계승 + list_major_fields, transitions·pathway 제외 | 전문교과 데이터 실재에 맞춤 |
| NCS 전용 도구 | 보류 | 상류 NCS 세분류 코드 실재 확인 전 설계 금지 |
| PDF 판본 | 로컬 구판 금지, 상류 매니페스트의 2024-3호만 | 구판은 코드·문장이 상류 기준선과 어긋남 |
| 패키지 | korean-vocational-learning-map-mcp 독립 배포 | 초등·중등판과 대칭, 규모상 분리 타당 |
