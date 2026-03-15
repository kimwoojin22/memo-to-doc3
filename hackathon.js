// ===== 설정 =====
// 모델을 교체할 때는 이 상수만 변경하면 됨
// OpenRouter 무료 모델 목록: https://openrouter.ai/models?q=free
const OPENROUTER_MODEL = 'stepfun/step-3.5-flash:free';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_TOKENS = 4096;

// ===== 탭 ID 목록 (단일 소스) =====
const TAB_IDS = ['summary', 'concepts', 'document', 'diagram', 'steps', 'design'];

// ===== 각 탭별 프롬프트 =====
// summary는 메모 유형(meeting/learning/idea)에 따라 분기되는 객체 구조
// 나머지 탭은 유형 무관하게 동일한 프롬프트 사용
const PROMPTS = {
  summary: {
    // 회의/업무: 결정 사항과 액션 아이템 중심
    meeting: `회의/업무 메모를 간결하게 요약해 주세요.\n\n## 주요 내용\n- bullet point 3~5개\n\n## 결정 사항\n- 없으면 생략\n\n## 다음 할 일\n- 없으면 생략`,
    // 교육/학습: 개념과 인사이트 중심 — 회의 형식 섹션 사용 금지
    learning: `교육/학습 메모를 간결하게 요약해 주세요. "결정 사항"이나 "다음 할 일" 섹션은 절대 사용하지 마세요.\n\n## 핵심 개념\n- bullet point 3~5개\n\n## 배운 점\n- bullet point 3~5개\n\n## 적용 포인트\n- 없으면 생략`,
    // 아이디어/기획: 아이디어와 검토사항 중심
    idea: `아이디어/기획 메모를 간결하게 요약해 주세요.\n\n## 핵심 아이디어\n- bullet point 3~5개\n\n## 근거\n- 없으면 생략\n\n## 고려사항\n- bullet point 2~3개`,
  },

  concepts: `메모에서 주요 개념과 용어를 추출해 정리해 주세요.

각 개념마다:
- **정의:** 1~2문장
- **맥락:** 이 메모에서 어떻게 쓰였는지 한 줄

중요한 것부터 나열. 개념당 3줄 이내로 간결하게.`,

  document: `메모를 Notion/팀 위키에 바로 쓸 수 있는 문서로 변환해 주세요.

# [제목]
> [한 줄 요약]

## 내용
메모의 핵심을 구조화 (소제목 활용)

## 참고사항
꼭 필요한 내용만. 없으면 생략.

군더더기 없이 실용적으로 작성.`,

  diagram: `메모에 명확한 순서/단계/흐름이 있을 때만 Mermaid 다이어그램을 생성하세요.

프로세스가 없으면 다음 문구만 출력하세요:
> 이 메모에는 도식화할 프로세스가 없습니다.

프로세스가 있으면 flowchart TD 로만 작성하세요. 노드는 5개 이하로 간단하게.

\`\`\`mermaid
flowchart TD
  A[단계1] --> B[단계2] --> C[단계3]
\`\`\`

노드 규칙:
- 텍스트는 짧게 (5단어 이내)
- 이모지·줄바꿈 금지
- 특수문자 있으면 큰따옴표로 감쌀 것: A["텍스트 (설명)"]`,

  steps: `메모 내용을 단계별 가이드로 작성해 주세요.

## 단계별 가이드

**Step 1: [제목]**
- 할 일 (2~3줄)

**Step 2: [제목]**
- 할 일 (2~3줄)

각 단계는 짧고 실행 가능하게. 전제조건/완료결과는 필요할 때만.`,

  design: `메모 내용이 설계/개발에서 어떻게 활용될 수 있는지 핵심만 짚어 주세요.

## 설계 활용 포인트

### 핵심 결정 사항
- bullet point 2~4개

### 주의할 트레이드오프
- bullet point 2~3개

### 체크리스트
- [ ] 항목들 (실용적인 것만)`
};

// ===== DOM 요소 =====
const $ = id => document.getElementById(id);

// ===== 상태 =====
const state = {
  apiKey: '',
  memoType: 'meeting',
  results: { summary: '', concepts: '', document: '', diagram: '', steps: '', design: '' },
  loading: false,
  activeTab: 'summary',
  abortController: null
};

