"""Write the contract to JSON Schema (consumed by the web app's type generator).

Run: uv run --package retent-core python -m retent_core.contract_export
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic.json_schema import models_json_schema

from retent_core.contract import EXPORTED_MODELS

OUT = Path(__file__).resolve().parents[2] / "schema" / "contract.schema.json"


def build_schema() -> dict:
    _, schema = models_json_schema(
        [(model, "serialization") for model in EXPORTED_MODELS.values()],
        ref_template="#/$defs/{model}",
        title="Retent AI contract",
    )
    # Expose every exported model at the top level so the TS generator emits each one.
    schema["type"] = "object"
    schema["properties"] = {name: {"$ref": f"#/$defs/{name}"} for name in EXPORTED_MODELS}
    schema["additionalProperties"] = False
    return schema


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Explicit UTF-8: the platform default (cp1252 on Windows) fails on any non-ASCII description.
    OUT.write_text(json.dumps(build_schema(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
