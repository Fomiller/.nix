{ nhModules, ... }:
{
  imports = [
    "${nhModules}/common"
    # Personal (Anthropic API key) HolmesGPT wiring — see the files
    # themselves for why this can't just use the Claude Pro subscription.
    "${nhModules}/programs/k9s/nimbus.nix"
    "${nhModules}/programs/zsh/nimbus.nix"
  ];

  # Enable home-manager
  programs.home-manager.enable = true;

  # https://nixos.wiki/wiki/FAQ/When_do_I_update_stateVersion
  home.stateVersion = "25.05";
}
