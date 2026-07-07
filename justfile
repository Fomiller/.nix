switch flake: flake-update
    home-manager switch --flake ".#{{flake}}"

# --extra-experimental-features is a backstop: nix-command/flakes are enabled
# via /etc/nix/nix.conf and ~/.config/nix/nix.conf, but nix-darwin has
# silently orphaned /etc/nix/nix.conf before, so this keeps `just` working
# even if that happens again.
flake-update:
    nix --extra-experimental-features "nix-command flakes" flake update

rebuild flake: flake-update
    #!/usr/bin/env bash
    set -euo pipefail
    # On a fresh install (or the first time this repo's determinateNix module
    # runs on a machine), the Determinate installer has already created a
    # real /etc/nix/nix.custom.conf, which nix-darwin refuses to clobber. This
    # is a no-op once nix-darwin owns the path (it becomes a symlink).
    if [ -e /etc/nix/nix.custom.conf ] && [ ! -L /etc/nix/nix.custom.conf ]; then
      sudo mv /etc/nix/nix.custom.conf /etc/nix/nix.custom.conf.before-nix-darwin
    fi
    sudo darwin-rebuild --flake .#{{flake}} switch
