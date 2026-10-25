// Heard & Supported: development environment (synthetic data only).
// Everything holding case data is in UK South. The AI model runs in an EU
// Data Zone, which needs its Foundry resource in an EU region (default Sweden
// Central). Document reading (Document Intelligence) runs in UK South.

targetScope = 'resourceGroup'

@description('Region for the app, database, storage and document reading.')
param location string = 'uksouth'

@description('EU region for the Foundry (AI model) resource. Data Zone deployments process within the EU.')
param aiLocation string = 'swedencentral'

@description('Short environment name, used in resource names.')
param env string = 'dev'

@description('App name. Chosen by the bootstrap script.')
param webAppName string

@description('The app image, already pushed to the registry (registry.bicep).')
param image string

@description('Registry login server, from registry.bicep.')
param registryServer string

@description('The app identity, from registry.bicep.')
param identityName string

@description('Model to deploy, from the list the bootstrap script prints.')
param modelName string

@description('Model version, from the same list.')
param modelVersion string

@description('Model format: OpenAI for Azure OpenAI models; other families use their own publisher name.')
param modelFormat string = 'OpenAI'

@description('Replicas kept running. 0 scales to nothing when idle (a cold start of some seconds); 1 keeps it warm.')
@allowed([0, 1])
param minReplicas int = 0

@description('Model deployment type. DataZoneStandard keeps processing in the EU; Standard keeps it in aiLocation. GlobalStandard is for synthetic data only.')
@allowed(['DataZoneStandard', 'Standard', 'GlobalStandard'])
param modelSku string = 'DataZoneStandard'

@description('Deployment capacity in thousands of tokens per minute.')
param modelCapacity int = 20

@description('Entra ID app registration (client) ID used for adviser sign-in.')
param entraClientId string

@description('Entra ID tenant ID.')
param entraTenantId string = tenant().tenantId

@secure()
@description('Entra ID client secret for adviser sign-in.')
param entraClientSecret string

@secure()
@description('Session encryption secret.')
param nextAuthSecret string

@secure()
@description('PostgreSQL administrator password (letters and digits only).')
param dbAdminPassword string

@description('Object ID of the GitHub deploy identity, so the evaluation workflow can call the model.')
param deployerPrincipalId string = ''

@description('Email address for the monthly budget alert.')
param budgetEmail string

@description('The first admin: on a new installation, the only person who can sign in without an invitation.')
param firstAdminEmail string = ''

@description('Monthly budget in GBP-equivalent billing currency.')
param budgetAmount int = 50

@description('First day of the current month, for the budget start date.')
param budgetStart string = utcNow('yyyy-MM-01')

var suffix = uniqueString(resourceGroup().id)
var tags = { project: 'heard-supported', env: env, data: 'synthetic-only' }
var dbName = 'heardsupported'
var dbAdmin = 'hsadmin'

// ---------- Secrets ----------
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'hs-${env}-kv-${take(suffix, 8)}'
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

// ---------- Database ----------
resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'hs-${env}-pg-${take(suffix, 8)}'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: dbAdmin
    administratorLoginPassword: dbAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }
}

resource pgDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: dbName
}

// Allows Azure services (the app) to connect. Before any real client data,
// replace with private networking (see SECURITY.md).
resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: pg
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource secretDbUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'database-url'
  properties: {
    value: 'postgresql://${dbAdmin}:${dbAdminPassword}@${pg.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require'
  }
}

resource secretEntra 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'entra-client-secret'
  properties: { value: entraClientSecret }
}

resource secretNextAuth 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'nextauth-secret'
  properties: { value: nextAuthSecret }
}

// ---------- Document storage ----------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'hs${env}st${take(suffix, 10)}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    encryption: {
      keySource: 'Microsoft.Storage'
      services: { blob: { enabled: true } }
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: { deleteRetentionPolicy: { enabled: false } }
}

resource docsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'documents'
  properties: { publicAccess: 'None' }
}

// ---------- Document reading (UK South) ----------
resource docIntel 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'hs-${env}-di-${take(suffix, 8)}'
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'hs-${env}-di-${take(suffix, 8)}'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

// ---------- AI model (EU Data Zone) ----------
resource ai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'hs-${env}-ai-${take(suffix, 8)}'
  location: aiLocation
  tags: tags
  kind: 'AIServices'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'hs-${env}-ai-${take(suffix, 8)}'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: ai
  name: 'review-model'
  sku: { name: modelSku, capacity: modelCapacity }
  properties: {
    model: { format: modelFormat, name: modelName, version: modelVersion }
  }
}

