{ ... }:
{
  programs.zsh = {
    enable = true;
    shellAliases = {
      # vim
      vim = "nvim";
      vi = "nvim";
      s2a = "saml2aws";
      # git
      ga = "git add";
      gp = "git pull";
      gs = "git status";
      gc = "git commit";
      gl = "git log";
      gd = "git diff";
      # filesystem
      ll = "ls -la";
      la = "ls -a";
      # kubernetes
      k = "kubectl";
      # programs
      top = "ytop";
    };
  };
}
