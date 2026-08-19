{ ... }:
{
  programs.zsh.initContent = ''
    # Scope Bedrock auth + default model to holmes only, rather than
    # exporting AWS_PROFILE globally (would affect unrelated aws-cli use).
    holmes() {
      AWS_PROFILE=flock-prod-devops-engineers MODEL=sonnet-5 command holmes "$@"
    }
  '';
}
