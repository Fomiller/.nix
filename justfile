switch flake: flake-update
    home-manager switch --flake ".#{{flake}}"

flake-update:
    nix --extra-experimental-features "nix-command flakes" flake update

rebuild flake: flake-update
    sudo darwin-rebuild --flake .#{{flake}} switch
