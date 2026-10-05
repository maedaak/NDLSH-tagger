#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
update_data.py: Download latest NDLSH TSV from National Diet Library and update data/ndlsh.json.
"""

import urllib.request
import zipfile
import io
import os
import sys
from build_data import build_data

NDLSH_URL = "https://id.ndl.go.jp/auth/data/download/ndlsh-tsv.zip"

def update():
    print(f"Downloading latest NDLSH TSV from {NDLSH_URL} ...")
    req = urllib.request.Request(
        NDLSH_URL,
        headers={'User-Agent': 'NDLSH-Tagger-Updater/1.0'}
    )
    with urllib.request.urlopen(req) as response:
        zip_bytes = response.read()

    print(f"Downloaded {len(zip_bytes):,} bytes. Extracting...")
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        for filename in z.namelist():
            if filename.endswith('.tsv'):
                z.extract(filename, '.')
                tsv_path = filename
                print(f"Extracted: {tsv_path}")
                break
        else:
            print("Error: No TSV file found in the archive.")
            sys.exit(1)

    print("Rebuilding data/ndlsh.json...")
    build_data(tsv_path=tsv_path, out_json='data/ndlsh.json')
    print("Done! Data updated successfully.")

if __name__ == '__main__':
    update()
