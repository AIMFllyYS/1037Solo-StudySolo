/** Strip operator infrastructure credentials before launching a user's local server. */
function withoutOperatorCredentials(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) =>
    !/^(?:CLOUD_SANDBOX_|E2B_|CONNECTOR_|GOOGLE_CONNECTOR_|GITHUB_CONNECTOR_|ZOTERO_CONNECTOR_|AWS_|ALIYUN_|NCBI_API_KEY$|SUPABASE_SERVICE_ROLE_KEY$|ACCOUNT_.*(?:SECRET|TOKEN|KEY)|ECOSYSTEM_.*(?:SECRET|TOKEN|KEY)|KITSOLO_.*(?:SECRET|TOKEN)|NEXT_PUBLIC_.*(?:SECRET|SERVICE_ROLE))/.test(name)
    && !/(?:^|_)(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)(?:_|$)/.test(name)));
}
module.exports = { withoutOperatorCredentials };
