{ ... }:
{
  programs.k9s = {
    enable = true;
    settings = {
      k9s.editor = "nvim";
    };

    # HolmesGPT k9s integration: Shift-H asks HolmesGPT to investigate the
    # selected resource. Auth is via AWS Bedrock (feury-devops-engineers SSO
    # profile) — model definitions live in the untracked
    # ~/.holmes/model_list.yaml (contains our AWS account ID, kept out of
    # this public repo). AWS_PROFILE is scoped to just this plugin's
    # subshell so it doesn't change the user's default AWS CLI behavior.
    # https://holmesgpt.dev/installation/k9s-installation/
    plugins.holmesgpt = {
      shortCut = "Shift-H";
      description = "Ask HolmesGPT";
      scopes = [ "all" ];
      command = "bash";
      background = false;
      confirm = false;
      args = [
        "-c"
        ''
          export AWS_PROFILE=feury-devops-engineers

          # Check if we're already using the correct context
          CURRENT_CONTEXT=$(kubectl config current-context 2>/dev/null || echo "")
          if [ "$CURRENT_CONTEXT" = "$CONTEXT" ]; then
            # Already using the correct context, run HolmesGPT directly
            holmes ask "why is $NAME of $RESOURCE_NAME in -n $NAMESPACE not working as expected" --model=sonnet-5
          else
            # Create temporary kubeconfig to avoid changing user's system context
            # K9s passes $CONTEXT but we need to ensure HolmesGPT uses the same context
            # without permanently switching the user's kubectl context
            TEMP_KUBECONFIG=$(mktemp)
            kubectl config view --raw > $TEMP_KUBECONFIG
            KUBECONFIG=$TEMP_KUBECONFIG kubectl config use-context $CONTEXT
            # KUBECONFIG environment variable is passed to holmes and all its child processes
            KUBECONFIG=$TEMP_KUBECONFIG holmes ask "why is $NAME of $RESOURCE_NAME in -n $NAMESPACE not working as expected" --model=sonnet-5
            rm -f $TEMP_KUBECONFIG
          fi
          echo "Press 'q' to exit"
          while : ; do
          read -n 1 k <&1
          if [[ $k = q ]] ; then
          break
          fi
          done
        ''
      ];
    };

    # Shift-Q: same as Shift-H, but prompts for an arbitrary question via
    # k9s's native input-dialog (a real popup form, not a full-screen
    # takeover) instead of always asking the fixed "why isn't this working"
    # question. The collected value is exposed as $INPUT_QUESTION; k9s
    # already quotes it for shell safety if it contains spaces, so it's
    # substituted unquoted here.
    plugins.holmesgpt-ask = {
      shortCut = "Shift-Q";
      description = "Ask HolmesGPT (custom question)";
      scopes = [ "all" ];
      command = "bash";
      background = false;
      confirm = false;
      inputs = [
        {
          name = "question";
          label = "Question for HolmesGPT";
          type = "string";
          required = true;
        }
      ];
      args = [
        "-c"
        ''
          export AWS_PROFILE=feury-devops-engineers

          CURRENT_CONTEXT=$(kubectl config current-context 2>/dev/null || echo "")
          if [ "$CURRENT_CONTEXT" = "$CONTEXT" ]; then
            holmes ask $INPUT_QUESTION --model=sonnet-5
          else
            TEMP_KUBECONFIG=$(mktemp)
            kubectl config view --raw > $TEMP_KUBECONFIG
            KUBECONFIG=$TEMP_KUBECONFIG kubectl config use-context $CONTEXT
            KUBECONFIG=$TEMP_KUBECONFIG holmes ask $INPUT_QUESTION --model=sonnet-5
            rm -f $TEMP_KUBECONFIG
          fi
          echo "Press 'q' to exit"
          while : ; do
          read -n 1 k <&1
          if [[ $k = q ]] ; then
          break
          fi
          done
        ''
      ];
    };
  };
}
