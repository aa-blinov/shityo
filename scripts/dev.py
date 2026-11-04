"""Start the backend API and the SvelteKit dev server, then stop both on exit."""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
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


def start_process(command: list[str], env: dict[str, str]) -> subprocess.Popen:
    options: dict = {}
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    else:
        options["preexec_fn"] = os.setsid
    return subprocess.Popen(command, cwd=ROOT, env=env, **options)


def stop_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/pid", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="Frontend host")
    parser.add_argument("--port", type=int, default=5173, help="Frontend port")
    parser.add_argument("--api-host", default="127.0.0.1", help="Backend host")
    parser.add_argument("--api-port", type=int, default=8000, help="Backend port")
    args = parser.parse_args()

    python = venv_python()
    if not python.exists():
        python = Path(sys.executable)

    backend_origin = f"http://{args.api_host}:{args.api_port}"
    env = {**os.environ, "BACKEND_ORIGIN": backend_origin}
    npm = npm_command()

    backend = start_process(
        [
            str(python),
            "-m",
            "uvicorn",
            "app.main:app",
            "--app-dir",
            "backend",
            "--host",
            args.api_host,
            "--port",
            str(args.api_port),
        ],
        env,
    )
    frontend = start_process(
        [
            npm,
            "run",
            "dev",
            "--prefix",
            "frontend",
            "--",
            "--host",
            args.host,
            "--port",
            str(args.port),
            "--strictPort",
        ],
        env,
    )

    print(f"backend:  http://{args.api_host}:{args.api_port}")
    print(f"frontend: http://{args.host}:{args.port}")
    print("Ctrl+C stops both.")

    result = 0
    try:
        while True:
            backend_code = backend.poll()
            frontend_code = frontend.poll()
            if backend_code is not None:
                print(f"backend exited with code {backend_code}")
                result = backend_code
                break
            if frontend_code is not None:
                print(f"frontend exited with code {frontend_code}")
                result = frontend_code
                break
            time.sleep(0.2)
    except KeyboardInterrupt:
        result = 130
    finally:
        stop_process(frontend)
        stop_process(backend)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
