switch flake:
    home-manager switch --flake ".#{{flake}}"

rebuild flake:
    sudo darwin-rebuild --flake .#{{flake}} switch
