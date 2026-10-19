"""FalkorDB connection helpers. All product data lives in FalkorDB; there is no fallback store."""
import os
from contextlib import contextmanager
from contextvars import ContextVar

from falkordb import FalkorDB
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import ResponseError as RedisResponseError
from redis.exceptions import TimeoutError as RedisTimeoutError

_db = None
_override: ContextVar = ContextVar("rootline_graph_override", default=None)


class GraphUnavailable(Exception):
    """Raised when FalkorDB cannot be reached. The API turns this into a 503."""


def reset():
    global _db
    _db = None


def graph_name() -> str:
    return _override.get() or os.getenv("ROOTLINE_GRAPH", "rootline")


@contextmanager
def use_graph(name: str):
    """Route all run() calls inside the block to another graph (used for isolated simulations)."""
    token = _override.set(name)
    try:
        yield
    finally:
        _override.reset(token)


def get_db():
    global _db
    if _db is None:
        embedded = os.getenv("FALKORDB_EMBEDDED_PATH")  # dev/test only (falkordblite, not Windows)
        if embedded:
            from redislite.falkordb_client import FalkorDB as Embedded
            _db = Embedded(embedded)
        else:
            _db = FalkorDB(
                host=os.getenv("FALKORDB_HOST", "localhost"),
                port=int(os.getenv("FALKORDB_PORT", "6379")),
                password=os.getenv("FALKORDB_PASSWORD") or None,
                socket_connect_timeout=3,
            )
    return _db


def get_graph():
    return get_db().select_graph(graph_name())


def run(cypher: str, params: dict | None = None) -> list:
    """Run a parameterized Cypher query (read-write) and return raw result rows."""
    try:
        return get_graph().query(cypher, params or {}).result_set
    except (RedisConnectionError, RedisTimeoutError, OSError) as exc:
        raise GraphUnavailable(str(exc)) from exc


def ro_run(cypher: str, params: dict | None = None) -> list:
    """Run a parameterized read-only Cypher query using native ro_query.
    Fails closed if FalkorDB is unavailable or if a non-read query is attempted.
    If the graph key does not exist in FalkorDB (empty/deleted graph), returns an empty result set."""
    try:
        return get_graph().ro_query(cypher, params or {}).result_set
    except RedisResponseError as exc:
        if "empty key" in str(exc).lower() or "does not exist" in str(exc).lower():
            return []
        raise
    except (RedisConnectionError, RedisTimeoutError, OSError) as exc:
        raise GraphUnavailable(str(exc)) from exc


def delete_graph():
    try:
        get_graph().delete()
    except Exception:
        pass  # graph did not exist yet
