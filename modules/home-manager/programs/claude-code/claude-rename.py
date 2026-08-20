"""Rename a live Claude Code session from outside it.

Claude Code has no API for the model to rename its own session -- /rename is
typed by the user. But an interactive session listens on a unix socket and
accepts a `rename` control message, which is the same code path. So the model
can run this and the title updates live.

There is no reverse channel: a session renamed by a hand-typed /rename tells
nobody. It does write the new name to its registry file though, so
`--watch <socket-path>` polls that and mirrors any change into the tmux window
title. clc runs that in the background for the session it launches.

Usage: claude-rename <new-name> [pid]          (pid defaults to $CLAUDE_PID)
       claude-rename --watch <sock> [name]
"""

import json
import os
import socket
import subprocess
import sys
import time

REGISTRY = os.path.expanduser("~/.claude/sessions")


def rename_tmux_window(name):
    """Mirror the session name into the tmux window title as claude(<name>)."""
    pane = os.environ.get("TMUX_PANE")
    if not os.environ.get("TMUX") or not pane:
        return
    try:
        subprocess.run(
            ["tmux", "rename-window", "-t", pane, f"claude({name})"],
            check=False,
            capture_output=True,
        )
    except OSError:
        pass


def find_by_socket(sock_path):
    """The registry file for the session listening on sock_path, or None."""
    try:
        names = os.listdir(REGISTRY)
    except OSError:
        return None
    for entry in names:
        if not entry.endswith(".json"):
            continue
        path = os.path.join(REGISTRY, entry)
        try:
            with open(path) as fh:
                if json.load(fh).get("messagingSocketPath") == sock_path:
                    return path
        except (OSError, ValueError):
            continue
    return None


def watch(sock_path, last=None, interval=2.0):
    seen = False
    while True:
        time.sleep(interval)
        path = find_by_socket(sock_path)
        if path is None:
            # Registry entry gone after we'd found it once: session is over.
            if seen:
                return
            continue
        seen = True
        try:
            with open(path) as fh:
                name = json.load(fh).get("name")
        except (OSError, ValueError):
            continue
        if name and name != last:
            last = name
            rename_tmux_window(name)


def die(msg):
    print(f"claude-rename: {msg}", file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        die("usage: claude-rename <new-name> [pid] | --watch <sock> [name]")
    if sys.argv[1] == "--watch":
        if len(sys.argv) < 3:
            die("usage: claude-rename --watch <sock> [name]")
        watch(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
        return
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
                    rename_tmux_window(name)
                    print(f"renamed session {pid} to {name}")
                    return
        except (OSError, ValueError):
            pass
    die(f"sent rename to {sock_path} but session {pid} still reports "
        f"{json.load(open(path)).get('name')!r}")


if __name__ == "__main__":
    main()
