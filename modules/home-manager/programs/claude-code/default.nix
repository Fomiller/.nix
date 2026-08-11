{
  config,
  pkgs,
  lib,
  userConfig,
  ...
}:
let
  # Absolute path to this module's directory in the live repo checkout, so the
  # symlinks below stay editable in place (and writable by Claude Code itself)
  # instead of pointing into a read-only /nix/store copy.
  claudeDir = "${config.home.homeDirectory}/dev/personal/.nix/modules/home-manager/programs/claude-code";
in
{
  # Shared Claude Code config for both hosts. Work-specific skills are scoped to
  # flock in ./flock.nix.
  programs.claude-code = {
    enable = true;
    # The module owns the package now (needed for its managed-MCP plugin), so
    # claude-code is no longer in the aiTools group in common.
    package = pkgs.claude-code;

    # CLAUDE.md, settings.json, and keybindings.json are deliberately NOT set
    # here (context/settings). The module would render them read-only into the
    # nix store; we keep them as the out-of-store symlinks below so Claude can
    # rewrite them in place at runtime.

    # ArgoCD MCP server, per-host URL from userConfig. The module emits this as
    # a generated plugin, so the registration reproduces on every switch
    # instead of living in the stateful ~/.claude.json. Skipped when this
    # host has no ArgoCD URL set. ARGOCD_API_TOKEN is a literal reference
    # Claude expands at launch from the environment (exported via
    # ~/.config/zsh/secrets.zsh), so no token lands in the repo.
    mcpServers = lib.optionalAttrs (userConfig.argocd.baseUrl != null) {
      argocd = {
        type = "stdio";
        command = "npx";
        args = [
          "-y"
          "argocd-mcp@latest"
          "stdio"
        ];
        env = {
          ARGOCD_BASE_URL = userConfig.argocd.baseUrl;
          ARGOCD_API_TOKEN = "\${ARGOCD_API_TOKEN}";
        }
        // lib.optionalAttrs userConfig.argocd.insecure {
          NODE_TLS_REJECT_UNAUTHORIZED = "0";
        };
      };
    };
  };

  home.packages = [
    (pkgs.writeScriptBin "claude-rename" (
      "#!${pkgs.python3}/bin/python3\n" + builtins.readFile ./claude-rename.py
    ))
  ];

  home.file = {
    ".claude/CLAUDE.md".source = config.lib.file.mkOutOfStoreSymlink "${claudeDir}/CLAUDE.md";
    ".claude/settings.json".source = config.lib.file.mkOutOfStoreSymlink "${claudeDir}/settings.json";
    ".claude/keybindings.json".source = config.lib.file.mkOutOfStoreSymlink "${claudeDir}/keybindings.json";
    # Whole-directory symlink here, unlike ./skills which needs one symlink per
    # entry: the module only writes into .claude/agents/ when `agents` or
    # `agentsDir` is set (both unset above), so nothing else claims this path and
    # there's no collision to dodge. Upside is new agent files take effect
    # immediately without a switch.
    ".claude/agents".source = config.lib.file.mkOutOfStoreSymlink "${claudeDir}/agents";
    # statusline.conf is intentionally not managed here: claude-statusline
    # (context-stats) regenerates it at runtime, so a managed symlink just gets
    # clobbered into a plain file and then blocks the next switch.
  };
}
