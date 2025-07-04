{ ... }:
{
  programs.zsh = {
    enable = true;
    shellAliases = {
      # vim
      vim = "nvim";
      vi = "nvim";
      s2a = "saml2aws";
      s2al = "saml2aws login";
      # git
      ga = "git add";
      gp = "git pull";
      gs = "git status";
      gc = "git commit";
      gl = "git log";
      gd = "git diff";
      gb = "git checkout $(git branch | grep -v '^\*' | fzf --height=20% --reverse --info=inline)";
      branch = "git checkout $(git branch | grep -v '^\*' | fzf --height=20% --reverse --info=inline)";
      # filesystem
      ll = "ls -la";
      la = "ls -a";
      # kubernetes
      k = "kubectl";
      kx = "kubectx";
      ktx = "kubectx";
      # programs
      top = "ytop";
    };
  };
}
