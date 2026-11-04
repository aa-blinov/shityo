"""Run the pinned golden-repo house checker without vendoring it."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "v1.0.11"
ARCHIVE_URL = f"https://codeload.github.com/aa-blinov/golden-repo/zip/refs/tags/{VERSION}"


def checker_dir() -> Path:
    return ROOT / ".cache" / "golden-repo" / VERSION


def fetch_checker(target: Path) -> None:
    parent = target.parent
    parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=parent) as temporary:
        archive = Path(temporary) / "golden-repo.zip"
        print(f"fetching golden-repo {VERSION}", flush=True)
        with urllib.request.urlopen(ARCHIVE_URL, timeout=60) as response:
            archive.write_bytes(response.read())
        extract_root = Path(temporary) / "extract"
        extract_root.mkdir()
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.infolist():
                destination = extract_root / member.filename
                resolved = destination.resolve()
                if not str(resolved).startswith(str(extract_root.resolve())):
                    raise RuntimeError(f"unsafe path in archive: {member.filename}")
            bundle.extractall(extract_root)
        extracted = next(extract_root.iterdir())
        shutil.move(str(extracted), target)


def main() -> int:
    target = checker_dir()
    checker = target / "scripts" / "housecheck.py"
    try:
        if not checker.exists():
            fetch_checker(target)
    except Exception as exc:  # noqa: BLE001 - surface any download/extract failure unchanged
        print(f"could not fetch golden-repo {VERSION}: {exc}", file=sys.stderr)
        return 1

    args = sys.argv[1:] or [str(ROOT)]
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    return subprocess.call([sys.executable, str(checker), *args], cwd=ROOT, env=env)


if __name__ == "__main__":
    raise SystemExit(main())
