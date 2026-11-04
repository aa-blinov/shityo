"""Bootstrap a fresh checkout: virtualenv, locked dependencies and UI build."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def venv_python() -> Path:
    if os.name == "nt":
        return ROOT / ".venv" / "Scripts" / "python.exe"
    return ROOT / ".venv" / "bin" / "python"


def npm_command() -> str:
    for candidate in ("npm.cmd" if os.name == "nt" else "npm", "npm"):
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise RuntimeError("npm was not found on PATH")


def run(command: list[str], cwd: Path = ROOT) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def main() -> int:
    python = venv_python()
    if not python.exists():
        run([sys.executable, "-m", "venv", str(ROOT / ".venv")])

    run([str(python), "-m", "pip", "install", "--upgrade", "pip"])
    run([str(python), "-m", "pip", "install", "-r", "requirements-dev.txt"])

    npm = npm_command()
    run([npm, "ci", "--prefix", "frontend"])
    run([npm, "ci", "--prefix", "e2e"])
    run([npm, "run", "build", "--prefix", "frontend"])

    print()
    print("Bootstrap complete.")
    print("Start the services with: python scripts/dev.py")
    print("Install Chromium for browser checks with: cd e2e && npx playwright install chromium")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
