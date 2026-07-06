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
  `programs.*` module (bat, fzf, gh, git, k9s, lazygit, rbenv, starship, tmux,
  zoxide, zsh). Add new ones here and import from `common/default.nix`.
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
first — there's no separate "check for updates" step, don't add one.

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

- **`nix.enable = false;`** in both host configs is intentional — it tells
  nix-darwin not to manage `/etc/nix/nix.conf`, so Determinate Nix's own
  daemon/config management doesn't get fought over. Don't "fix" this by
  flipping it to `true`.
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
  `--extra-experimental-features` flag in the justfile's `flake-update`.
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

## Git

Only commit/push when explicitly asked. When asked, this repo has no
unusual conventions — plain descriptive commit messages, no changelog file.
