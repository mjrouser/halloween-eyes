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


def test_static_files_are_revalidated_every_load(running):
    # Without this, Chromium caches the show's JS heuristically and a restarted
    # window keeps running the OLD code after a deploy (seen on the Pi 2026-09-29).
    base, _ = running
    with urllib.request.urlopen(f"{base}/index.html", timeout=5) as response:
        assert response.headers["Cache-Control"] == "no-cache"


def test_config_is_never_cached(running):
    base, _ = running
    with urllib.request.urlopen(f"{base}/config.json", timeout=5) as response:
        assert response.headers.get_all("Cache-Control") == ["no-store"]


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


# --- Test gags ---------------------------------------------------------------

import re

from server.serve import PERFORMANCE_NAMES, SCHEDULE_LEAD_MS


def test_performance_names_match_the_show():
    """The server's names are a copy of poses.js. Fail if the two drift apart."""
    source = (Path(__file__).parent.parent / "public/js/poses.js").read_text(encoding="utf-8")
    names = []
    for const in ("GAG_NAMES", "REACTION_NAMES"):
        body = re.search(rf"export const {const} = \[(.*?)\]", source, re.S).group(1)
        names += re.findall(r"'([^']+)'", body)
    assert list(PERFORMANCE_NAMES) == names


def test_test_gag_off_by_default(running):
    base, _ = running
    _, body = get(f"{base}/config.json")
    assert json.loads(body)["testGag"] == "off"


def test_accepts_each_test_gag_and_schedules_it(running):
    import time

    base, _ = running
    for name in PERFORMANCE_NAMES:
        status, body = post(f"{base}/config", {"testGag": name})
        assert status == 200, body
        assert body["testGag"] == name
        lead_ms = body["testGagAt"] - time.time() * 1000
        assert 2000 < lead_ms <= SCHEDULE_LEAD_MS + 100, f"lead {lead_ms}ms"


def test_rejects_unknown_or_non_string_test_gags(running):
    base, _ = running
    for bad in ["nope", "idle", "toString", "", 1, True, None, ["crossEyed"]]:
        status, _ = post(f"{base}/config", {"testGag": bad})
        assert status == 400, f"accepted {bad!r}"


def test_stop_turns_the_test_gag_off(running):
    base, _ = running
    post(f"{base}/config", {"testGag": "crossEyed"})
    status, body = post(f"{base}/config", {"testGag": "off"})
    assert status == 200
    assert body["testGag"] == "off"


def test_a_later_style_change_does_not_replay_the_test(running):
    base, _ = running
    _, first = post(f"{base}/config", {"testGag": "crossEyed"})
    _, later = post(f"{base}/config", {"palette": "green"})
    assert later["testGagAt"] == first["testGagAt"], "testGagAt must only move when a test is posted"


def test_load_config_ignores_a_non_numeric_test_gag_at(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"testGag": "crossEyed", "testGagAt": "soon"}), encoding="utf-8")
    config = load_config(path)
    assert config["testGag"] == "crossEyed"
    assert config["testGagAt"] == 0
