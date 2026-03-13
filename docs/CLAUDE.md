# CLAUDE.md - MemoDoc 개발 가이드

Claude Code가 이 프로젝트를 작업할 때 참고하는 지침.

---

## 프로젝트 목적

업무 메모 → 6가지 지식 문서 자동 변환. 서버 없이 브라우저 단독 실행.

---

## 생성해야 하는 결과 종류

| tabId | 내용 |
|---|---|
| `summary` | 핵심 bullet point 요약 |
| `concepts` | 주요 용어 + 정의 + 맥락 |
| `document` | 마크다운 공식 문서 |
| `diagram` | Mermaid 다이어그램 |
| `steps` | Step-by-step 가이드 |
| `design` | 설계 활용 포인트 + 체크리스트 |

---

## 출력 형식

- 모든 출력은 마크다운
- `diagram` 탭은 반드시 ` ```mermaid ``` ` 코드 블록 포함
- 한국어로 작성
- 불필요한 인사말/서론 없이 바로 본문 시작

---

## 문서 스타일

- 업무 문서 톤 (격식체 아님, 명확하고 간결하게)
- 섹션 제목은 `##`, `###` 사용
- 목록은 `-` bullet point 또는 번호
- 표는 마크다운 테이블 형식

---

## 구현 방향

- **파일:** `hackathon.html`, `hackathon.css`, `hackathon.js`
- **API:** OpenRouter (`https://openrouter.ai/api/v1/chat/completions`)
- **모델:** `google/gemini-2.0-flash-exp:free`
- **스트리밍:** `stream: true`, `choices[0].delta.content` 파싱
- **렌더링:** marked.js (마크다운), mermaid.js (다이어그램) — CDN만 사용
- **저장:** API 키는 `localStorage`만 사용, 외부 전송 없음

---

## 코딩 규칙

- 빌드 도구 사용 금지 (webpack, vite 등)
- 외부 패키지 설치 금지 (CDN만 허용)
- ES6+ 문법 사용
- 스타일은 CSS 변수로 관리 (다크모드 대응)
- API 키 하드코딩 금지
