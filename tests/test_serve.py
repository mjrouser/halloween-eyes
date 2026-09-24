"""Tests for the local show server.

Run: .venv/bin/pytest tests/test_serve.py -v
"""
import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from server.serve import VALID, load_config, make_server


@pytest.fixture()
def running(tmp_path):
    root = tmp_path / "public"
    root.mkdir()
    (root / "index.html").write_text("<h1>eyes</h1>", encoding="utf-8")
    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps(
            {
                "shape": "amber",
                "palette": "amber",
                "energyDrift": True,
                "crowdStyle": "shrink",
                "effectiveAt": 0,
            }
        ),
        encoding="utf-8",
    )
    server = make_server(root=root, config_path=config_path, port=0, bind="127.0.0.1")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    yield base, config_path
    server.shutdown()
    server.server_close()


def get(url):
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.status, response.read()


def post(url, payload):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read())


def test_serves_static_files(running):
    base, _ = running
    status, body = get(f"{base}/index.html")
    assert status == 200
    assert b"eyes" in body


def test_serves_config(running):
    base, _ = running
    status, body = get(f"{base}/config.json")
    assert status == 200
    assert json.loads(body)["shape"] == "amber"


def test_accepts_a_valid_change(running):
    base, config_path = running
    status, body = post(f"{base}/config", {"shape": "ember", "palette": "green"})
    assert status == 200
    written = json.loads(config_path.read_text(encoding="utf-8"))
    assert written["shape"] == "ember"
    assert written["palette"] == "green"
    assert written["effectiveAt"] > 0, "a change must be scheduled, not immediate"
    assert body["effectiveAt"] == written["effectiveAt"]


def test_schedules_far_enough_ahead(running):
    """Lead time must exceed the client poll interval or a window can apply late."""
    base, _ = running
    import time

    status, body = post(f"{base}/config", {"shape": "ember"})
    assert status == 200
    lead_ms = body["effectiveAt"] - time.time() * 1000
    assert lead_ms > 2000, f"lead time {lead_ms}ms does not clear the 2s poll interval"


def test_rejects_unknown_values(running):
    base, config_path = running
    before = config_path.read_text(encoding="utf-8")
    status, body = post(f"{base}/config", {"shape": "banana"})
    assert status == 400
    assert "shape" in body["error"]
    assert config_path.read_text(encoding="utf-8") == before, "invalid input must not write"


def test_rejects_unknown_keys(running):
    base, _ = running
    status, _ = post(f"{base}/config", {"nonsense": True})
    assert status == 400


def test_load_config_falls_back_to_defaults(tmp_path):
    missing = tmp_path / "nope.json"
    config = load_config(missing)
    assert config["shape"] in VALID["shape"]


def test_load_config_survives_corrupt_json(tmp_path):
    broken = tmp_path / "config.json"
    broken.write_text("{ not json", encoding="utf-8")
    config = load_config(broken)
    assert config["shape"] in VALID["shape"]


def test_rejects_non_scalar_values(running):
    """A list can't be checked against a set of allowed values — it must be a 400, not a crash."""
    base, config_path = running
    before = config_path.read_text(encoding="utf-8")
    status, body = post(f"{base}/config", {"shape": ["amber"]})
    assert status == 400
    assert "shape" in body["error"]
    assert config_path.read_text(encoding="utf-8") == before


def test_rejects_numbers_posing_as_booleans(running):
    """In Python 1 == True, so a plain membership check would accept 1 for energyDrift."""
    base, config_path = running
    before = config_path.read_text(encoding="utf-8")
    status, _ = post(f"{base}/config", {"energyDrift": 1})
    assert status == 400
    assert config_path.read_text(encoding="utf-8") == before


def test_load_config_ignores_wrongly_typed_values(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"shape": ["ember"], "energyDrift": 0}), encoding="utf-8")
    config = load_config(path)
    assert config["shape"] == "amber"
    assert config["energyDrift"] is True


def test_load_config_survives_non_object_json(tmp_path):
    path = tmp_path / "config.json"
    path.write_text("[]", encoding="utf-8")
    config = load_config(path)
    assert config["shape"] in VALID["shape"]
