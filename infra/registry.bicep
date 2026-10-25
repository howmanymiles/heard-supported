// Deployed first, before the image is built: the container registry, and the
// identity the app runs as, which can pull from it. Container Apps replaced App
// Service here because the subscription has no App Service quota.

targetScope = 'resourceGroup'

param location string = 'uksouth'
param env string = 'dev'

var suffix = uniqueString(resourceGroup().id)
var tags = { project: 'heard-supported', env: env, data: 'synthetic-only' }

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'hs${env}acr${take(suffix, 10)}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

// The app's identity: pulls the image, reads its secrets, and calls storage, document reading and the AI.
resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'hs-${env}-app-id'
  location: location
  tags: tags
}

resource raPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, appIdentity.id, 'acrpull')
  scope: acr
  properties: { principalId: appIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') }
}

output registryName string = acr.name
output registryServer string = acr.properties.loginServer
output identityName string = appIdentity.name
