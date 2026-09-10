import os
import tempfile
from collections.abc import Iterator

import pytest

_tmp = tempfile.mkdtemp(prefix="civicflow-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["MODEL_PROVIDER"] = "local"
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["MONITOR_INTERVAL_SECONDS"] = "3600"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c
