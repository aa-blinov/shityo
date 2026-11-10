"""Основы: список, проверка, отчёт и заготовка новой основы.

    python scripts/blocks.py list
    python scripts/blocks.py check [id ...] [--quick] [--json]
    python scripts/blocks.py report            # docs/BLOCKS-REPORT.md
    python scripts/blocks.py new <id> --name "Название" --from tee

``check`` строит основу на всей сетке ГОСТ, сверяет пары швов паспорта и
типовые размеры ЕМКО (reference.toml); код выхода 1, если что-то не прошло.
``new`` копирует паспорт и типовые размеры существующей основы в новую
папку: основа сразу строится, дальше её правят (docs/BLOCKS.md).
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.blocks import ROOT as BLOCKS, passports  # noqa: E402
from app.blocks.check import Report, check_block  # noqa: E402

MARK = {"ok": "ok", "accepted": "принято", "fail": "ОШИБКА"}


def _range(row) -> str:
    if row.expected is None:
        return ""
    low, high = row.expected
    return f"{low:g}" if low == high else f"{low:g}...{high:g}"


def _print(report: Report) -> None:
    head = "OK" if report.ok else "ОШИБКА"
    print(f"\n{report.block} - {report.name} [{head}]  {report.source['method']}")
    for row in report.rows:
        value = "" if row.actual is None else f"{row.actual:g} {row.unit}"
        expected = _range(row)
        line = f"  {MARK[row.status]:8} {row.level:9} {row.figure:16} {row.name}"
        if value or expected:
            line += f": {value} (норма {expected})"
        if row.note:
            line += f" - {row.note}"
        print(line)


def cmd_list(_args) -> int:
    for block_id, passport in passports().items():
        print(
            f"{passport.order:3} {block_id:12} {passport.name:16} {passport.source.kind:8} {passport.draft}"
        )
    return 0


def cmd_check(args) -> int:
    ids = args.ids or list(passports())
    unknown = [i for i in ids if i not in passports()]
    if unknown:
        print(f"Неизвестные основы: {', '.join(unknown)}", file=sys.stderr)
        return 2
    reports = [check_block(block_id, full_grid=not args.quick) for block_id in ids]
    if args.json:
        print(json.dumps([r.to_dict() for r in reports], ensure_ascii=False, indent=2))
    else:
        for report in reports:
            _print(report)
        failed = [r.block for r in reports if not r.ok]
        print(f"\nОснов: {len(reports)}, с ошибками: {len(failed)} {' '.join(failed)}")
    return 0 if all(r.ok for r in reports) else 1


def cmd_report(_args) -> int:
    lines = [
        "# Отчёт о проверке основ",
        "",
        "Создан командой `python scripts/blocks.py report`. Проверки описаны в",
        "docs/BLOCKS.md; «принято» - сознательное отклонение с причиной из",
        "reference.toml.",
        "",
    ]
    for block_id in passports():
        report = check_block(block_id)
        counts = report.to_dict()["counts"]
        lines += [
            f"## {report.name} (`{block_id}`)",
            "",
            f"Методика: {report.source['method']}. {report.source.get('notes', '')}".rstrip(),
            "",
            f"Итог: {'проходит' if report.ok else 'есть ошибки'}; ok {counts['ok']}, принято {counts['accepted']}, ошибок {counts['fail']}.",
            "",
            "| Проверка | Фигура | Значение | Норма | Итог |",
            "| --- | --- | --- | --- | --- |",
        ]
        for row in report.rows:
            value = "" if row.actual is None else f"{row.actual:g} {row.unit}"
            note = f" ({row.note})" if row.note else ""
            lines.append(
                f"| {row.name}{note} | {row.figure} | {value} | {_range(row)} | {MARK[row.status]} |"
            )
        lines.append("")
    out = ROOT / "docs" / "BLOCKS-REPORT.md"
    out.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"Записан {out.relative_to(ROOT)}")
    return 0


def cmd_new(args) -> int:
    if not re.match(r"^[a-z][a-z0-9_]{0,31}$", args.id):
        print("id: латиница в нижнем регистре, цифры и _, до 32 символов", file=sys.stderr)
        return 2
    if args.id in passports():
        print(f"Основа {args.id} уже есть", file=sys.stderr)
        return 2
    source = passports().get(args.based_on)
    if source is None:
        print(f"Нет основы-образца {args.based_on}", file=sys.stderr)
        return 2
    folder = BLOCKS / args.id
    folder.mkdir()
    text = (BLOCKS / args.based_on / "passport.toml").read_text(encoding="utf-8")
    order = max(p.order for p in passports().values()) + 1
    text = re.sub(r'^id = ".*"$', f'id = "{args.id}"', text, count=1, flags=re.M)
    text = re.sub(r"^order = \d+$", f"order = {order}", text, count=1, flags=re.M)
    text = re.sub(r'^name = ".*"$', f'name = "{args.name}"', text, count=1, flags=re.M)
    text = re.sub(
        r"^# Паспорт основы «.*?»\.",
        f"# Паспорт основы «{args.name}» (заготовка от «{source.name}»).",
        text,
        count=1,
        flags=re.M,
    )
    (folder / "passport.toml").write_text(text, encoding="utf-8", newline="\n")
    ref = BLOCKS / args.based_on / "reference.toml"
    if ref.exists():
        shutil.copy(ref, folder / "reference.toml")
    print(f"Создана {folder.relative_to(ROOT)}: паспорт и типовые размеры от «{source.name}».")
    print("Дальше: функция построения (draft), детали, пары швов, источник; затем")
    print(f"  python scripts/blocks.py check {args.id}")
    print(
        "Интерфейсу нужны подписи: model.<id>.* и piece.* в frontend/src/lib/i18n, эскиз в GarmentSketch."
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="все основы").set_defaults(run=cmd_list)
    check = sub.add_parser("check", help="проверить основы")
    check.add_argument("ids", nargs="*")
    check.add_argument("--quick", action="store_true", help="только первые размеры сетки")
    check.add_argument("--json", action="store_true")
    check.set_defaults(run=cmd_check)
    sub.add_parser("report", help="docs/BLOCKS-REPORT.md").set_defaults(run=cmd_report)
    new = sub.add_parser("new", help="заготовка новой основы")
    new.add_argument("id")
    new.add_argument("--name", required=True)
    new.add_argument("--from", dest="based_on", default="tee")
    new.set_defaults(run=cmd_new)
    args = parser.parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    raise SystemExit(main())
