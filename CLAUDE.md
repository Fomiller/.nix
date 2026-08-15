# Managing this repo

Nix flake config for two macOS (aarch64-darwin) machines via nix-darwin +
standalone home-manager. There is no NixOS/Linux host in this repo despite
some generic wording in README.md — both configured hosts are Macs.

## Structure

- `flake.nix` — inputs, `users` attrset (per-machine email/username), and the
  `mkDarwinConfiguration` / `mkHomeConfiguration` builder functions.
- `hosts/<host>/default.nix` — nix-darwin system config (one per machine):
  `nimbus-mac` (user `forrest`, personal), `flock-mac` (user `forrest.miller`,
  work). Flake attr names are shortened: `darwinConfigurations.nimbus` /
  `.flock`.
- `home/<host>/default.nix` — thin per-host home-manager entrypoint, just
  imports `modules/home-manager/common` and sets `home.stateVersion`.
- `modules/home-manager/common/default.nix` — the real home-manager config:
  package list (grouped into `packageGroups.*`), program module imports,
  `xdg.configFile` entries.
- `modules/home-manager/programs/<name>/default.nix` — one file per enabled
  `programs.*` module (bat, flox, fzf, gh, git, k9s, lazygit, rbenv, starship,
  tmux, zoxide, zsh). Add new ones here and import from `common/default.nix`.
- `modules/home-manager/filesystem/default.nix` — activation scripts: creates
  `~/dev/{personal,work,third_party}`, and clone-once (not auto-pull)
  `~/.config/nvim` from `Fomiller/nvim.git`.
- `overlays/default.nix` — `stable-packages` (exposes `pkgs.stable.*` from the
  pinned `nixpkgs-stable` input, for when unstable is broken for a specific
  package) and `custom-packages` (exposes `pkgs.rtk`, etc. from `packages/`).
- `packages/*.nix` — custom package derivations (`rtk`, `chart-releaser`).
- `justfile` — the interface for humans; see below.

## Commands

```sh
just switch <host>   # home-manager switch (user-level: packages, dotfiles, programs)
just rebuild <host>   # sudo darwin-rebuild switch (system-level: homebrew, fonts, macOS defaults)
just flake-update    # bare `nix flake update`, also runs automatically before switch/rebuild
```

`<host>` is the short flake name: `nimbus` or `flock`. Both `switch` and
`rebuild` depend on `flake-update`, so every apply pulls fresh flake inputs
first — there's no separate "check for updates" step, don't add one. This is
deliberate and was reaffirmed on 2026-08-15; don't propose decoupling it again.

Consequence to expect: every apply rewrites `flake.lock`, so the tree is dirty
after any `switch` or `rebuild`, and the two machines pin whatever
`nixpkgs-unstable` was at the minute each one ran.

`flake.lock` is machine-independent — pinned input revs and hashes, no
hostname, user, or system in it. Per-host differences live in `flake.nix`,
`hosts/<host>/`, and `home/<host>/`, which evaluate against those same inputs.
Commit it; both machines share one lock, and it's what an unstable bump gets
rolled back to. It conflicts across machines as an unmergeable blob — take
either side wholesale and re-run `just flake-update`, never hand-edit the
hashes.

**Both commands are required for full parity** — home-manager is not wired
into the darwin module. A `rebuild` alone will not update user packages or
dotfiles; a `switch` alone will not update Homebrew casks, fonts, or macOS
`system.defaults`.

