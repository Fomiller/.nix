{ config, ... }:
let
  # Absolute path to this module's directory in the live repo checkout, so the
  # symlinks below stay editable in place (and writable by Claude Code itself)
  # instead of pointing into a read-only /nix/store copy.
  claudeDir = "${config.home.homeDirectory}/dev/personal/.nix/modules/home-manager/programs/claude-code";
in
{
  # Shared Claude Code config for both hosts. claude-code itself is installed
  # via the aiTools package group in common. Work-specific skills are scoped to
  # flock in ./flock.nix.
  home.file = {
    ".claude/CLAUDE.md".source = config.lib.file.mkOutOfStoreSymlink "${claudeDir}/CLAUDE.md";
    ".claude/settings.json".source = config.lib.file.mkOutOfStoreSymlink "${claudeDir}/settings.json";
    ".claude/keybindings.json".source = config.lib.file.mkOutOfStoreSymlink "${claudeDir}/keybindings.json";
    ".claude/statusline.conf".source = config.lib.file.mkOutOfStoreSymlink "${claudeDir}/statusline.conf";
  };
}
