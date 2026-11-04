"""Audit every catalog control and size row using actual geometry and seam checks."""

from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.drafts import CATALOG, build_draft
from app.drafts.base import DraftError
from app.core.measurements import SPECS
from app.core.sizes import SIZE_GRIDS
from app.core.validation import validate


def audit():
    rows = []
    for item in CATALOG:
        model = item["id"]
        defaults = item["default_measurements"]
        cases = [("defaults", defaults, {})]
        cases += [(f"size={row['size']}", row["measurements"], {}) for row in SIZE_GRIDS[model]]
        for key in item["measurements"]:
            spec = SPECS[key]
            for value in (spec.min, spec.max):
                cases.append((f"{key}={value}", {**defaults, key: value}, {}))
        for key, spec in item["params"].items():
            values = (
                (spec["min"], spec["max"])
                if spec["type"] == "number"
                else [o["value"] for o in spec["options"]]
            )
            cases += [(f"{key}={v}", defaults, {key: v}) for v in values]
        if model in ("tee", "shirt"):
            for fit in ("slim", "regular", "loose", "oversize"):
                for neckline in ("crew", "v", "square", "scoop"):
                    cases.append(
                        (
                            f"fit={fit},neckline={neckline}",
                            defaults,
                            {"fit": fit, "neckline": neckline},
                        )
                    )
            for length in (-30, 30):
                for waist in (60, 140):
                    cases.append(
                        (
                            f"length_delta={length},waist={waist}",
                            {**defaults, "waist": waist},
                            {"length_delta": length},
                        )
                    )
        for name, measurements, params in cases:
            try:
                pieces = build_draft(model, measurements, params)
                report = validate(pieces, measurements, params)
                rows.append(
                    {
                        "model": model,
                        "case": name,
                        "status": "valid" if report["ok"] else "invalid",
                        "errors": report["error_texts"],
                    }
                )
            except DraftError as error:
                rows.append(
                    {"model": model, "case": name, "status": "rejected", "errors": [str(error)]}
                )
    summary = {
        status: sum(r["status"] == status for r in rows)
        for status in ("valid", "invalid", "rejected")
    }
    return {"summary": summary, "cases": rows}


if __name__ == "__main__":
    report = audit()
    target = Path(__file__).resolve().parents[1] / "work" / "formula-audit.json"
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"]))
    for row in report["cases"]:
        if row["status"] != "valid":
            print(row["model"], row["case"], row["status"], row["errors"])
