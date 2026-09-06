#!/usr/bin/env python3
"""Fetch the .pkg.tar.zst asset from a release into an output dir.
Usage: env RID=<release_id> GITHUB_TOKEN=<token> python3 fetch-release-pkg.py <out_dir>
"""
import json
import os
import pathlib
import sys
import urllib.request


def main() -> None:
    rid, token, out_dir = os.environ["RID"], os.environ["GITHUB_TOKEN"], sys.argv[1]
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        f"https://api.github.com/repos/SonicBotMan/motrix-ai/releases/{rid}",
        headers={"Authorization": f"Bearer {token}"},
    )
    data = json.load(urllib.request.urlopen(req))
    for asset in data["assets"]:
        if asset["name"].endswith(".pkg.tar.zst"):
            req2 = urllib.request.Request(
                asset["url"],
                headers={"Authorization": f"Bearer {token}", "Accept": "application/octet-stream"},
            )
            (out / asset["name"]).write_bytes(urllib.request.urlopen(req2).read())
            print("downloaded", asset["name"])
            return
    raise SystemExit("no .pkg.tar.zst asset in release")


if __name__ == "__main__":
    main()
