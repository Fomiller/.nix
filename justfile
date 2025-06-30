switch flake:
    home-manager switch --flake ".#{{flake}}"
    
flake-update:
    nix flake update

rebuild flake:
    sudo darwin-rebuild --flake .#{{flake}} switch
