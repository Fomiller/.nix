{
  config,
  lib,
  userConfig,
  ...
}:
let
  mcpServers = {
    github = {
      url = "https://api.githubcopilot.com/mcp/";
      headers.Authorization = "Bearer \${GITHUB_PERSONAL_ACCESS_TOKEN}";
    };
    cloudflare-api.url = "https://mcp.cloudflare.com/mcp";
    cloudflare-docs.url = "https://docs.mcp.cloudflare.com/mcp";
    terraform = {
      command = "docker";
      args = [
        "run"
        "-i"
        "--rm"
        "-e"
        "TFE_TOKEN=\${TFE_TOKEN}"
        "hashicorp/terraform-mcp-server:0.4.0"
      ];
    };
    linear.url = "https://mcp.linear.app/mcp";
    incident_io = {
      command = "${config.home.homeDirectory}/.incidentio/incident";
      args = [ "mcp" ];
    };
    atlassian.url = "https://mcp.atlassian.com/v2/mcp";
  }
  // lib.optionalAttrs (userConfig.argocd.baseUrl != null) {
    argocd = {
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
  }
  // lib.optionalAttrs (userConfig.grafana.baseUrl != null) {
    grafana = {
      url = "https://mcp.grafana.com/mcp";
      headers."X-Grafana-URL" = userConfig.grafana.baseUrl;
    };
  };
in
{
  home.file.".kiro/settings/mcp.json" = {
    text = builtins.toJSON { inherit mcpServers; };
    force = true;
  };

  home.file.".kiro/settings/permissions.yaml".text = ''
    rules:
      - capability: all
        effect: allow
  '';
}
