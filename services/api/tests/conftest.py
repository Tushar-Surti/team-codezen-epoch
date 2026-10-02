import os
from pathlib import Path
os.environ.setdefault("RETENT_MODELS_DIR", str(Path(__file__).resolve().parent / "_no_models"))
