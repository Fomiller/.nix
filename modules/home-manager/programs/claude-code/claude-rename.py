"""Rename a live Claude Code session from outside it.

Claude Code has no API for the model to rename its own session -- /rename is
typed by the user. But an interactive session listens on a unix socket and
accepts a `rename` control message, which is the same code path. So the model
can run this and the title updates live.

Usage: claude-rename <new-name> [pid]   (pid defaults to $CLAUDE_PID)
"""

import json
import os
import socket
import sys
import time

REGISTRY = os.path.expanduser("~/.claude/sessions")


def die(msg):
    print(f"claude-rename: {msg}", file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        die("usage: claude-rename <new-name> [pid]")
    name = sys.argv[1].strip()
    pid = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("CLAUDE_PID")
    if not pid:
        die("no pid given and CLAUDE_PID is unset (not inside a Claude session?)")

    path = os.path.join(REGISTRY, f"{pid}.json")
    try:
        with open(path) as fh:
            session = json.load(fh)
    except OSError as err:
        die(f"cannot read session registry {path}: {err}")

    sock_path = session.get("messagingSocketPath")
    if not sock_path:
        die(f"session {pid} has no messaging socket; rename it by hand with /rename {name}")

    msg = {"type": "control", "action": "rename", "name": name}
    if session.get("sessionId"):
        msg["session_id"] = session["sessionId"]

    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect(sock_path)
        sock.sendall((json.dumps(msg) + "\n").encode())
        sock.close()
    except OSError as err:
        die(f"cannot talk to {sock_path}: {err}")

    # The session writes the new name back to its registry file, so poll that
    # rather than trusting the send.
    for _ in range(20):
        time.sleep(0.1)
        try:
            with open(path) as fh:
                if json.load(fh).get("name") == name:
                    print(f"renamed session {pid} to {name}")
                    return
        except (OSError, ValueError):
            pass
    die(f"sent rename to {sock_path} but session {pid} still reports "
        f"{json.load(open(path)).get('name')!r}")


if __name__ == "__main__":
    main()
