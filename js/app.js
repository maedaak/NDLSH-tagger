/**
 * app.js: NDLSH Tagger Main Application
 * Handles UI interactions, events, popovers, and rendering.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const inputText = document.getElementById('inputText');
  const charCount = document.getElementById('charCount');
  const runBtn = document.getElementById('runBtn');
  const clearBtn = document.getElementById('clearBtn');
  const sampleSelector = document.getElementById('sampleSelector');
  const liveTagToggle = document.getElementById('liveTagToggle');
  const minLenToggle = document.getElementById('minLenToggle');
  const boundaryToggle = document.getElementById('boundaryToggle');
  const styleToggle = document.getElementById('styleToggle');
  const themeToggle = document.getElementById('themeToggle');

  // Status & Progress
  const loadingOverlay = document.getElementById('loadingOverlay');
  const progressBar = document.getElementById('progressBar');
  const progressMessage = document.getElementById('progressMessage');
  const statusBadge = document.getElementById('statusBadge');
  const statsBar = document.getElementById('statsBar');
  const statMatches = document.getElementById('statMatches');
  const statHeadings = document.getElementById('statHeadings');
  const statTime = document.getElementById('statTime');

  // Result Areas
  const outputContainer = document.getElementById('outputContainer');
  const taggedContent = document.getElementById('taggedContent');
  const headingsListContainer = document.getElementById('headingsListContainer');
  const headingsList = document.getElementById('headingsList');
  const emptyState = document.getElementById('emptyState');

  // Copy Buttons
  const copyHeadingsBtn = document.getElementById('copyHeadingsBtn');
  const copySlashBtn = document.getElementById('copySlashBtn');
  const copyNdcBtn = document.getElementById('copyNdcBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  // Popover / Tooltip
  const tagPopover = document.getElementById('tagPopover');
  const popoverContent = document.getElementById('popoverContent');
  const popoverClose = document.getElementById('popoverClose');

  // Dictionary Search Modal
  const dictSearchInput = document.getElementById('dictSearchInput');
  const dictSearchResults = document.getElementById('dictSearchResults');

  // Core Instances
  const dictionary = new NDLSHDictionary();
  const tagger = new NDLSHTagger(dictionary);

  let currentResults = null;
  let debounceTimer = null;
  let activeMark = null;

  /**
   * JavaScriptインジェクション対策エスケープ関数
   * 対象文字: \, ', ", //, \n, /, \r, \t
   * バックスラッシュを前置してエスケープする
   * @param {string} str
   * @returns {string}
   */
  function escapeJsInjection(str) {
    if (str == null) return '';
    return String(str)
      .replace(/\\/g, '\\\\')    // \ -> \\ (二重エスケープ防止のため必ず最初)
      .replace(/'/g, "\\'")      // ' -> \'
      .replace(/"/g, '\\"')      // " -> \"
      .replace(/\//g, '\\/')     // / -> \/ (// は自動的に \/\/ になる)
      .replace(/\r/g, '\\r')     // \r -> \r
      .replace(/\n/g, '\\n')     // \n -> \n
      .replace(/\t/g, '\\t');    // \t -> \t
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeSafe(str) {
    return escapeHtml(escapeJsInjection(str));
  }

  // Character counter helper (Max 1000 characters)
  function updateCharCount() {
    if (!charCount || !inputText) return;
    const len = inputText.value.length;
    charCount.textContent = `${len.toLocaleString()} / 1,000文字`;
    if (len >= 1000) {
      charCount.classList.add('limit');
    } else {
      charCount.classList.remove('limit');
    }
  }

  // Sample texts
  const SAMPLES = {
    info: `近年、人工知能や深層学習、自然言語処理の急速な進展に伴い、図書館情報学や知識組織化の分野においても、メタデータ自動付与や機械可読目録（MARC）の高度化が強く求められている。国立国会図書館の典拠データ（NDLSH）やWeb NDL AuthoritiesのLinked Open Dataを活用することで、学術情報流通基盤のさらなる発展が期待される。`,
    literature: `夏目漱石の文学作品における近代日本社会の精神的変容と西洋哲学の影響について考察する。『三四郎』や『こころ』に描かれた知識人の孤独と苦悩、そして倫理観は、当時の近代化政策や日露戦争後の社会不安を色濃く反映している。比較文学や思想史の観点からその意義を再評価する。`,
    science: `気候変動と地球温暖化への対策として、再生可能エネルギーの導入拡大が世界的に加速している。特に洋上風力発電や太陽光発電の技術革新、蓄電池を活用したスマートグリッドの構築が脱炭素社会の実現に向けて鍵を握っている。`,
    medical: `地域医療における臨床心理学の役割と終末期医療におけるターミナルケアの重要性について検討する。特にがん患者や慢性疾患患者へのメンタルヘルス支援、訪問看護およびリハビリテーションの連携が求められている。`
  };

  // Initialize
  async function init() {
    initTheme();
    setupEventListeners();
    updateCharCount();

    try {
      await dictionary.load('data/ndlsh.json', ({ percent, message }) => {
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressMessage) progressMessage.textContent = message;
      });

      // Build Trie index in background
      setTimeout(() => {
        tagger.buildIndex();
        if (loadingOverlay) {
          loadingOverlay.classList.add('fade-out');
          setTimeout(() => loadingOverlay.remove(), 400);
        }

        if (statusBadge) {
          statusBadge.innerHTML = `<span class="status-dot online"></span>件名標目 <strong>${dictionary.totalHeadings.toLocaleString()}</strong> 件 読込完了`;
        }

        // Run initial sample if text area is empty
        if (!inputText.value.trim()) {
          inputText.value = SAMPLES.info.slice(0, 1000);
          updateCharCount();
          runTagger();
        } else {
          updateCharCount();
        }
      }, 50);
    } catch (err) {
      console.error(err);
      if (progressMessage) {
        progressMessage.innerHTML = `<span style="color:var(--color-danger)">辞書の読み込みに失敗しました。ページを再読込してください。<br>${err.message}</span>`;
      }
    }
  }

  // Theme Management
  function initTheme() {
    const saved = localStorage.getItem('ndlsh-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    applyTheme(isDark);
  }

  function applyTheme(isDark) {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeToggle.innerHTML = '<span class="theme-icon">☀️</span> ライトモード';
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeToggle.innerHTML = '<span class="theme-icon">🌙</span> ダークモード';
    }
    localStorage.setItem('ndlsh-theme', isDark ? 'dark' : 'light');
  }

  // Run Tagger
  function runTagger() {
    let rawText = inputText.value;
    // Enforce 1000 character upper limit
    if (rawText.length > 1000) {
      rawText = rawText.slice(0, 1000);
      inputText.value = rawText;
    }
    updateCharCount();

    if (!rawText.trim()) {
      clearResults();
      return;
    }

    // Apply JavaScript injection escape on input
    const text = escapeJsInjection(rawText);

    const minLen = minLenToggle.checked ? 1 : 2;
    const useWordBoundary = boundaryToggle.checked;
    const styleMode = styleToggle.value; // 'modern' | 'classic'

    currentResults = tagger.tagText(text, {
      minLen,
      useWordBoundary,
      overlap: 'longest'
    });

    renderResults(text, currentResults, styleMode);
  }

  function renderResults(text, results, styleMode) {
    const { matches, stats } = results;

    // Update stats bar
    statMatches.textContent = stats.totalMatches.toLocaleString();
    statHeadings.textContent = stats.uniqueHeadings.toLocaleString();
    statTime.textContent = `${stats.timeMs.toFixed(1)} ms`;
    statsBar.style.display = 'flex';

    // Render HTML in container
    const html = tagger.renderHtml(text, matches, styleMode);
    taggedContent.innerHTML = html;
    taggedContent.className = styleMode === 'classic' ? 'tagged-content classic-view' : 'tagged-content modern-view';

    emptyState.style.display = 'none';
    outputContainer.style.display = 'block';

    // Render Unique Headings List
    renderHeadingsList(matches, stats.headingCounts);

    // Attach click and hover listeners for popover
    attachTagInteractions();
  }

  function renderHeadingsList(matches, headingCounts) {
    if (!matches || matches.length === 0) {
      headingsListContainer.style.display = 'none';
      return;
    }

    headingsListContainer.style.display = 'block';
    headingsList.innerHTML = '';

    // Map heading -> best record details
    const headingMap = new Map();
    for (const m of matches) {
      const h = m.entry.prefHeading;
      if (!headingMap.has(h)) {
        headingMap.set(h, {
          heading: h,
          record: m.record,
          count: 0,
          usedTerms: new Set(),
          isSynOnly: true
        });
      }
      const item = headingMap.get(h);
      item.count++;
      item.usedTerms.add(m.matchedText);
      if (m.entry.isPref) {
        item.isSynOnly = false;
      }
    }

    const sortedList = Array.from(headingMap.values()).sort((a, b) => b.count - a.count);

    sortedList.forEach(item => {
      const card = document.createElement('div');
      card.className = 'heading-chip';
      const r = item.record;
      const ndcBadge = r && r.ndc ? `<span class="chip-ndc" title="NDC分類記号">NDC ${escapeSafe(r.ndc)}</span>` : '';
      const synNote = item.isSynOnly ? `<span class="chip-syn-note">（参照元: ${Array.from(item.usedTerms).map(escapeSafe).join(', ')}）</span>` : '';
      const authLink = r && r.authUrl ? `<a href="${encodeURI(r.authUrl)}" target="_blank" rel="noopener noreferrer" class="chip-link" title="Web NDL Authorities で開く">典拠 ↗</a>` : '';
      const ndlSearchLink = r ? `<a href="${encodeURI(r.ndlSearchUrl)}" target="_blank" rel="noopener noreferrer" class="chip-link search" title="国会図書館サーチで所蔵資料を検索">NDLサーチ ↗</a>` : '';

      card.innerHTML = `
        <div class="chip-main">
          <span class="chip-title">${escapeSafe(item.heading)}</span>
          ${r && r.yomi ? `<span class="chip-yomi">${escapeSafe(r.yomi)}</span>` : ''}
          ${ndcBadge}
          ${item.count > 1 ? `<span class="chip-count" title="本文中での出現回数">${item.count}回</span>` : ''}
          ${synNote}
        </div>
        <div class="chip-actions">
          ${authLink}
          ${ndlSearchLink}
          <button class="chip-copy-btn" title="この件名をコピー" data-heading="${escapeSafe(item.heading)}">コピー</button>
        </div>
      `;

      card.querySelector('.chip-copy-btn').addEventListener('click', (e) => {
        const textToCopy = e.target.getAttribute('data-heading');
        copyToClipboard(textToCopy, e.target, 'コピー完了!');
      });

      headingsList.appendChild(card);
    });
  }

  // Tag Interactions (Tooltip & Popover)
  function attachTagInteractions() {
    const marks = taggedContent.querySelectorAll('mark.tag-badge, span.classic-tag');

    marks.forEach(mark => {
      mark.addEventListener('mouseenter', (e) => {
        showPopover(mark);
      });

      mark.addEventListener('mouseleave', (e) => {
        // Hide if not hovering over popover
        setTimeout(() => {
          if (!tagPopover.matches(':hover') && activeMark === mark) {
            hidePopover();
          }
        }, 150);
      });

      mark.addEventListener('click', (e) => {
        e.stopPropagation();
        showPopover(mark, true);
      });
    });
  }

  function showPopover(mark, isPinned = false) {
    activeMark = mark;
    const recordIdx = parseInt(mark.getAttribute('data-record-idx'), 10);
    const record = dictionary.getRecord(recordIdx);
    if (!record) return;

    const matched = mark.getAttribute('data-matched') || mark.textContent.replace(/[\[\]]/g, '');
    const isPref = mark.getAttribute('data-is-pref') === 'true';

    let synHtml = '';
    if (!isPref) {
      synHtml = `<div class="popover-syn-row"><span class="popover-label">本文中:</span> <span class="popover-syn-text">${escapeSafe(matched)}</span> → <span class="popover-pref-text">${escapeSafe(record.sh)}</span></div>`;
    }

    let synonymsList = '';
    if (record.synonyms && record.synonyms.length > 0) {
      synonymsList = `<div class="popover-row"><span class="popover-label">同義・参照:</span> <span class="popover-val">${record.synonyms.slice(0, 5).map(escapeSafe).join(', ')}${record.synonyms.length > 5 ? ' 他' : ''}</span></div>`;
    }

    let btList = '';
    if (record.bt) {
      const cleanBt = record.bt.replace(/<\d+>/g, '');
      btList = `<div class="popover-row"><span class="popover-label">上位語:</span> <span class="popover-val">${escapeSafe(cleanBt)}</span></div>`;
    }

    let rtList = '';
    if (record.rt) {
      const cleanRt = record.rt.replace(/<\d+>/g, '');
      rtList = `<div class="popover-row"><span class="popover-label">関連語:</span> <span class="popover-val">${escapeSafe(cleanRt)}</span></div>`;
    }

    popoverContent.innerHTML = `
      <div class="popover-header">
        <h4 class="popover-title">${escapeSafe(record.sh)}</h4>
        ${record.yomi ? `<div class="popover-yomi">${escapeSafe(record.yomi)}</div>` : ''}
      </div>
      ${synHtml}
      <div class="popover-body">
        ${record.ndc ? `<div class="popover-row"><span class="popover-label">NDC分類:</span> <span class="popover-val popover-ndc">${escapeSafe(record.ndc)}</span></div>` : ''}
        ${record.ndlc ? `<div class="popover-row"><span class="popover-label">NDLC分類:</span> <span class="popover-val">${escapeSafe(record.ndlc)}</span></div>` : ''}
        ${synonymsList}
        ${btList}
        ${rtList}
        ${record.note ? `<div class="popover-row"><span class="popover-label">注記:</span> <span class="popover-val popover-note">${escapeSafe(record.note)}</span></div>` : ''}
      </div>
      <div class="popover-footer">
        ${record.authUrl ? `<a href="${encodeURI(record.authUrl)}" target="_blank" rel="noopener noreferrer" class="popover-btn primary">Web NDL Authorities ↗</a>` : ''}
        <a href="${encodeURI(record.ndlSearchUrl)}" target="_blank" rel="noopener noreferrer" class="popover-btn secondary">NDLサーチ所蔵検索 ↗</a>
      </div>
    `;

    // Position popover relative to mark
    tagPopover.style.display = 'block';
    positionPopover(mark);
  }

  function positionPopover(target) {
    const targetRect = target.getBoundingClientRect();
    const popoverRect = tagPopover.getBoundingClientRect();
    const padding = 12;

    let top = targetRect.bottom + window.scrollY + 6;
    let left = targetRect.left + window.scrollX + (targetRect.width / 2) - (popoverRect.width / 2);

    // Bounds checking
    if (left < padding) left = padding;
    if (left + popoverRect.width > window.innerWidth - padding) {
      left = window.innerWidth - popoverRect.width - padding;
    }

    // Flip to top if bottom overflows viewport
    if (targetRect.bottom + popoverRect.height + 20 > window.innerHeight && targetRect.top > popoverRect.height + 20) {
      top = targetRect.top + window.scrollY - popoverRect.height - 6;
    }

    tagPopover.style.top = `${top}px`;
    tagPopover.style.left = `${left}px`;
  }

  function hidePopover() {
    tagPopover.style.display = 'none';
    activeMark = null;
  }

  // Clear Results
  function clearResults() {
    inputText.value = '';
    updateCharCount();
    taggedContent.innerHTML = '';
    headingsList.innerHTML = '';
    headingsListContainer.style.display = 'none';
    outputContainer.style.display = 'none';
    statsBar.style.display = 'none';
    emptyState.style.display = 'block';
    currentResults = null;
    hidePopover();
    inputText.focus();
  }

  // Copy Helpers
  function copyToClipboard(text, btnElement, successMsg = 'コピーしました！') {
    navigator.clipboard.writeText(text).then(() => {
      const origText = btnElement.textContent;
      btnElement.textContent = successMsg;
      btnElement.classList.add('copied');
      setTimeout(() => {
        btnElement.textContent = origText;
        btnElement.classList.remove('copied');
      }, 1800);
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // Run button
    runBtn.addEventListener('click', runTagger);

    // Clear button
    clearBtn.addEventListener('click', clearResults);

    // Sample selector
    sampleSelector.addEventListener('change', () => {
      const val = sampleSelector.value;
      if (val && SAMPLES[val]) {
        inputText.value = SAMPLES[val].slice(0, 1000);
        updateCharCount();
        runTagger();
      }
    });

    // Live Tagging Toggle
    liveTagToggle.addEventListener('change', () => {
      if (liveTagToggle.checked) {
        runTagger();
      }
    });

    inputText.addEventListener('input', () => {
      if (inputText.value.length > 1000) {
        inputText.value = inputText.value.slice(0, 1000);
      }
      updateCharCount();
      if (liveTagToggle.checked) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runTagger, 280);
      }
    });

    // Options Toggles
    minLenToggle.addEventListener('change', runTagger);
    boundaryToggle.addEventListener('change', runTagger);
    styleToggle.addEventListener('change', runTagger);

    // Theme Toggle
    themeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      applyTheme(!isDark);
    });

    // Popover close and hover behavior
    popoverClose.addEventListener('click', hidePopover);
    tagPopover.addEventListener('mouseleave', () => {
      hidePopover();
    });
    document.addEventListener('click', (e) => {
      if (!tagPopover.contains(e.target) && (!activeMark || !activeMark.contains(e.target))) {
        hidePopover();
      }
    });
    window.addEventListener('resize', () => {
      if (tagPopover.style.display === 'block' && activeMark) {
        positionPopover(activeMark);
      }
    });

    // Copy Actions for Catalogers
    copyHeadingsBtn.addEventListener('click', () => {
      if (!currentResults || !currentResults.stats.headingCounts.length) return;
      const text = currentResults.stats.headingCounts.map(h => h.heading).join('\n');
      copyToClipboard(text, copyHeadingsBtn, '改行区切りでコピー完了！');
    });

    copySlashBtn.addEventListener('click', () => {
      if (!currentResults || !currentResults.stats.headingCounts.length) return;
      const text = currentResults.stats.headingCounts.map(h => h.heading).join(' / ');
      copyToClipboard(text, copySlashBtn, 'スラッシュ区切りでコピー完了！');
    });

    copyNdcBtn.addEventListener('click', () => {
      if (!currentResults || !currentResults.matches.length) return;
      const seen = new Set();
      const lines = [];
      for (const m of currentResults.matches) {
        const h = m.entry.prefHeading;
        if (!seen.has(h)) {
          seen.add(h);
          const ndc = m.record && m.record.ndc ? ` (NDC: ${m.record.ndc})` : '';
          lines.push(`${h}${ndc}`);
        }
      }
      copyToClipboard(lines.join('\n'), copyNdcBtn, 'NDC付きでコピー完了！');
    });

    exportCsvBtn.addEventListener('click', () => {
      if (!currentResults || !currentResults.matches.length) return;
      exportToCsv(currentResults.matches);
    });

    // Quick Dictionary Search
    if (dictSearchInput) {
      dictSearchInput.addEventListener('input', () => {
        if (dictSearchInput.value.length > 1000) {
          dictSearchInput.value = dictSearchInput.value.slice(0, 1000);
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          performDictSearch(dictSearchInput.value);
        }, 200);
      });
    }
  }

  function exportToCsv(matches) {
    const rows = [['件名標目', '標目よみ', '典拠ID', 'NDC分類', '出現回数', '本文中表現', 'Web NDL Authorities URL']];
    const map = new Map();

    for (const m of matches) {
      const h = m.entry.prefHeading;
      if (!map.has(h)) {
        map.set(h, {
          heading: h,
          record: m.record,
          count: 0,
          used: new Set()
        });
      }
      const item = map.get(h);
      item.count++;
      item.used.add(m.matchedText);
    }

    map.forEach(item => {
      const r = item.record;
      rows.push([
        item.heading,
        r ? r.yomi : '',
        r ? r.id : '',
        r ? r.ndc : '',
        item.count,
        Array.from(item.used).join('; '),
        r && r.authUrl ? r.authUrl : ''
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(row =>
      row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ndlsh_tagged_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function performDictSearch(rawQuery) {
    if (!dictSearchResults) return;
    if (!rawQuery || !rawQuery.trim()) {
      dictSearchResults.innerHTML = '<div class="dict-placeholder">標目名、読み、同義語、NDC記号で検索できます</div>';
      return;
    }

    let q = rawQuery.length > 1000 ? rawQuery.slice(0, 1000) : rawQuery;
    // 入力時エスケープ
    const query = escapeJsInjection(q);

    const results = dictionary.search(query, 30);
    if (results.length === 0) {
      dictSearchResults.innerHTML = '<div class="dict-placeholder">該当する件名標目が見つかりませんでした</div>';
      return;
    }

    dictSearchResults.innerHTML = '';
    results.forEach(({ record, matchedTerm }) => {
      const r = record;
      const itemEl = document.createElement('div');
      itemEl.className = 'dict-item';
      itemEl.innerHTML = `
        <div class="dict-item-top">
          <span class="dict-sh">${escapeSafe(r.sh)}</span>
          ${r.yomi ? `<span class="dict-yomi">${escapeSafe(r.yomi)}</span>` : ''}
          ${r.ndc ? `<span class="dict-ndc">NDC ${escapeSafe(r.ndc)}</span>` : ''}
        </div>
        ${matchedTerm && matchedTerm !== r.sh ? `<div class="dict-match">一致: ${escapeSafe(matchedTerm)}</div>` : ''}
        <div class="dict-item-actions">
          ${r.authUrl ? `<a href="${encodeURI(r.authUrl)}" target="_blank" rel="noopener noreferrer" class="dict-link">Web NDL Authorities ↗</a>` : ''}
          <a href="${encodeURI(r.ndlSearchUrl)}" target="_blank" rel="noopener noreferrer" class="dict-link">NDLサーチ ↗</a>
          <button class="dict-copy-btn" type="button">コピー</button>
        </div>
      `;

      itemEl.querySelector('.dict-copy-btn').addEventListener('click', (e) => {
        copyToClipboard(r.sh, e.currentTarget, 'コピー完了!');
      });

      dictSearchResults.appendChild(itemEl);
    });
  }

  // Start app
  init();
});
