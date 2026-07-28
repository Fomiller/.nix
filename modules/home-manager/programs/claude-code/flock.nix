{ config, lib, ... }:
let
  # Absolute path to this module's directory in the live repo checkout, so the
  # symlinks below stay editable in place instead of pointing into a read-only
  # /nix/store copy.
  claudeDir = "${config.home.homeDirectory}/dev/personal/.nix/modules/home-manager/programs/claude-code";
in
{
  # flock-only Claude Code skills. These are work-specific (they target the
  # DO/SRE Jira board and the FLY Confluence space), so they're imported from
  # home/flock-mac rather than common. Shared config (CLAUDE.md, settings,
  # keybindings, statusline) lives in ./default.nix.
  #
  # Symlinked one entry per skill instead of a single ~/.claude/skills symlink:
  # programs.claude-code drops its generated MCP plugin into ~/.claude/skills/,
  # which would collide with a whole-directory symlink at that path. Each skill
  # still points at the live checkout so it stays editable, and new skills
  # under ./skills are picked up automatically. Directory list is read from the
  # flake source (pure eval); the symlinks target the live checkout.
  home.file = lib.mapAttrs' (
    name: _:
    lib.nameValuePair ".claude/skills/${name}" {
      source = config.lib.file.mkOutOfStoreSymlink "${claudeDir}/skills/${name}";
    }
  ) (builtins.readDir ./skills);
}
