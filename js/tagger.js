/**
 * tagger.js: NDLSH Tagger Engine
 * Fast Trie-based substring matching for NDLSH subject headings and synonyms.
 */

class NDLSHTagger {
  constructor(dictionary) {
    this.dict = dictionary;
    this.root = this.createNode();
    this.isBuilt = false;
    this.segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
      ? new Intl.Segmenter('ja', { granularity: 'word' })
      : null;
  }

  createNode() {
    return {
      children: new Map(),
      entries: null // Array of entries when word terminates
    };
  }

  /**
   * Build the Prefix Tree (Trie) from dictionary records
   */
  buildIndex() {
    if (!this.dict.isLoaded) {
      throw new Error('Dictionary is not loaded yet.');
    }

    const t0 = performance.now();
    this.root = this.createNode();
    const records = this.dict.records;

    for (let idx = 0; idx < records.length; idx++) {
      const r = records[idx];
      const id = r[0];
      const sh = r[1];
      const yomi = r[2];
      const ndc = r[3];
      const syns = r[4] || [];

      // Determine priority:
      // Priority 100: Exact heading without subdivisions or limitation
      // Priority 80: Main heading without parens
      // Priority 60: Synonyms (references)
      // Priority 40: Prefix before subdivision '--'
      const isSubdivision = sh.includes('--') || sh.includes('（細目）');

      // 1. Primary heading (exact)
      this.insertWord(sh, {
        recordIdx: idx,
        isPref: true,
        priority: isSubdivision ? 50 : 100,
        term: sh,
        prefHeading: sh,
        yomi,
        ndc,
        id
      });

      // 2. Primary heading without parens (e.g. "計算機 (数学)" -> "計算機")
      const noParens = sh.replace(/[\(（].*?[\)）]/g, '').trim();
      if (noParens && noParens !== sh) {
        this.insertWord(noParens, {
          recordIdx: idx,
          isPref: true,
          priority: 85,
          term: noParens,
          prefHeading: sh,
          yomi,
          ndc,
          id
        });
      }

      // 3. Main heading before subdivision "--" (e.g. "日本--歴史" -> "日本")
      if (sh.includes('--')) {
        const mainSh = sh.split('--')[0].trim();
        if (mainSh && mainSh !== sh && mainSh !== noParens) {
          this.insertWord(mainSh, {
            recordIdx: idx,
            isPref: true,
            priority: 40,
            term: mainSh,
            prefHeading: sh,
            yomi,
            ndc,
            id
          });
        }
      }

      // 4. Synonyms (References / USE)
      for (let sIdx = 0; sIdx < syns.length; sIdx++) {
        const syn = syns[sIdx].trim();
        if (!syn || syn === sh) continue;

        this.insertWord(syn, {
          recordIdx: idx,
          isPref: false,
          priority: 70,
          term: syn,
          prefHeading: sh,
          yomi,
          ndc,
          id
        });
      }
    }

    this.isBuilt = true;
    const elapsed = Math.round(performance.now() - t0);
    console.log(`NDLSH Tagger index built in ${elapsed}ms.`);
  }

