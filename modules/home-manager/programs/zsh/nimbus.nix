{ ... }:
{
  programs.zsh.initContent = ''
    # Default model for holmes, since Claude Pro doesn't include API access.
    # ANTHROPIC_API_KEY comes from the "claude" project's "dev" config in
    # Doppler, not a locally-stored secret.
    holmes() {
      MODEL=anthropic/claude-sonnet-4-5 doppler run --project claude --config dev -- command holmes "$@"
    }
  '';
}
