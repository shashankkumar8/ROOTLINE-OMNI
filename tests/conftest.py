import os

os.environ["ROOTLINE_GRAPH"] = "rootline_test"  # isolated graph: never touches the dev graph

import pytest
from fastapi.testclient import TestClient

from backend import graph
from backend.main import app
from backend.seed import seed


@pytest.fixture(autouse=True)
def fresh_graph():
    graph.reset()
    graph.delete_graph()
    seed()
    yield


@pytest.fixture
def client():
    return TestClient(app)
