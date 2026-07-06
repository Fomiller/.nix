# nix-darwin Configuration for My Machines

This repository contains [nix-darwin](https://github.com/nix-darwin/nix-darwin) configurations for my macOS machines, managed through [Nix Flakes](https://nixos.wiki/wiki/Flakes).

It is structured to accommodate multiple Mac hosts and users, leveraging [nixpkgs](https://github.com/NixOS/nixpkgs), [home-manager](https://github.com/nix-community/home-manager), and a couple of custom packages/overlays.

## Credit
This configuration and README were originally inspired by [Alex Nabokikh's config](https://github.com/AlexNabokikh/nix-config)

## Structure

- `flake.nix`: The flake itself, defining inputs and outputs for nix-darwin and Home Manager configurations.
- `hosts/`: nix-darwin (system-level) configuration for each machine
- `home/`: Home Manager (user-level) configuration entrypoint for each machine
- `modules/home-manager/`: Reusable user-space configuration modules
  - `common/`: Shared package list and program module imports used by every host
  - `programs/`: One module per `programs.*` option enabled (bat, direnv, fzf, gh, git, k9s, lazygit, rbenv, starship, tmux, zoxide, zsh)
  - `filesystem/`: Activation scripts (dev directory scaffolding, one-time neovim config clone)
- `overlays/`: Custom overlays — `stable-packages` (exposes `pkgs.stable.*` from the pinned stable nixpkgs input) and `custom-packages` (exposes packages from `packages/`)
- `packages/`: Custom package derivations not in nixpkgs (e.g. `rtk`)
- `flake.lock`: Lock file ensuring reproducible builds by pinning input versions

### Key Inputs

- **nixpkgs**: Tracks `nixpkgs-unstable` for access to the latest packages
- **nixpkgs-stable**: Tracks `nixos-25.05`, used via the `stable-packages` overlay (`pkgs.stable.*`) for packages that are temporarily broken on unstable
- **darwin**: [nix-darwin](https://github.com/nix-darwin/nix-darwin), for macOS system configuration
- **home-manager**: Manages user-specific configuration, following the `nixpkgs` input
- **rust-overlay**: Rust toolchain overlay

## Hosts

| Flake name | Host dir | User | Machine |
|---|---|---|---|
| `nimbus` | `hosts/nimbus-mac` | `forrest` | Personal Mac |
| `flock` | `hosts/flock-mac` | `forrest.miller` | Work Mac |

## Usage

Managed through `just` (see `justfile`):

```sh
just switch <host>   # home-manager switch — user packages, dotfiles, programs
just rebuild <host>  # darwin-rebuild switch — Homebrew, fonts, macOS system defaults
```

`<host>` is the short flake name (`nimbus` or `flock`). Both commands run
`nix flake update` first, so every apply also refreshes flake inputs to their
latest versions — there's no separate manual update step needed.

Both commands are required for full parity: home-manager is not wired into
the darwin module, so a `rebuild` alone won't update user packages/dotfiles,
and a `switch` alone won't update Homebrew casks/fonts/macOS defaults.

### Adding a New Host

1. Add the user to the `users` attrset in `flake.nix` if it's a new one.
2. Add entries to `darwinConfigurations` and `homeConfigurations` in `flake.nix`.
3. Create `hosts/<host>/default.nix` (system-level nix-darwin config).
4. Create `home/<host>/default.nix` (import `modules/home-manager/common`, set `home.stateVersion`).
5. `git add -A` (flakes only see git-tracked files), then `just rebuild <host>` and `just switch <host>`.

## Troubleshooting

[System can't find nix](https://github.com/DeterminateSystems/nix-installer/blob/main/docs/troubleshooting.md#your-system-cant-find-nix),
or if nix isn't activated on reboot:

```sh
cd ~/dev/personal/.nix
/nix/var/nix/profiles/default/bin/nix build .#darwinConfigurations.flock.system
sudo ./result/sw/bin/darwin-rebuild switch --flake .#flock
zsh
just switch flock
```

See `CLAUDE.md` for a more detailed operational guide and known gotchas.

## Contributing

Contributions are welcome! If you have improvements or suggestions, please open an issue or submit a pull request.

## License

This repository is licensed under MIT License. Feel free to use, modify, and distribute according to the license terms.
