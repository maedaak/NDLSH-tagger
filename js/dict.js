/**
 * dict.js: NDLSH Dictionary Manager
 * Loads and manages NDLSH subject headings and synonym data.
 */

class NDLSHDictionary {
  constructor() {
    this.records = []; // [id, sh, yomi, ndc, syn_list, ndlc, bt, rt, note]
    this.totalHeadings = 0;
    this.totalSynonyms = 0;
    this.version = '';
    this.isLoaded = false;
    this.loadProgressCallback = null;
  }

  /**
   * Load ndlsh.json asynchronously with progress tracking
   */
  async load(url = 'data/ndlsh.json', onProgress = null) {
    if (this.isLoaded) return true;

    try {
      if (onProgress) onProgress({ percent: 10, message: '辞書データをフェッチ中...' });

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      
      let json;
      if (response.body && totalBytes > 0 && typeof ReadableStream !== 'undefined') {
        const reader = response.body.getReader();
        let receivedBytes = 0;
        const chunks = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          receivedBytes += value.length;
          if (onProgress && totalBytes > 0) {
            const percent = Math.min(85, Math.round((receivedBytes / totalBytes) * 75) + 10);
            onProgress({
              percent,
              message: `ダウンロード中 (${(receivedBytes / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB)...`
            });
          }
        }
        
        if (onProgress) onProgress({ percent: 90, message: 'JSONデータを展開中...' });
        
        // Concat chunks into a single Uint8Array
        const allChunks = new Uint8Array(receivedBytes);
        let position = 0;
        for (const chunk of chunks) {
          allChunks.set(chunk, position);
          position += chunk.length;
        }
        
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(allChunks);
        json = JSON.parse(text);
      } else {
        if (onProgress) onProgress({ percent: 50, message: '辞書データを解析中...' });
        json = await response.json();
      }

      this.version = json.version || '2026-10';
      this.totalHeadings = json.totalHeadings || 0;
      this.totalSynonyms = json.totalSynonyms || 0;
      this.records = json.records || [];
      this.isLoaded = true;

      if (onProgress) onProgress({ percent: 100, message: '読み込み完了' });
      return true;
    } catch (err) {
      console.error('Error loading NDLSH dictionary:', err);
      throw err;
    }
  }

  /**
   * Format a record tuple into an object
   */
  getRecord(index) {
    if (index < 0 || index >= this.records.length) return null;
    const r = this.records[index];
    return {
      index,
      id: r[0],
      sh: r[1],
      yomi: r[2],
      ndc: r[3],
      synonyms: r[4] || [],
      ndlc: r[5] || '',
      bt: r[6] || '',
      rt: r[7] || '',
      note: r[8] || '',
      authUrl: r[0] ? `https://id.ndl.go.jp/auth/ndlsh/${r[0]}` : null,
      ndlSearchUrl: `https://ndlsearch.ndl.go.jp/search?cs=bib&f-ndc=${encodeURIComponent(r[3] || '')}&f-keyword=${encodeURIComponent(r[1])}`
    };
  }

  /**
   * Search dictionary by keyword (incremental search)
   */
  search(keyword, maxResults = 50) {
    if (!this.isLoaded || !keyword) return [];
    const query = keyword.trim().toLowerCase();
    if (!query) return [];

    const results = [];
    const seenIds = new Set();

    for (let i = 0; i < this.records.length; i++) {
      const r = this.records[i];
      const sh = r[1];
      const yomi = r[2];
      const ndc = r[3];
      const syns = r[4] || [];

      let score = 0;
      let matchedTerm = '';

      if (sh.toLowerCase() === query) {
        score = 100;
        matchedTerm = sh;
      } else if (sh.toLowerCase().startsWith(query)) {
        score = 80;
        matchedTerm = sh;
      } else if (sh.toLowerCase().includes(query)) {
        score = 60;
        matchedTerm = sh;
      } else if (yomi && yomi.replace(/\s+/g, '').includes(query.replace(/\s+/g, ''))) {
        score = 50;
        matchedTerm = `${yomi} (読み)`;
      } else if (ndc && ndc.startsWith(query)) {
        score = 40;
        matchedTerm = `NDC: ${ndc}`;
      } else {
        // check synonyms
        for (const s of syns) {
          if (s.toLowerCase() === query) {
            score = 70;
            matchedTerm = `同義語: ${s}`;
            break;
          } else if (s.toLowerCase().startsWith(query)) {
            score = 55;
            matchedTerm = `同義語: ${s}`;
            break;
          } else if (s.toLowerCase().includes(query)) {
            score = 45;
            matchedTerm = `同義語: ${s}`;
            break;
          }
        }
      }

      if (score > 0) {
        results.push({
          record: this.getRecord(i),
          score,
          matchedTerm
        });
        seenIds.add(r[0]);
        if (results.length >= maxResults * 3) break;
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }
}

window.NDLSHDictionary = NDLSHDictionary;
