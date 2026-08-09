# korean-vocational-learning-map-mcp

한국 특성화고·마이스터고 전문교과 2022 개정 교육과정(국가교육위원회 고시 제2024-3호) 학습 그래프 MCP 서버.
성취기준 47,625건(전문교과 전 범위, 공식 원문 전량 수록) · 주제 47,625건 · 17계열 + 전문공통을 패키지에 내장하고 stdio로 완전 로컬 동작한다. 도구 10종.

## 설치

```json
{ "mcpServers": { "korean-vocational-learning-map": {
  "command": "npx", "args": ["-y", "korean-vocational-learning-map-mcp"] } } }
```

## 수록 범위 (v0.2)

- **전문교과 전 범위**: 전공일반 216 + 전공실무 309 + 전문공통 3 = 528과목, 성취기준 47,625건.
  모든 성취기준에 공식 원문(국가교육위원회 고시 제2024-3호 별책23~39) 수록.
- 주제 47,625건 · 클러스터 4,480건 · 선수관계 288건(희소 — 공식 문서 명시분만).
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

## 패키지 크기

`npm pack --dry-run` 기준 tarball 10.4MB(압축) / unpacked 122.3MB, 총 87개 파일(`src/` 7 · `data/` 76 · README·LICENSE·NOTICE·package.json). `src/`·`data/`·README·LICENSE·NOTICE만 포함.
