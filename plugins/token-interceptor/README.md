# Swagger UI Token Interceptor & Auth Bridge (`swagger-token-interceptor.js`)

A seamless authentication bridge that automates enterprise SSO token exchange (such as Microsoft Entra ID / MSAL to internal Bearer token), injects authorization headers, and synchronizes authentication state across Swagger UI plugins.

---

## Features

- **Enterprise SSO / MSAL Token Interceptor**: Transparently catches OAuth2 / OIDC / MSAL authentication events from Swagger UI's native Authorize modal.
- **Automated Token Exchange**: When a user logs in via identity provider, automatically dispatches an exchange request to an internal authentication API (e.g. `/api/auth/token`) to acquire an API Bearer token.
- **Dual Scheme Support**: Retains the identity provider token in its original security scheme while injecting the exchanged token into the standard `Bearer` scheme.
- **Cross-Plugin Broadcast**: Broadcasts authentication events to other active plugins (Network History, SignalR Tester, JWT Inspector).
- **Coordinated Logout**: Clearing the authorization in Swagger UI automatically clears exchanged tokens, localStorage items, and resets dependent plugin sessions.

---

## Quick Start

### 1. Standalone HTML

```html
<script>
window.SwaggerAuthConfig = {
    // Backend endpoint that accepts the identity token and returns an application Bearer token
    exchangeEndpoint: "/api/auth/token",
    // Name of the OAuth2 / MSAL scheme in Swagger definition
    msalSchemeName: "msal_oauth2",
    // Target security scheme name in Swagger definition for the exchanged token
    appSchemeName: "Bearer",
    // Request headers to inspect/inject
    tokenProperty: "token"
};
</script>
<script src="/plugins/token-interceptor/swagger-token-interceptor.js"></script>
```

### 2. ASP.NET Core (`Program.cs`)

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    c.InjectJavascript("/plugins/token-interceptor/swagger-token-interceptor.js");
});
```

---

## Configuration Reference

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `exchangeEndpoint` | `string` | `"/api/auth/token"` | Backend API URL for exchanging SSO token for internal app token |
| `msalSchemeName` | `string` | `"msal"` | Security scheme identifier in OpenAPI spec for IDP / Entra ID |
| `appSchemeName` | `string` | `"Bearer"` | Target security scheme identifier in OpenAPI spec |
| `storageKey` | `string` | `"swp_bearer_token"` | Key used to store the active Bearer token in `localStorage` |

---

## Workflow Diagram

```
[User logs in via Swagger "Authorize" (Entra ID / OAuth2)]
                     │
                     ▼
  [Token Interceptor catches MSAL id_token / access_token]
                     │
                     ▼
  [POST /api/auth/token { token: "..." }]
                     │
                     ▼
  [Backend returns API Bearer Token]
                     │
       ┌─────────────┴─────────────┐
       ▼                           ▼
[Set Swagger UI Bearer State]   [Store in localStorage]
                                   │
                                   ▼
            [Notify SignalR Tester & JWT Inspector]
```