`rebuild` needs an interactive `sudo` password prompt — it cannot be run
through a non-interactive/sandboxed shell (e.g. Claude Code's Bash tool). Hand
the command to the user to run themselves rather than trying to pipe a
password in.

## Before proposing changes

- `nix flake check` first for a fast syntax/eval sanity check.
- Then dry-run both configs against the real derivation graph — this is what
  actually catches broken packages/build failures, `nix flake check` alone
  won't:
  ```sh
  nix build .#darwinConfigurations.<host>.system --dry-run
  nix build .#homeConfigurations.<host>.activationPackage --dry-run
  ```
- New files under `modules/`, `hosts/`, `home/`, `overlays/`, `packages/` are
  invisible to the flake until `git add`-ed (or at least `git add -A`'d) —
  flakes only see git-tracked/staged content, not just files on disk.

## Known gotchas (already solved once, don't re-diagnose from scratch)

- **Determinate Nix is managed via the `determinateNix` module** (flake input
  `determinate`, imported as `inputs.determinate.darwinModules.default`), not
  a manual `nix.enable = false;`. Both hosts set `determinateNix.enable =
  true;` plus `determinateNix.customSettings`, which the module renders to
  `/etc/nix/nix.custom.conf` (Determinate's own `/etc/nix/nix.conf` `!include`s
  this file). The module forces `nix.enable = false` internally — don't add
  that line back manually, it's redundant and no longer where Nix config
  actually lives.
- **A trusted-substituter cache (e.g. Flox's `cache.flox.dev`) silently not
  used, even after adding it and confirming the daemon "trusts" it**: this
  machine's `trusted-users` is `root` only — your own login is *not* a
  trusted user. `trusted-substituters`/`trusted-public-keys` only pre-approve
  what an *already-trusted* client may additionally request; an untrusted
  client requesting a substituter that's merely in `trusted-substituters`
  gets it silently rejected (`ignoring untrusted substituter '...', you are
  not a trusted user`) and the build falls through to compiling from source
  (can OOM on something like a from-source Perl build). The fix is
  `extra-substituters` (no `trusted-` prefix) in
  `determinateNix.customSettings` — that's baked into the daemon's own
  authoritative config and used unconditionally for every build, with no
  per-client trust check. Keep the key itself as `extra-trusted-public-keys`
  (no non-trusted equivalent exists for that option). Verify with
  `nix show-config | grep substituters` — the cache must appear in the plain
  `substituters =` line, not only in `trusted-substituters =`.
- **nix-command/flakes disabled errors**: this machine's `/etc/nix/nix.conf`
  was once silently orphaned by a prior nix-darwin activation (renamed to
  `nix.conf.before-nix-darwin` and never replaced, since `nix.enable = false`
  means nix-darwin won't write a new one). If this recurs on a fresh machine
  or after some other nix-darwin activation, check for a stray
  `/etc/nix/nix.conf.before-nix-darwin` (or similar backup) before assuming
  Determinate is misconfigured, and restore it:
  `sudo cp /etc/nix/nix.conf.before-nix-darwin /etc/nix/nix.conf`. This repo
  also carries redundant belt-and-suspenders coverage: a home-manager-managed
  `~/.config/nix/nix.conf` (in `common/default.nix`) and a hardcoded
  `--extra-experimental-features` flag in the justfile's `flake-update`. The
  same collision happens with `/etc/nix/nix.custom.conf` — the Determinate
  installer creates it once, before nix-darwin ever runs, so nix-darwin
  refuses to overwrite it on a machine's first-ever `rebuild` (`error:
  Unexpected files in /etc, aborting activation`). The `rebuild` recipe in
  the `justfile` already auto-renames it to `nix.custom.conf.before-nix-darwin`
  the first time (idempotent — only fires when the path isn't already
  nix-darwin's own symlink), so this shouldn't need manual intervention on a
  fresh machine; if it still errors, that auto-rename logic broke.
- **Files that block `home-manager switch` with "would be clobbered"**: this
  user's dotfiles (`.zshrc`, `.zshenv`, `.zprofile`, `starship.toml`, etc.)
  used to be GNU Stow symlinks into `~/.dotfiles`. A stow symlink at a path
  home-manager wants to manage isn't backed up automatically the way a plain
  file is — it just errors. Fix is to `rm` the stray symlink (confirm with
  the user first, it's irreversible) and re-run `switch`; home-manager then
  creates its own managed symlink there. This is a one-time migration cost
  per dotfile, not a recurring issue once home-manager owns the path.
- **nixpkgs-unstable vs. nix-darwin version skew**: `nixpkgs` here tracks the
  `nixpkgs-unstable` branch directly and updates on every `flake-update`, but
  `darwin` and `home-manager` inputs may lag behind by however long it's been
  since nix-darwin/home-manager last cut a compatible revision. A `flake
  update` can pull in a newer nixpkgs than the pinned nix-darwin release
  knows how to build against (e.g. a real incident: nixpkgs bumped
  `nixos-render-docs` and dropped a CLI flag nix-darwin's manual-build code
  still passes, breaking `darwin-manual-html` and, separately,
  `darwin-uninstaller` — which builds its own independent minimal system
  config that isn't affected by our own `documentation.*` settings). If a
  `rebuild` starts failing right after a flake update with an unfamiliar
  build error deep in a `nix-darwin`-provided derivation (not something in
  this repo's own modules), suspect a nixpkgs/nix-darwin skew before assuming
  a config mistake — check whether nix-darwin's `master` has actually moved
  past the currently pinned rev (if not, it's a live upstream bug, not
  something `flake update` will fix).
- **A specific package failing to build from source on aarch64-darwin** after
  a flake update (no binary substitute available for the exact unstable
  revision) — pull it from `pkgs.stable.<name>` instead (the
  `stable-packages` overlay) rather than pinning the whole `nixpkgs` input
  back. `grafana` is set up this way already as a precedent.
- **Homebrew casks**: only use the native nix-darwin `homebrew` block for
  packages with no nixpkgs equivalent (currently `kegworks`, a WINE wrapper,
  and `redis-stack-server`, which bundles unpackaged modules/CLI). Prefer a
  nix package over a brew cask whenever one exists — check before adding
  either.
- **`~/.config/nvim`**: cloned once via activation script, never auto-pulled
  on switch — this is deliberate, to avoid clobbering in-progress local edits
  on whatever machine already has a checkout. Don't change this to
  auto-`pull` without asking; if nvim needs a refresh, do it as an explicit
  one-off `git pull` in that directory.
- **home-manager's experimental `services-modular` breaking on a fresh
  `nixpkgs-unstable` bump** (`home-manager switch` fails deep in nixpkgs, e.g.
  `function 'anonymous lambda' called with unexpected argument 'lib'` at
  `nixos/modules/system/service/systemd/service.nix`): home-manager's
  `modules/services-modular/service.nix` imports that nixos module file
  directly as a bare path (`imports = [ (nixpkgsPath + "/nixos/modules/...
  /service.nix") ]`), which only works if that file is a single-stage module
  (`{ lib, config, systemdPackage, ... }: ...`). A sufficiently new nixpkgs
  commit can refactor it into a curried two-stage function (`{ pkgs }: { lib,
  config, ... }: ...`) for its own "self-contained, mixable across nixpkgs
  versions" reasons — home-manager's bare-path import breaks against that
  shape. This is upstream skew between two independently-versioned repos
  (nixpkgs and home-manager), not a mistake in this repo's config, and
  `nix flake update` won't fix it since it's what caused it. Confirm by
  diffing the file at the old vs. new pinned `nixpkgs` rev; if home-manager's
  own `master` hasn't adapted yet either, the fix is to temporarily pin
  `nixpkgs.url` in `flake.nix` to the last known-good rev (with a comment
  explaining why and how to un-pin) rather than waiting on `flake update`.
  The 2026-07-26 instance of this is resolved and the pin is gone — nixpkgs
  itself reverted the curried refactor by rev `38a48874` (2026-07-27), so
  `nixpkgs.url` tracks the `nixpkgs-unstable` branch again. Note which side
  moved: the fix came from nixpkgs backing out, not home-manager adapting, so
  don't assume a future recurrence resolves the same way.
- **`just switch`/`just rebuild` hangs indefinitely, seemingly doing nothing**
  (e.g. stuck on a `post-build` step, or a build step just never returns):
  check for a stuck `/nix/store/.../post-build-hook.sh` process (`ps aux |
  grep post-build-hook`). Determinate Nix's post-build hook writes build
  telemetry to the FIFO `/nix/var/determinate/intake.pipe`, and a `write()` to
  a FIFO blocks forever if nothing has the read end open — which happens
  whenever the `determinate-nixd` daemon isn't alive to consume it. That
  daemon's LaunchDaemon plist
  (`/Library/LaunchDaemons/systems.determinate.nix-daemon.plist`) has
  `RunAtLoad = false` and no `KeepAlive` key, so nothing guarantees it comes
  back after a reboot — it's only meant to be revived via on-demand socket
  activation on `/var/run/nix-daemon.socket` /
  `/var/run/determinate-nixd.socket`, and that hasn't reliably kept a
  persistent FIFO-reading instance up across reboots in practice. Socket
  activation can't help here either: a `write()` to a FIFO isn't a connection
  to either socket, so the blocked hook never wakes the daemon it's waiting
  on. Confirm with `pgrep -fl determinate-nixd` (no output = dead; works
  without sudo, unlike `sudo launchctl print
  system/systems.determinate.nix-daemon`) plus the last timestamp in
  `/var/log/determinate-nix-daemon.log` — if it predates the hang, or predates
  `sysctl -n kern.boottime`, the daemon is gone. Immediate unblock: `sudo
  launchctl kickstart -k system/systems.determinate.nix-daemon`, which drains
  any backlog of stuck `post-build-hook.sh` writers once a fresh instance is
  listening.

  Permanent fix, applied 2026-08-11 on `nimbus-mac`: the plist now sets
  `RunAtLoad = true` and `KeepAlive = true`, so launchd starts the daemon at
  boot and restarts it if it exits. Original saved alongside as
  `systems.determinate.nix-daemon.plist.bak`. Apply/re-apply with:

  ```sh
  sudo launchctl bootout system/systems.determinate.nix-daemon
  sudo launchctl bootstrap system /Library/LaunchDaemons/systems.determinate.nix-daemon.plist
  ```

  This is a system file outside the flake — nothing in this repo manages it,
  and a Determinate upgrade rewrites the plist back to the stock
  `RunAtLoad = false` / no `KeepAlive`. So if the hangs return, check those two
  keys before re-diagnosing anything else. `flock-mac` hit the same hang and
  may still be unpatched.

  Not a fix: overriding `post-build-hook` in `determinateNix.customSettings`.
  `/etc/nix/nix.conf` `!include`s `nix.custom.conf` *above* its own
  `post-build-hook =` line, so nix.conf wins. Killing the hook means editing
  `/etc/nix/nix.conf` directly, which Determinate also overwrites.

## Git

Only commit/push when explicitly asked. When asked, this repo has no
unusual conventions — plain descriptive commit messages, no changelog file.
