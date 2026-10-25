#!/usr/bin/env python3
"""Independent public-site check. State and notification bodies contain no credentials."""
import argparse
from datetime import date, datetime, timedelta, timezone
from http.client import HTTPException
import json
import os
from pathlib import Path
import time
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

SITE = "https://educatedai.org"
NETWORK_ERRORS = (URLError, OSError, TimeoutError, HTTPException, UnicodeError)


def fetch(url):
    with urlopen(Request(url, headers={"Cache-Control": "no-cache"}), timeout=15) as response:
        return response.status, response.read().decode("utf-8")


def notify(key, body, topic, say=print):
    if not topic:
        say(f"would send {key}: {body}")
        return True
    request = Request("https://ntfy.sh/" + quote(topic, safe=""), data=body.encode(),
                      headers={"Title": "educatedai.org (outside check)", "Priority": "4",
                               "Click": SITE + "/"}, method="POST")
    try:
        with urlopen(request, timeout=15) as response:
            if not 200 <= response.status < 300:
                say(f"notification failed: {key}")
                return False
    except NETWORK_ERRORS:
        # Exceptions can contain the secret URL. Never print them.
        say(f"notification failed: {key}")
        return False
    return True


def run(state, *, fetch=fetch, clock=lambda: datetime.now(timezone.utc), sleep=time.sleep,
        send=None, say=print):
    """Mutate JSON-compatible state; fetch returns (HTTP status, text)."""
    now = clock().astimezone(timezone.utc)
    today = now.date()
    sent = state.setdefault("sent", {})
    for key in list(sent):
        if date.fromisoformat(key.rsplit(":", 1)[1]) < today - timedelta(days=8):
            del sent[key]
    if send is None:
        send = lambda key, body: notify(key, body, os.environ.get("NTFY_TOPIC", ""), say)

    def alert(key, body):
        token = f"{key}:{today.isoformat()}"
        if token not in sent and send(key, body):
            sent[token] = now.isoformat()

    def get(path):
        try:
            return fetch(SITE + path)
        except NETWORK_ERRORS:
            return 0, ""

    responses = {}
    pending = {"/", "/data/manifest.json"}
    for attempt in range(3):
        for path in sorted(pending):
            responses[path] = get(path)
        pending = {path for path in pending if responses[path][0] != 200}
        if not pending:
            break
        if attempt < 2:
            sleep(20)
    previous = state.get("fails", 0)
    if pending:
        state["fails"] = previous + 1
        if state["fails"] >= 2:
            alert("site-down", "educatedai.org: public site is unreachable (two consecutive outside checks failed).")
        return state
    state["fails"] = 0
    if previous >= 2 and any(key.startswith("site-down:") for key in sent):
        alert("site-up", "educatedai.org: public site is reachable again.")

    status, body = get("/data/sittings.jsonl")
    if status != 200:
        say("could not read sittings; publishing check deferred")
        return state
    try:
        records = [json.loads(line) for line in body.splitlines() if line.strip()]
        published = [date.fromisoformat(row["date"]) for row in records if row["status"] == "published"]
        latest = max(published, default=None)
        generated = date.fromisoformat(json.loads(responses["/data/manifest.json"][1])["generated"])
    except (ValueError, KeyError, TypeError):
        say("invalid public data; publishing check deferred")
        return state
    if now.hour >= 16 and (latest is None or latest < today - timedelta(days=1)
                           or generated < today - timedelta(days=1)):
        alert("publishing-stalled", f"educatedai.org: no new sitting since {latest or 'never'}; publishing has stopped. "
              "Check the Zenbook (fleet heartbeat) and the watchman.")
    return state


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    state = json.loads(args.state.read_text()) if args.state.exists() else {"fails": 0, "sent": {}}
    run(state)
    temporary = args.state.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, sort_keys=True) + "\n")
    temporary.replace(args.state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