// ===== 초기화 =====
function init() {
  loadTheme();
  loadApiKey();
  setupEventListeners();
  updateCharCount();
  $('model-name').textContent = OPENROUTER_MODEL;
}

// ===== 테마 =====
function loadTheme() {
  const saved = localStorage.getItem('memodoc_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  setTheme(theme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('memodoc_theme', theme);
  $('btn-theme').textContent = theme === 'dark' ? '☀️ 라이트' : '🌙 다크';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

// ===== API 키 =====
function loadApiKey() {
  const saved = localStorage.getItem('memodoc_api_key');
  if (saved) {
    // Gemini → OpenRouter 마이그레이션 안전장치:
    // 이전에 저장된 AIza... 형식의 Gemini 키가 있으면 자동 삭제 후 재입력 유도
    if (!saved.startsWith('sk-or-')) {
      localStorage.removeItem('memodoc_api_key');
      return;
    }
    $('api-key').value = saved;
    state.apiKey = saved;
    showApiKeySaved();
  }
}

// API 키 유효성 검증. 오류 메시지 반환, 유효하면 null
function validateApiKey(key) {
  if (!key) return 'OpenRouter API 키를 먼저 입력하고 저장해 주세요. (sk-or-로 시작)';
  if (!key.startsWith('sk-or-')) return '올바른 OpenRouter API 키가 아닙니다. (sk-or-로 시작해야 합니다)';
  return null;
}

function showApiKeySaved() {
  $('api-key-saved').style.display = 'flex';
  $('api-key-row').style.display = 'none';
}

function showApiKeyInput() {
  $('api-key-saved').style.display = 'none';
  $('api-key-row').style.display = 'flex';
  $('api-key').focus();
}

function saveApiKey() {
  const key = $('api-key').value.trim();
  const err = validateApiKey(key);
  if (err) { showError(err); return; }
  state.apiKey = key;
  localStorage.setItem('memodoc_api_key', key);
  hideError();
  showApiKeySaved();
}

// ===== 탭 =====
function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `pane-${tabId}`));
}

// ===== 문자 수 카운터 =====
// 8,000자 초과 시 경고(주황), 9,500자 초과 시 위험(빨강) 색상으로 표시
function updateCharCount() {
  const len = $('memo').value.length;
  const el = $('char-count');
  el.textContent = `${len.toLocaleString()} / 10,000자`;
  el.style.color = len > 9500 ? 'var(--error)' : len > 8000 ? '#f59e0b' : 'var(--text-2)';
}

// ===== 에러 =====
function showError(msg) {
  const el = $('error-box');
  el.textContent = msg;
  el.classList.add('visible');
}
function hideError() {
  $('error-box').classList.remove('visible');
}

