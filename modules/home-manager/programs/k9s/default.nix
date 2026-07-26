{ ... }:
{
  programs.k9s = {
    enable = true;
    settings = {
      k9s.editor = "nvim";
    };
  };

  # HolmesGPT k9s integration (Shift-H / Shift-Q) is host-specific: nimbus
  # uses a personal Anthropic API key (./nimbus.nix), flock uses AWS Bedrock
  # via a work SSO profile (./flock.nix). Imported from home/<host>.
}
