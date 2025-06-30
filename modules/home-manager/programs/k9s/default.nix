{ ... }:
{
  programs.k9s = {
    enable = true;
    settings = {
      k9s.editor = "nvim";
    };
  };
}
