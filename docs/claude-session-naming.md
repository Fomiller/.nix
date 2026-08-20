# Claude session naming and tmux window titles

Every Claude Code session gets a name based on where it was launched, and that
name is mirrored into the tmux window title as `claude(<name>)`. The model can
rename a live session itself, and a hand-typed `/rename` updates the window
too.

## Pieces

| File | Role |
|---|---|
| `modules/home-manager/programs/zsh/claude-session.zsh` | The `clc` wrapper: picks the name, passes a socket, restores the window on exit |
| `modules/home-manager/programs/claude-code/claude-rename.py` | Renames a live session from outside, and `--watch` mirrors renames into tmux |
| `modules/home-manager/programs/claude-code/default.nix` | Installs `claude-rename` via `writeScriptBin` |

Launch sessions with `clc`, not `claude`. None of this applies to a bare
`claude`.

## Name it picks

`clc` derives the name from the launch directory:

- Real checkout: `<repo>` (e.g. `infrastructure`)
- Worktree: `<repo>:<worktree-dir>` (e.g.
  `infrastructure:DO-8117-enable-demo-prod`)
- Not a git repo: the directory name

A leading `.` is stripped, so `~/dev/personal/.nix` becomes `nix`. If another
live session already holds the name, it appends `-2`, `-3`, and so on. Live
names are found by scanning `pgrep -fl -- '--name '`.

Pass `--name` or `-n` yourself to skip all of that.

## Renaming a live session

Three paths, all ending at the same window title.

**1. At launch.** `clc` saves the current window name and whether
`automatic-rename` was on, then renames the window to `claude(<name>)`. On
exit it puts the old state back. It restores `automatic-rename on` rather than
the old string when the window was on automatic, because `rename-window` turns
that option off as a side effect.

**2. From the model.** Claude Code has no API for the model to rename its own
session — `/rename` is a user-typed command. But an interactive session
listens on a unix socket and accepts a `rename` control message, which is the
same code path. So:

```sh
claude-rename DO-1234        # uses $CLAUDE_PID
claude-rename DO-1234 38745  # explicit pid
```

It reads `~/.claude/sessions/<pid>.json` for `messagingSocketPath`, sends
`{"type":"control","action":"rename","name":"..."}`, then polls the registry
file until the session writes the new name back. Only then does it touch tmux,
so the title never gets ahead of reality. Prints
`renamed session <pid> to DO-1234` on success.

`clc` always passes `--messaging-socket-path` (under `/tmp/cc-socks/`), because
that socket is what makes this work. A session started some other way may not
have one, and `claude-rename` says so instead of guessing.

**3. A hand-typed `/rename`.** This is the awkward case. The socket only takes
messages *in* — a session renamed by hand notifies nobody, and Claude Code has
no rename hook (there are nine hook events; none of them fire on rename). The
only trace is the `name` field in the session's registry file.

So `clc` backgrounds a poller:

```sh
claude-rename --watch "$sock_path" "$session_name" &!
```

It finds the registry file whose `messagingSocketPath` matches, reads `name`
every 2s, and renames the window when it changes. `clc` kills it when Claude
exits, before restoring the old window name. Result: a hand-typed `/rename`
shows up in the window title within about 2 seconds.

## Overhead

One poller process per `clc` session, each pinned to its own pane via the
inherited `TMUX_PANE`. Not one shared daemon. Measured with 12 files in
`~/.claude/sessions`:

- 75 µs of CPU per poll, one poll per 2s — about 0.004% of one core, or 3.3
  CPU-seconds per day
- ~17 MB maxrss, nearly all of it the Python interpreter and stdlib, and
  mostly shared pages across pollers
- No writes

Scaling is mildly quadratic, since each poller scans every registry file. Even
at 50 concurrent sessions that is under 1% of a core. If it ever matters, cache
the socket-to-file match after the first hit — it never changes for the life of
a session.

## Verify

```sh
pgrep -fl 'claude-rename --watch'   # one line per live clc session in tmux
cat ~/.claude/sessions/<pid>.json   # name, messagingSocketPath, tmux pane
tmux display-message -p '#{window_name}'
```

To test the poller without a real session, put a fake `tmux` earlier on `PATH`
that logs its arguments, then run `claude-rename --watch <sock>` against a live
session's socket with `TMUX` and `TMUX_PANE` set.

## Gotchas

- **Launch with `clc`.** A bare `claude` gets no name, no socket, and no
  poller.
- **The poller only starts inside tmux.** It needs `TMUX` and `TMUX_PANE`.
- **Sessions started before a `just switch` don't get the new behavior.** The
  poller is spawned at launch, so already-running sessions keep whatever their
  `clc` gave them. Use `claude-rename` by hand there.
- **`rename-window` disables `automatic-rename`.** Anything else that renames
  this window must restore the option, not just the string.
- **Don't manage `statusline.conf` in nix.** Unrelated to naming, but it lives
  next door: `claude-statusline` rewrites it at runtime, so a managed symlink
  gets clobbered into a plain file and then blocks the next switch.
