{ config, ... }:
{
  # Out-of-store symlink so the file stays editable in place (edits take effect
  # immediately, no `switch` needed) while remaining git-tracked in this repo.
  # claude-code itself is installed via the aiTools package group in common.
  home.file.".claude/CLAUDE.md".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/dev/personal/.nix/modules/home-manager/programs/claude-code/CLAUDE.md";
}
