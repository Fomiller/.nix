switch flake: flake-update
    home-manager switch --flake ".#{{flake}}"

# --extra-experimental-features is a backstop: nix-command/flakes are enabled
# via /etc/nix/nix.conf and ~/.config/nix/nix.conf, but nix-darwin has
# silently orphaned /etc/nix/nix.conf before, so this keeps `just` working
# even if that happens again.
flake-update:
    nix --extra-experimental-features "nix-command flakes" flake update

rebuild flake: flake-update
    sudo darwin-rebuild --flake .#{{flake}} switch