// ---------- App (Azure Container Apps) ----------
resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'hs-${env}-logs'
  location: location
  tags: tags
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30, workspaceCapping: { dailyQuotaGb: 1 } }
}

resource caEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'hs-${env}-apps'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: logs.properties.customerId, sharedKey: logs.listKeys().primarySharedKey }
    }
  }
}

var appUrl = 'https://${webAppName}.${caEnv.properties.defaultDomain}'

// The identity needs its Key Vault, storage and AI roles before the app first starts.
var roles = {
  blobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  cognitiveServicesUser: 'a97b65f3-24c7-4388-baec-2e87135dc908'
  openAiUser: '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
  kvSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
}

resource raBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, appIdentity.id, roles.blobDataContributor)
  scope: storage
  properties: { principalId: appIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.blobDataContributor) }
}

resource raDocIntel 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(docIntel.id, appIdentity.id, roles.cognitiveServicesUser)
  scope: docIntel
  properties: { principalId: appIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.cognitiveServicesUser) }
}

resource raAi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(ai.id, appIdentity.id, roles.openAiUser)
  scope: ai
  properties: { principalId: appIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.openAiUser) }
}

resource raKv 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, appIdentity.id, roles.kvSecretsUser)
  scope: kv
  properties: { principalId: appIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.kvSecretsUser) }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: webAppName
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${appIdentity.id}': {} } }
  dependsOn: [ raKv, raBlob, raDocIntel, raAi ]
  properties: {
    managedEnvironmentId: caEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false }
      registries: [ { server: registryServer, identity: appIdentity.id } ]
      secrets: [
        { name: 'database-url', keyVaultUrl: secretDbUrl.properties.secretUri, identity: appIdentity.id }
        { name: 'entra-client-secret', keyVaultUrl: secretEntra.properties.secretUri, identity: appIdentity.id }
        { name: 'nextauth-secret', keyVaultUrl: secretNextAuth.properties.secretUri, identity: appIdentity.id }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: image
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'AZURE_AD_CLIENT_SECRET', secretRef: 'entra-client-secret' }
            { name: 'NEXTAUTH_SECRET', secretRef: 'nextauth-secret' }
            { name: 'AZURE_CLIENT_ID', value: appIdentity.properties.clientId }   // which identity the Azure SDK signs in as
            { name: 'AZURE_AD_CLIENT_ID', value: entraClientId }
            { name: 'AZURE_AD_TENANT_ID', value: entraTenantId }
            { name: 'NEXTAUTH_URL', value: appUrl }
            { name: 'DOCINTEL_ENDPOINT', value: docIntel.properties.endpoint }
            { name: 'AI_ENDPOINT', value: ai.properties.endpoints['OpenAI Language Model Instance API'] }
            { name: 'AI_DEPLOYMENT', value: modelDeployment.name }
            { name: 'STORAGE_ACCOUNT', value: storage.name }
            { name: 'STORAGE_CONTAINER', value: docsContainer.name }
            { name: 'DATA_MODE', value: 'synthetic-only' }
            { name: 'BOOTSTRAP_ADMIN_EMAIL', value: firstAdminEmail }
          ]
          probes: [
            { type: 'Startup', httpGet: { path: '/signup', port: 3000 }, initialDelaySeconds: 3, periodSeconds: 5, failureThreshold: 24 }
          ]
        }
      ]
      scale: { minReplicas: minReplicas, maxReplicas: 1 }
    }
  }
}

// The deploy identity runs the evaluation harness against the model and Document Intelligence.
resource raDeployerAi 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(ai.id, deployerPrincipalId, roles.openAiUser)
  scope: ai
  properties: { principalId: deployerPrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.openAiUser) }
}

resource raDeployerDocIntel 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(docIntel.id, deployerPrincipalId, roles.cognitiveServicesUser)
  scope: docIntel
  properties: { principalId: deployerPrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.cognitiveServicesUser) }
}

// ---------- Budget alert ----------
resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'hs-${env}-monthly'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStart }
    notifications: {
      actual80: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 80, thresholdType: 'Actual', contactEmails: [ budgetEmail ] }
      forecast100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Forecasted', contactEmails: [ budgetEmail ] }
    }
  }
}

output webUrl string = appUrl
output signInRedirect string = '${appUrl}/api/auth/callback/azure-ad'
output aiEndpoint string = ai.properties.endpoints['OpenAI Language Model Instance API']
output aiDeployment string = modelDeployment.name
output docIntelEndpoint string = docIntel.properties.endpoint
