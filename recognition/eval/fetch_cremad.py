"""Fetch a small subset of CREMA-D talking-head clips for the offline eval.

CREMA-D (Cao et al., 2014) is licensed ODbL 1.0 (database) + DbCL 1.0 (contents).
We pull individual clips out of a public zip mirror with HTTP range requests so
the full 2.1 GB archive is never downloaded.

Usage:
    python eval/fetch_cremad.py --list            # show archive layout
    python eval/fetch_cremad.py --per-sentence 8  # 12 sentences x 8 speakers = 96 clips
"""
from __future__ import annotations

import argparse
import io
import json
import random
import urllib.request
import zipfile
from pathlib import Path

URL = "https://huggingface.co/datasets/NoahMartinezXiang/2014_CREMA-D/resolve/main/CREMA-D.zip"
UA = "tacit-research/0.1"
OUT = Path(__file__).resolve().parent / "clips" / "cremad"

SENTENCES = {
    "IEO": "it's eleven o'clock",
    "TIE": "that is exactly what happened",
    "IOM": "i'm on my way to the meeting",
    "IWW": "i wonder what this is about",
    "TAI": "the airplane is almost full",
    "MTI": "maybe tomorrow it will be cold",
    "IWL": "i would like a new alarm clock",
    "ITH": "i think i have a doctor's appointment",
    "DFA": "don't forget a jacket",
    "ITS": "i think i've seen this before",
    "TSI": "the surface is slick",
    "WSI": "we'll stop in a couple of minutes",
}


class HttpRangeFile(io.RawIOBase):
    """Seekable read-only file over HTTP range requests (enough for zipfile)."""

    def __init__(self, url: str):
        self.url = url
        self.pos = 0
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Range": "bytes=0-0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            self.size = int(r.headers["Content-Range"].split("/")[1])
            self.final_url = r.geturl()

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        if whence == 0:
            self.pos = off
        elif whence == 1:
            self.pos += off
        else:
            self.pos = self.size + off
        return self.pos

    def read(self, n=-1):
        if n < 0:
            n = self.size - self.pos
        if n == 0 or self.pos >= self.size:
            return b""
        end = min(self.pos + n, self.size) - 1
        req = urllib.request.Request(
            self.url, headers={"User-Agent": UA, "Range": f"bytes={self.pos}-{end}"}
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
        self.pos += len(data)
        return data

    def readinto(self, b):
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--per-sentence", type=int, default=8)
    ap.add_argument("--emotion", default="NEU")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    zf = zipfile.ZipFile(io.BufferedReader(HttpRangeFile(URL), buffer_size=1 << 20))
    names = zf.namelist()
    if args.list:
        print(len(names), "entries")
        for n in names[:40]:
            print(" ", n, zf.getinfo(n).file_size)
        return

    vids = [n for n in names if n.lower().endswith((".flv", ".mp4", ".avi"))]
    rng = random.Random(args.seed)
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for code, text in SENTENCES.items():
        pool = sorted(n for n in vids if f"_{code}_{args.emotion}_" in n)
        rng.shuffle(pool)
        for n in pool[: args.per_sentence]:
            dst = OUT / Path(n).name
            if not dst.exists():
                dst.write_bytes(zf.read(n))
            manifest.append(
                {"file": f"clips/cremad/{dst.name}", "text": text, "speaker": dst.name.split("_")[0],
                 "sentence": code, "source": "CREMA-D", "license": "ODbL-1.0 / DbCL-1.0"}
            )
            print("ok", dst.name, dst.stat().st_size)
    (OUT.parent.parent / "cremad_manifest.json").write_text(json.dumps(manifest, indent=1))
    print(len(manifest), "clips ->", OUT)


if __name__ == "__main__":
    main()
