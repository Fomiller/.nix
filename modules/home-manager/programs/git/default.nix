{ userConfig, ... }:
{
  programs.git = {
    enable = true;

    settings = {
      user.name = "Forrest Miller";
      user.email = "forrestmillerj@gmail.com";

      core.editor = "nvim";
      core.autocrlf = "input";

      pull.rebase = "true";
      pull.default = "simple";

      push.autoSetupRemote = "true";

      color.ui = "auto";

      # aliases
      alias.st = "status";
      alias.cm = "commit";
      alias.co = "checkout";
      alias.co- = "checkout -";
      alias.a = "add";

      diff.sopsdiffer.textconv = "AWS_PROFILE=aerodome sops -d --config /dev/null";
      diff.sops-govcloud.textconv = "AWS_PROFILE=govcloud sops -d --config /dev/null";
    };

    #   delta = {
    #     enable = true;
    #     options = {
    #       keep-plus-minus-markers = true;
    #       light = false;
    #       line-numbers = true;
    #       navigate = true;
    #       width = 280;
    #     };
    #   };

  };
}
