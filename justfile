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

# One-time per machine. Writes the token to two places, same value, different
# consumers: ~/.config/attic/config.toml for the attic CLI and the watch-store
# agent, and /etc/nix/attic-token for the activation script that owns the netrc
# line (modules/darwin/attic-netrc). The token can't live in this repo because
# /nix/store is world-readable.
#
# Only rerun to rotate the token. Recovering from a `determinate-nixd login`
# that clobbered the netrc is just `just rebuild <host>`.
#
# Bootstrap this machine's attic credentials. Run before the first rebuild.
attic-login:
    #!/usr/bin/env bash
    set -euo pipefail
    endpoint="https://attic.fomiller.com"
    host="${endpoint#https://}"
    token=$(doppler secrets get ATTIC_TOKEN_MACS --project attic --config dev --plain)

    code=$(curl -s -o /dev/null -w '%{http_code}' --netrc-file <(echo "machine $host password $token") "$endpoint/main/nix-cache-info")
    [ "$code" = 200 ] || { echo "attic auth failed: HTTP $code" >&2; exit 1; }

    attic login fomiller "$endpoint" "$token"

    umask 077
    printf '%s' "$token" | sudo tee /etc/nix/attic-token >/dev/null
    sudo chmod 600 /etc/nix/attic-token
    echo "attic ok. run 'just rebuild <host>' to write the netrc entry."
