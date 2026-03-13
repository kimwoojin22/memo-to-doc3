// ===== 설정 =====
const OPENROUTER_MODEL = 'stepfun/step-3.5-flash:free';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_TOKENS = 4096;

// ===== 각 탭별 프롬프트 =====
const PROMPTS = {
  summary: {
    meeting: `회의/업무 메모를 간결하게 요약해 주세요.\n\n## 주요 내용\n- bullet point 3~5개\n\n## 결정 사항\n- 없으면 생략\n\n## 다음 할 일\n- 없으면 생략`,
    learning: `교육/학습 메모를 간결하게 요약해 주세요. "결정 사항"이나 "다음 할 일" 섹션은 절대 사용하지 마세요.\n\n## 핵심 개념\n- bullet point 3~5개\n\n## 배운 점\n- bullet point 3~5개\n\n## 적용 포인트\n- 없으면 생략`,
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

  diagram: `메모에서 흐름/관계를 파악해 Mermaid 다이어그램으로 표현해 주세요.

[한 줄 설명]

\`\`\`mermaid
[코드]
\`\`\`

flowchart / sequenceDiagram / classDiagram 중 적합한 것 선택.

Mermaid 노드 작성 규칙 (반드시 준수):
- 노드 텍스트에 이모지 사용 금지
- 노드 텍스트 내 줄바꿈 금지
- 특수문자(괄호, 슬래시 등) 포함 시 반드시 큰따옴표로 감쌀 것: A["텍스트 (설명)"]
- 텍스트는 짧게 한 줄로`,

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
  activeTab: 'summary'
};

// ===== 초기화 =====
function init() {
  loadTheme();
  loadApiKey();
  setupEventListeners();
  updateCharCount();
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
    if (!saved.startsWith('sk-or-')) {
      // 이전 Gemini 키가 남아있는 경우 자동 삭제
      localStorage.removeItem('memodoc_api_key');
      return;
    }
    $('api-key').value = saved;
    state.apiKey = saved;
    showApiKeySaved();
  }
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
  if (!key) { showError('API 키를 입력해 주세요.'); return; }
  if (!key.startsWith('sk-or-')) { showError('올바른 OpenRouter API 키 형식이 아닙니다. (sk-or-로 시작해야 합니다)'); return; }
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
function updateCharCount() {
  const len = $('memo').value.length;
  $('char-count').textContent = `${len.toLocaleString()} / 10,000자`;
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
async function callClaudeStream(tabId, memo) {
  const raw = PROMPTS[tabId];
  const prompt = (tabId === 'summary' && typeof raw === 'object')
    ? raw[state.memoType] || raw.meeting
    : raw;
  const pane = $(`pane-${tabId}`);

  // 빈 상태 제거 후 출력 영역 초기화
  pane.innerHTML = `
    <div class="output-header">
      <span class="output-label">${getTabLabel(tabId)}</span>
      <button class="btn-icon" onclick="exportMarkdown('${tabId}')">⬇ 내보내기</button>
    </div>
    <div class="output-body" id="output-${tabId}">
      <span class="cursor"></span>
    </div>`;

  const outputEl = $(`output-${tabId}`);
  let fullText = '';

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
      })
    });

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

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const evt = JSON.parse(data);
          const text = evt.choices?.[0]?.delta?.content;
          if (text) {
            fullText += text;

            // 도식화 탭은 Mermaid 렌더링을 위해 별도 처리
            if (tabId === 'diagram') {
              outputEl.innerHTML = '<span class="cursor"></span>';
              renderMarkdown(outputEl, fullText + ' ▌');
            } else {
              outputEl.innerHTML = marked.parse(fullText + ' ▌');
            }
          }
        } catch {}
      }
    }

    // 완료 후 최종 렌더링
    state.results[tabId] = fullText;

    if (tabId === 'diagram') {
      outputEl.innerHTML = '';
      await renderDiagram(outputEl, fullText);
    } else {
      outputEl.innerHTML = marked.parse(fullText);
    }

  } catch (err) {
    outputEl.innerHTML = `<div style="color:var(--error);padding:12px;background:var(--error-bg);border-radius:8px;">
      ❌ <strong>오류 발생:</strong> ${err.message}</div>`;
    throw err;
  }
}

// ===== 마크다운 렌더링 =====
function renderMarkdown(el, text) {
  el.innerHTML = marked.parse(text);
}

// ===== Mermaid 다이어그램 렌더링 =====
async function renderDiagram(el, text) {
  // Mermaid 코드 블록 추출
  const mermaidMatch = text.match(/```mermaid\n([\s\S]*?)```/);
  const mermaidCode = mermaidMatch ? mermaidMatch[1].trim() : null;

  // 나머지 텍스트 (설명 부분)
  const descText = text.replace(/```mermaid[\s\S]*?```/, '').trim();

  let html = '';
  const renderId = 'mermaid-' + Date.now();

  if (descText) {
    html += `<div class="output-body">${marked.parse(descText)}</div>`;
  }

  if (mermaidCode) {
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

  el.innerHTML = html || marked.parse(text);

  if (mermaidCode) {
    try {
      await mermaid.run({ nodes: [document.getElementById(renderId)] });
    } catch (e) {
      document.getElementById(renderId).innerHTML =
        `<div style="color:var(--error);font-size:0.85rem;">다이어그램 렌더링 오류: ${e.message}</div>
         <pre style="text-align:left;font-size:0.8rem;margin-top:8px;">${escapeHtml(mermaidCode)}</pre>`;
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== 문서 생성 (전체 탭) =====
async function generate() {
  const memo = $('memo').value.trim();
  if (!memo) { showError('메모를 입력해 주세요.'); return; }

  const key = $('api-key').value.trim();
  if (!key) { showError('OpenRouter API 키를 입력하고 저장해 주세요.'); return; }
  state.apiKey = key;

  hideError();
  state.loading = true;
  $('btn-generate').disabled = true;
  $('btn-generate').innerHTML = '<div class="spinner"></div> 생성 중...';

  // 모든 탭 동시에 로딩 표시
  const tabIds = ['summary', 'concepts', 'document', 'diagram', 'steps', 'design'];
  tabIds.forEach(id => {
    $(`pane-${id}`).innerHTML = `
      <div class="output-body" style="display:flex;align-items:center;gap:12px;color:var(--text-2);">
        <div class="spinner" style="border-color:var(--border);border-top-color:var(--primary);"></div>
        <span>생성 중...</span>
      </div>`;
  });

  // 첫 번째 탭으로 이동
  switchTab('summary');

  // 탭 순차 생성 (무료 모델 rate limit 대응)
  const delay = ms => new Promise(r => setTimeout(r, ms));
  let hasError = false;
  for (const id of tabIds) {
    try {
      await callClaudeStream(id, memo);
      await delay(3000);
    } catch (err) {
      hasError = true;
    }
  }
  if (hasError) showError('일부 탭 생성 중 오류가 발생했습니다. 위의 탭에서 오류 내용을 확인해 주세요.');

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

function exportAll() {
  const hasContent = Object.values(state.results).some(v => v);
  if (!hasContent) { alert('아직 생성된 문서가 없습니다.'); return; }

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const tabs = ['summary','concepts','document','diagram','steps','design'];
  const content = tabs
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
