#!/usr/bin/env bash
# One-off setup for Heard & Supported (development, synthetic data only).
# Run in Azure Cloud Shell (Bash): https://shell.azure.com
#
#   bash bootstrap.sh <github-owner>/<repo> <budget-email>
#
# It creates: a resource group in UK South, a deploy identity that GitHub can
# use without any stored password (OIDC), and the Entra app advisers sign in
# with. Run 'gh auth login' first so it can set the GitHub secrets for you.
# Run it once: a second run creates a second set of apps. It then sets the GitHub secrets and variables the deploy workflow needs
# (using the GitHub CLI if you are signed in to it, otherwise it prints them).
set -euo pipefail

REPO="${1:?Usage: bash bootstrap.sh <owner>/<repo> <budget-email>}"
BUDGET_EMAIL="${2:?Usage: bash bootstrap.sh <owner>/<repo> <budget-email>}"
ENV_NAME="dev"
RG="hs-${ENV_NAME}-rg"
LOCATION="uksouth"
AI_LOCATION="swedencentral"
SUFFIX="$(openssl rand -hex 3)"
WEBAPP="hs-${ENV_NAME}-${SUFFIX}"

SUB_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
echo "Subscription: $(az account show --query name -o tsv) ($SUB_ID)"
echo "Tenant:       $TENANT_ID"
read -r -p "Is this the right subscription, and NOT connected to any employer? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || { echo "Stopped. Switch with: az account set --subscription <id>"; exit 1; }

echo "== Registering resource providers (first time only, can take a few minutes)"
for p in Microsoft.Web Microsoft.DBforPostgreSQL Microsoft.Storage Microsoft.KeyVault Microsoft.CognitiveServices Microsoft.Consumption; do
  az provider register --namespace "$p" --wait >/dev/null
done

echo "== Resource group $RG in $LOCATION"
az group create -n "$RG" -l "$LOCATION" --tags project=heard-supported env="$ENV_NAME" data=synthetic-only -o none

echo "== GitHub deploy identity (OIDC, no stored password)"
DEPLOY_APP_ID="$(az ad app create --display-name "hs-${ENV_NAME}-github-deploy" --query appId -o tsv)"
DEPLOY_SP_ID="$(az ad sp create --id "$DEPLOY_APP_ID" --query id -o tsv 2>/dev/null || az ad sp show --id "$DEPLOY_APP_ID" --query id -o tsv)"
# GitHub presents either a name-based subject or, for newer repositories, one
# that also carries the owner and repository IDs. Register both.
GH_IDS="$(curl -fsSL "https://api.github.com/repos/${REPO}" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["owner"]["id"], r["id"])' || true)"
SUBJECTS=("repo:${REPO}:environment:${ENV_NAME}")
if [[ -n "$GH_IDS" ]]; then
  read -r OWNER_ID REPO_ID <<<"$GH_IDS"
  SUBJECTS+=("repo:${REPO%%/*}@${OWNER_ID}/${REPO##*/}@${REPO_ID}:environment:${ENV_NAME}")
fi
i=0
for subject in "${SUBJECTS[@]}"; do
  az ad app federated-credential create --id "$DEPLOY_APP_ID" --parameters "{
  \"name\": \"github-env-${ENV_NAME}-${i}\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"${subject}\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}" -o none
  i=$((i + 1))
done
# Jobs that use the GitHub "dev" environment present this subject, so only those
# jobs can sign in. Rights are limited to this resource group: Contributor, plus
# role assignment so the template can grant the web app its managed-identity roles.
for role in Contributor "Role Based Access Control Administrator"; do
  az role assignment create --assignee-object-id "$DEPLOY_SP_ID" --assignee-principal-type ServicePrincipal \
    --role "$role" --scope "/subscriptions/${SUB_ID}/resourceGroups/${RG}" -o none
done

echo "== Adviser sign-in app (Entra ID, this tenant only)"
REDIRECT="https://${WEBAPP}.azurewebsites.net/api/auth/callback/azure-ad"
SIGNIN_APP_ID="$(az ad app create --display-name "Heard & Supported (${ENV_NAME})" \
  --sign-in-audience AzureADMyOrg --web-redirect-uris "$REDIRECT" \
  --enable-id-token-issuance true --query appId -o tsv)"
az ad sp create --id "$SIGNIN_APP_ID" -o none 2>/dev/null || true
SIGNIN_SECRET="$(az ad app credential reset --id "$SIGNIN_APP_ID" --display-name github --years 1 --query password -o tsv)"

DB_PASSWORD="$(openssl rand -hex 24)"
NEXTAUTH_SECRET="$(openssl rand -hex 32)"
BUDGET_START="$(date -u +%Y-%m-01)"

echo
echo "== Models you can deploy as EU Data Zone in ${AI_LOCATION}"
az cognitiveservices model list -l "$AI_LOCATION" \
  --query "[?model.skus[?name=='DataZoneStandard']].{format:model.format, name:model.name, version:model.version}" -o table || true
echo
read -r -p "Model name to deploy (from the list): " MODEL_NAME
read -r -p "Model version: " MODEL_VERSION
read -r -p "Model format [OpenAI]: " MODEL_FORMAT
MODEL_FORMAT="${MODEL_FORMAT:-OpenAI}"

set_secret() { if [[ "${USE_GH:-0}" == 1 ]]; then gh secret set "$1" -R "$REPO" -b "$2"; else echo "  secret   $1 = $2"; fi; }
set_var()    { if [[ "${USE_GH:-0}" == 1 ]]; then gh variable set "$1" -R "$REPO" -b "$2"; else echo "  variable $1 = $2"; fi; }

USE_GH=0
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then USE_GH=1; fi
echo
if [[ "$USE_GH" == 1 ]]; then
  echo "== Creating the GitHub environment '${ENV_NAME}' and setting secrets and variables on $REPO"
  gh api -X PUT "repos/${REPO}/environments/${ENV_NAME}" --silent
else
  echo "== GitHub CLI not signed in. In GitHub, create an environment called '${ENV_NAME}'"
  echo "   (Settings > Environments), then add these under Settings > Secrets and variables > Actions."
  echo "   Clear this screen afterwards: the secrets are shown once."
fi
set_secret AZURE_CLIENT_ID "$DEPLOY_APP_ID"
set_secret AZURE_TENANT_ID "$TENANT_ID"
set_secret AZURE_SUBSCRIPTION_ID "$SUB_ID"
set_secret ENTRA_CLIENT_SECRET "$SIGNIN_SECRET"
set_secret NEXTAUTH_SECRET "$NEXTAUTH_SECRET"
set_secret DB_ADMIN_PASSWORD "$DB_PASSWORD"
set_var RESOURCE_GROUP "$RG"
set_var WEBAPP_NAME "$WEBAPP"
set_var ENTRA_CLIENT_ID "$SIGNIN_APP_ID"
set_var DEPLOYER_PRINCIPAL_ID "$DEPLOY_SP_ID"
set_var MODEL_NAME "$MODEL_NAME"
set_var MODEL_VERSION "$MODEL_VERSION"
set_var MODEL_FORMAT "$MODEL_FORMAT"
set_var BUDGET_EMAIL "$BUDGET_EMAIL"
set_var BUDGET_START "$BUDGET_START"
set_var AI_LOCATION "$AI_LOCATION"

echo
echo "Done. Next: push to main (or run the Deploy workflow). The app will be at https://${WEBAPP}.azurewebsites.net"