  /**
   * Insert a word into the Trie
   */
  insertWord(word, entry) {
    if (!word) return;
    const lowerWord = word.toLowerCase();
    let curr = this.root;

    for (let i = 0; i < lowerWord.length; i++) {
      const char = lowerWord[i];
      let next = curr.children.get(char);
      if (!next) {
        next = this.createNode();
        curr.children.set(char, next);
      }
      curr = next;
    }

    if (!curr.entries) {
      curr.entries = [];
    }
    const exists = curr.entries.some(
      e => e.recordIdx === entry.recordIdx && e.term === entry.term
    );
    if (!exists) {
      curr.entries.push(entry);
      curr.entries.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Tag text using the Trie
   * @param {string} text - Input text
   * @param {Object} options - Matching options
   * @returns {Object} Tagging results { matches, stats }
   */
  tagText(text, options = {}) {
    if (!this.isBuilt) {
      this.buildIndex();
    }

    const {
      minLen = 2,
      useWordBoundary = false,
      overlap = 'longest' // 'longest' | 'all'
    } = options;

    const t0 = performance.now();
    if (!text || typeof text !== 'string') {
      return { matches: [], stats: { timeMs: 0, totalMatches: 0, uniqueHeadings: 0 } };
    }

    // Enforce 1000 character upper limit
    if (text.length > 1000) {
      text = text.substring(0, 1000);
    }

    // Build word boundary set if requested and Intl.Segmenter is supported
    let boundarySet = null;
    if (useWordBoundary && this.segmenter) {
      boundarySet = new Set();
      const segments = this.segmenter.segment(text);
      for (const seg of segments) {
        boundarySet.add(seg.index);
        boundarySet.add(seg.index + seg.segment.length);
      }
    }

    const matches = [];
    const n = text.length;
    let i = 0;

    while (i < n) {
      let curr = this.root;
      let longestMatch = null;
      let longestLen = 0;
      let j = i;

      while (j < n) {
        const char = text[j].toLowerCase();
        const next = curr.children.get(char);
        if (!next) break;

        curr = next;
        const matchLen = j - i + 1;

        if (curr.entries && curr.entries.length > 0 && matchLen >= minLen) {
          // Check boundary if enabled
          let isValidBoundary = true;
          if (boundarySet) {
            // Check if start (i) and end (j + 1) are on segment boundaries
            isValidBoundary = boundarySet.has(i) && boundarySet.has(j + 1);
          }

          if (isValidBoundary) {
            longestMatch = curr.entries[0];
            longestLen = matchLen;
          }
        }
        j++;
      }

      if (longestMatch) {
        const matchedText = text.substring(i, i + longestLen);
        const record = this.dict.getRecord(longestMatch.recordIdx);

        matches.push({
          start: i,
          end: i + longestLen,
          matchedText,
          entry: longestMatch,
          record
        });

        if (overlap === 'longest') {
          i += longestLen;
        } else {
          i += 1;
        }
      } else {
        i += 1;
      }
    }

    const elapsed = Math.round((performance.now() - t0) * 100) / 100;

    // Calculate statistics
    const uniqueIds = new Set(matches.map(m => m.entry.id));
    const headingCounts = new Map();
    for (const m of matches) {
      const h = m.entry.prefHeading;
      headingCounts.set(h, (headingCounts.get(h) || 0) + 1);
    }

    return {
      matches,
      stats: {
        timeMs: elapsed,
        totalMatches: matches.length,
        uniqueHeadings: uniqueIds.size,
        headingCounts: Array.from(headingCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([heading, count]) => ({ heading, count }))
      }
    };
  }

  /**
   * Render tagged text as HTML
   * @param {string} text - Original input text
   * @param {Array} matches - Matches from tagText
   * @param {string} styleMode - 'modern' | 'classic'
   * @returns {string} Safe HTML string
   */
  renderHtml(text, matches, styleMode = 'modern') {
    if (!matches || matches.length === 0) {
      return this.escapeHtml(text);
    }

    let html = '';
    let last = 0;

    for (let idx = 0; idx < matches.length; idx++) {
      const m = matches[idx];
      // Append non-matched preceding text
      if (m.start > last) {
        html += this.escapeHtml(text.substring(last, m.start));
      }

      const escapedMatched = this.escapeHtml(m.matchedText);
      const prefHeading = this.escapeHtml(this.escapeJsInjection(m.entry.prefHeading));
      const isPref = m.entry.isPref;
      const ndc = this.escapeHtml(this.escapeJsInjection(m.record ? m.record.ndc : ''));
      const yomi = this.escapeHtml(this.escapeJsInjection(m.record ? m.record.yomi : ''));
      const authId = this.escapeHtml(this.escapeJsInjection(m.entry.id || ''));

      if (styleMode === 'classic') {
        // Reproduce original 2012 look: [matchedText] with title attribute
        const titleText = isPref
          ? `【件名標目】${prefHeading}${yomi ? ' (' + yomi + ')' : ''}${ndc ? ' [NDC: ' + ndc + ']' : ''}`
          : `【標目形】${prefHeading} ← (参照形: ${escapedMatched})${yomi ? ' (' + yomi + ')' : ''}${ndc ? ' [NDC: ' + ndc + ']' : ''}`;

        html += `<span class="classic-tag" title="${titleText}" data-record-idx="${m.entry.recordIdx}" data-match-idx="${idx}">[${escapedMatched}]</span>`;
      } else {
        // Modern rich tag badge with popover support
        const badgeClass = isPref ? 'tag-badge is-pref' : 'tag-badge is-syn';
        const tooltipHint = isPref ? prefHeading : `標目: ${prefHeading}`;

        html += `<mark class="${badgeClass}" tabindex="0" ` +
          `data-match-idx="${idx}" ` +
          `data-record-idx="${m.entry.recordIdx}" ` +
          `data-pref="${prefHeading}" ` +
          `data-matched="${escapedMatched}" ` +
          `data-is-pref="${isPref}" ` +
          `data-yomi="${yomi}" ` +
          `data-ndc="${ndc}" ` +
          `data-id="${authId}" ` +
          `title="${tooltipHint}">` +
          `${escapedMatched}` +
          (!isPref ? `<span class="tag-syn-hint">→${prefHeading}</span>` : '') +
          `</mark>`;
      }

      last = m.end;
    }

    if (last < text.length) {
      html += this.escapeHtml(text.substring(last));
    }

    return html;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Escape characters for JavaScript injection prevention:
   * \, ', ", //, \n, /, \r, \t
   * Prepend backslash to escape.
   * @param {string} str
   * @returns {string}
   */
  escapeJsInjection(str) {
    return NDLSHTagger.escapeJsInjection(str);
  }

  static escapeJsInjection(str) {
    if (str == null) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\//g, '\\/')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  }
}

window.NDLSHTagger = NDLSHTagger;