// ===== 스트리밍 API 호출 (OpenRouter) =====
// OpenAI 호환 SSE(Server-Sent Events) 방식으로 스트리밍 응답을 처리한다.
// 각 탭은 독립적으로 이 함수를 호출하며, 응답이 오는 대로 화면에 즉시 렌더링한다.
async function callClaudeStream(tabId, memo, signal) {
  // summary 탭은 메모 유형별로 다른 프롬프트를 사용, 나머지는 단일 프롬프트
  const raw = PROMPTS[tabId];
  const prompt = (tabId === 'summary' && typeof raw === 'object')
    ? raw[state.memoType] || raw.meeting
    : raw;
  const pane = $(`pane-${tabId}`);

  // 탭 콘텐츠를 출력 영역으로 초기화 (이전 결과 덮어쓰기)
  pane.innerHTML = `
    <div class="output-header">
      <span class="output-label">${getTabLabel(tabId)}</span>
      <div style="display:flex;gap:6px;">
        <button class="btn-icon" onclick="copyToClipboard('${tabId}')">📋 복사</button>
        <button class="btn-icon" onclick="exportMarkdown('${tabId}')">⬇ 내보내기</button>
      </div>
    </div>
    <div class="output-body" id="output-${tabId}">
      <span class="cursor"></span>
    </div>`;

  const outputEl = $(`output-${tabId}`);
  let fullText = ''; // 스트리밍으로 수신한 텍스트를 누적

  try {
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.apiKey}`
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        stream: true,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `다음 업무 메모를 분석해 주세요:\n\n${memo}` }
        ]
      }),
      signal
    });

    // HTTP 오류 시 응답 본문에서 상세 메시지 추출
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `API 오류 (${res.status})`;
      try {
        const err = JSON.parse(errText);
        errMsg = err.error?.message || err.message || errMsg;
        if (err.error?.metadata) errMsg += ` | ${JSON.stringify(err.error.metadata)}`;
      } catch {}
      throw new Error(errMsg);
    }

    // SSE 스트림을 청크 단위로 읽어 파싱
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = ''; // 청크가 줄 경계에서 잘릴 수 있으므로 버퍼에 누적

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 이전 버퍼 + 새 청크를 합쳐 줄 단위로 분리
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // 마지막 줄은 아직 완성되지 않았을 수 있으므로 버퍼에 남겨둠
      buffer = lines.pop();

      for (const line of lines) {
        const text = parseSSELine(line);
        if (!text) continue;

        fullText += text;
        // 도식화 탭: 스트리밍 중에는 마크다운으로 미리보기, 완료 후 Mermaid 렌더링
        if (tabId === 'diagram') {
          outputEl.innerHTML = '<span class="cursor"></span>';
          renderMarkdown(outputEl, fullText + ' ▌');
        } else {
          renderMarkdown(outputEl, fullText + ' ▌');
        }
      }
    }

    // 스트리밍 완료 — 커서 제거 후 최종 렌더링
    state.results[tabId] = fullText;

    if (tabId === 'diagram') {
      outputEl.innerHTML = '';
      await renderDiagram(outputEl, fullText); // Mermaid SVG 렌더링
    } else {
      renderMarkdown(outputEl, fullText);
    }

  } catch (err) {
    if (err.name === 'AbortError') return; // 취소된 요청은 무시
    // 오류 발생 시 탭 내부에 재시도 버튼과 함께 오류 메시지 표시
    outputEl.innerHTML = `
      <div style="color:var(--error);padding:12px;background:var(--error-bg);border-radius:8px;display:flex;flex-direction:column;gap:10px;">
        <div>❌ <strong>오류 발생:</strong> ${err.message}</div>
        <button class="btn-sm" style="width:fit-content;" onclick="retrySingleTab('${tabId}')">🔄 다시 시도</button>
      </div>`;
    throw err;
  }
}

// ===== 단일 탭 재시도 =====
async function retrySingleTab(tabId) {
  const memo = $('memo').value.trim();
  if (!memo) { showError('메모를 먼저 입력해 주세요.'); return; }
  const keyErr = validateApiKey(state.apiKey);
  if (keyErr) { showError(keyErr); return; }
  try {
    await callClaudeStream(tabId, memo);
  } catch {}
}

// ===== SSE 한 줄 파싱 =====
// "data: {...}" 형식의 SSE 라인에서 텍스트 조각을 추출한다.
// OpenAI 호환 형식: choices[0].delta.content
function parseSSELine(line) {
  if (!line.startsWith('data: ')) return null;
  const data = line.slice(6).trim();
  if (!data || data === '[DONE]') return null;
  try {
    const evt = JSON.parse(data);
    return evt.choices?.[0]?.delta?.content || null;
  } catch {
    return null;
  }
}

// ===== 마크다운 렌더링 =====
function renderMarkdown(el, text) {
  el.innerHTML = marked.parse(text);
}

// ===== Mermaid 다이어그램 렌더링 =====
// AI 응답 텍스트를 두 영역으로 분리해 렌더링한다:
//   1. ```mermaid 블록 → mermaid.run()으로 SVG 변환
//   2. 나머지 텍스트 → marked.parse()로 마크다운 렌더링
//
// 렌더링 흐름:
//   텍스트 수신 → mermaid 블록 추출 → HTML 조립 → DOM 삽입 → mermaid.run() 호출
//
// 주의: mermaid.run()은 DOM에 삽입된 후 호출해야 하므로 innerHTML 할당 뒤에 실행
async function renderDiagram(el, text) {
  // ── Step 1: ```mermaid ... ``` 블록 추출 ──────────────────────────────
  // AI가 출력한 코드 펜스 내부의 Mermaid 소스만 분리
  const mermaidMatch = text.match(/```mermaid\n([\s\S]*?)```/);
  const mermaidCode = mermaidMatch ? mermaidMatch[1].trim() : null;

  // ── Step 2: 설명 텍스트 분리 ──────────────────────────────────────────
  // Mermaid 블록을 제거한 나머지(AI의 부가 설명)를 마크다운으로 표시
  const descText = text.replace(/```mermaid[\s\S]*?```/, '').trim();

  // ── Step 3: HTML 조립 ─────────────────────────────────────────────────
  let html = '';
  // renderId: mermaid.run()이 특정 DOM 노드를 타겟팅하는 데 필요한 고유 ID
  // 두 번째 if 블록에서도 참조하므로 바깥에서 선언 (블록 스코프 회피)
  const renderId = 'mermaid-' + Date.now();

  if (descText) {
    // 설명 텍스트가 있으면 다이어그램 위에 마크다운으로 표시
    html += `<div class="output-body">${marked.parse(descText)}</div>`;
  }

  if (mermaidCode) {
    // SVG 렌더링 영역 + 소스 코드 표시 영역을 나란히 배치
    // mermaid 클래스가 붙은 div를 mermaid.run()이 감지해 SVG로 교체
    html += `
      <div class="mermaid-wrapper">
        <div class="mermaid-render">
          <div class="mermaid" id="${renderId}">${escapeHtml(mermaidCode)}</div>
        </div>
        <div class="mermaid-code">
          <div class="mermaid-code-title">Mermaid 소스</div>
          <pre>${escapeHtml(mermaidCode)}</pre>
        </div>
      </div>`;
  }

  // ── Step 4: DOM 삽입 ──────────────────────────────────────────────────
  // mermaid 블록도 설명도 없는 엣지 케이스는 원문을 마크다운으로 폴백 렌더링
  el.innerHTML = html || marked.parse(text);

  // ── Step 5: Mermaid SVG 렌더링 ────────────────────────────────────────
  // DOM 삽입 후 호출해야 mermaid.run()이 노드를 정상 탐색
  if (mermaidCode) {
    try {
      await mermaid.run({ nodes: [document.getElementById(renderId)] });
    } catch (e) {
      // 문법 오류 등 렌더링 실패 시: 에러 메시지 + 소스 코드를 함께 표시
      document.getElementById(renderId).innerHTML =
        `<div style="color:var(--error);font-size:0.85rem;">다이어그램 렌더링 오류: ${e.message}</div>
         <pre style="text-align:left;font-size:0.8rem;margin-top:8px;">${escapeHtml(mermaidCode)}</pre>`;
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== 적응형 딜레이 =====
// API 응답 시간이 길면 rate limit 가능성이 낮으므로 대기 시간 단축
// 최소 1초 보장, rate limit 오류 시 5초로 증가
function adaptiveDelay(tabDurationMs, hasRateLimit) {
  if (hasRateLimit) return 5000;
  return Math.max(1000, 3000 - tabDurationMs);
}

// ===== 문서 생성 (전체 탭) =====
async function generate() {
  if (state.loading) return; // 동시 실행 방지

  const memo = $('memo').value.trim();
  if (!memo) { showError('메모를 입력해 주세요.'); return; }
  if (memo.length < 10) { showError('메모가 너무 짧아요. 내용을 좀 더 입력해 주세요.'); return; }

  const key = $('api-key').value.trim() || state.apiKey;
  const keyErr = validateApiKey(key);
  if (keyErr) { showError(keyErr); return; }
  state.apiKey = key;

  hideError();

  // 이전 생성 취소 후 새 AbortController 생성
  if (state.abortController) state.abortController.abort();
  state.abortController = new AbortController();
  const { signal } = state.abortController;

  state.loading = true;
  $('btn-generate').disabled = true;

  // 모든 탭 대기 상태로 초기화
  TAB_IDS.forEach(id => {
    $(`pane-${id}`).innerHTML = `
      <div class="output-body" style="display:flex;align-items:center;gap:12px;color:var(--text-2);">
        <span style="font-size:1.1rem;">⏳</span>
        <span>${getTabLabel(id)} 대기 중...</span>
      </div>`;
  });

  switchTab('summary');

  // 탭 순차 생성 (무료 모델 rate limit 대응)
  const delay = ms => new Promise(r => setTimeout(r, ms));
  let hasError = false;
  const perfLog = {};

  for (let i = 0; i < TAB_IDS.length; i++) {
    if (signal.aborted) break;
    const id = TAB_IDS[i];
    $('btn-generate').innerHTML = `<div class="spinner"></div> 생성 중... (${i + 1}/${TAB_IDS.length})`;
    const tabStart = performance.now();
    let tabHasRateLimit = false;
    try {
      await callClaudeStream(id, memo, signal);
    } catch (err) {
      if (signal.aborted) break;
      hasError = true;
      if (err.message && err.message.toLowerCase().includes('rate')) tabHasRateLimit = true;
    }
    const tabDuration = performance.now() - tabStart;
    perfLog[id] = tabDuration;
    console.log(`[MemoDoc] ${id}: ${(tabDuration / 1000).toFixed(1)}s`);

    if (i < TAB_IDS.length - 1) await delay(adaptiveDelay(tabDuration, tabHasRateLimit));
  }

  console.log('[MemoDoc] 탭별 소요 시간(ms):', perfLog);

  if (!signal.aborted && hasError) {
    showError('일부 탭에서 오류가 발생했습니다. 해당 탭의 🔄 다시 시도 버튼을 눌러주세요.');
  }

  state.loading = false;
  $('btn-generate').disabled = false;
  $('btn-generate').innerHTML = '✨ 문서 생성';
}

// ===== 내보내기 =====
function exportMarkdown(tabId) {
  const content = state.results[tabId];
  if (!content) { alert('아직 생성된 내용이 없습니다.'); return; }

  const label = getTabLabel(tabId);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `memodoc_${tabId}_${date}.md`;
  const blob = new Blob([`# ${label}\n\n${content}`], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ===== 클립보드 복사 =====
async function copyToClipboard(tabId) {
  const content = state.results[tabId];
  if (!content) { alert('아직 생성된 내용이 없습니다.'); return; }
  try {
    await navigator.clipboard.writeText(content);
    const btn = document.querySelector(`#pane-${tabId} .btn-icon`);
    const original = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch {
    alert('복사에 실패했습니다. 직접 선택 후 복사해 주세요.');
  }
}

function exportAll() {
  const hasContent = Object.values(state.results).some(v => v);
  if (!hasContent) { alert('아직 생성된 문서가 없습니다.'); return; }

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const content = TAB_IDS
    .filter(id => state.results[id])
    .map(id => `# ${getTabLabel(id)}\n\n${state.results[id]}`)
    .join('\n\n---\n\n');

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `memodoc_all_${date}.md`; a.click();
  URL.revokeObjectURL(url);
}

function getTabLabel(tabId) {
  const labels = {
    summary: '요약', concepts: '개념 정리', document: '구조화 문서',
    diagram: '도식화', steps: '단계별 설명', design: '설계 활용 포인트'
  };
  return labels[tabId] || tabId;
}

// ===== 이벤트 리스너 =====
function setupEventListeners() {
  $('btn-theme').addEventListener('click', toggleTheme);
  $('btn-clear').addEventListener('click', () => {
    if ($('memo').value && confirm('메모를 초기화할까요?')) {
      // 진행 중인 생성 요청 취소
      if (state.abortController) state.abortController.abort();
      $('memo').value = '';
      updateCharCount();
      hideError();
    }
  });
  $('btn-save-key').addEventListener('click', saveApiKey);
  $('btn-change-key').addEventListener('click', showApiKeyInput);
  $('btn-generate').addEventListener('click', generate);
  $('btn-export-all').addEventListener('click', exportAll);
  $('memo').addEventListener('input', updateCharCount);

  // API 키 Enter 키로 저장
  $('api-key').addEventListener('keydown', e => { if (e.key === 'Enter') saveApiKey(); });

  // Ctrl+Enter로 생성
  $('memo').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generate();
  });

  // 탭 클릭
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 메모 유형 선택
  document.querySelectorAll('.btn-type').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-type').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.memoType = btn.dataset.type;
    });
  });
}

// ===== 실행 =====
document.addEventListener('DOMContentLoaded', init);
