#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_data.py: Convert NDLSH TSV export to optimized JSON for Web NDLSH-tagger.
"""

import csv
import json
import gzip
import os
import re
import sys

def build_data(tsv_path='ndlsh-tsv.tsv', out_json='data/ndlsh.json'):
    if not os.path.exists(tsv_path):
        print(f"Error: {tsv_path} not found.")
        sys.exit(1)

    print(f"Reading {tsv_path}...")
    items = []
    unique_terms = set()
    total_headings = 0
    total_synonyms = 0

    with open(tsv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f, delimiter='\t')
        headers = next(reader)
        
        for row in reader:
            if not row:
                continue
            sh = row[0].strip()
            if not sh:
                continue
            
            yomi = row[1].strip() if len(row) > 1 else ''
            auth_id = row[2].strip() if len(row) > 2 else ''
            syns_str = row[3].strip() if len(row) > 3 else ''
            bt = row[4].strip() if len(row) > 4 else ''
            nt = row[5].strip() if len(row) > 5 else ''
            rt = row[6].strip() if len(row) > 6 else ''
            note = row[7].strip() if len(row) > 7 else ''
            ndlc = row[8].strip() if len(row) > 8 else ''
            ndc9 = row[9].strip() if len(row) > 9 else ''
            ndc10 = row[10].strip() if len(row) > 10 else ''
            ndc = ndc10 if ndc10 else ndc9

            # Parse synonyms (stripping [yomi])
            syn_list = []
            if syns_str:
                for s in syns_str.split(';'):
                    s = s.strip()
                    if not s:
                        continue
                    clean_s = re.sub(r'\[.*?\]', '', s).strip()
                    if clean_s and clean_s != sh and clean_s not in syn_list:
                        syn_list.append(clean_s)
                        unique_terms.add(clean_s.lower())
                        total_synonyms += 1

            unique_terms.add(sh.lower())
            total_headings += 1

            # Compact record:
            # [id, sh, yomi, ndc, syn_list, ndlc, bt, rt, note]
            items.append([
                auth_id,
                sh,
                yomi,
                ndc,
                syn_list,
                ndlc,
                bt,
                rt,
                note
            ])

    data = {
        'version': '2026-10',
        'totalHeadings': total_headings,
        'totalSynonyms': total_synonyms,
        'uniqueTermsCount': len(unique_terms),
        'records': items
    }

    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    raw_size = os.path.getsize(out_json)
    
    # Also check gzip compression size for info
    with open(out_json, 'rb') as f:
        gz_data = gzip.compress(f.read())
        gz_size = len(gz_data)

    print(f"Built {out_json} successfully:")
    print(f"  Total Headings: {total_headings:,}")
    print(f"  Total Synonyms: {total_synonyms:,}")
    print(f"  Unique Search Terms: {len(unique_terms):,}")
    print(f"  JSON file size: {raw_size:,} bytes ({raw_size/1024/1024:.2f} MB)")
    print(f"  Gzip size: {gz_size:,} bytes ({gz_size/1024/1024:.2f} MB)")

if __name__ == '__main__':
    build_data()
