{ config, ... }:
let
  # Absolute path to this module's directory in the live repo checkout, so the
  # symlink below stays editable in place instead of pointing into a read-only
  # /nix/store copy.
  claudeDir = "${config.home.homeDirectory}/dev/personal/.nix/modules/home-manager/programs/claude-code";
in
{
  # flock-only Claude Code skills. These are work-specific (they target the
  # DO/SRE Jira board and the FLY Confluence space), so they're imported from
  # home/flock-mac rather than common. Shared config (CLAUDE.md, settings,
  # keybindings, statusline) lives in ./default.nix.
  home.file.".claude/skills".source = config.lib.file.mkOutOfStoreSymlink "${claudeDir}/skills";
}
