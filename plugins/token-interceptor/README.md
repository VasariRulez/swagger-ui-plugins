# Swagger UI Token Interceptor & Auth Bridge (`swagger-token-interceptor.js`)

A seamless authentication bridge that automates enterprise SSO token exchange (such as Microsoft Entra ID / MSAL to internal Bearer token), injects authorization headers, and synchronizes authentication state across Swagger UI plugins.

---

## Features

- **Enterprise SSO / MSAL Token Interceptor**: Transparently catches OAuth2 / OIDC / MSAL authentication events from Swagger UI's native Authorize modal.
- **Automated Token Exchange**: When a user logs in via identity provider, automatically dispatches an exchange request to an internal authentication API (e.g. `/api/auth/token`) to acquire an API Bearer token.
- **Dual Scheme Support**: Retains the identity provider token in its original security scheme while injecting the exchanged token into the standard `Bearer` scheme.
- **Cross-Plugin Broadcast**: Broadcasts authentication events to other active plugins (Network History, SignalR Tester, JWT Inspector).
- **Coordinated Logout**: Clearing authorization in Swagger UI automatically revokes the exchanged Bearer token, cleans up auto-filled fields, and resets dependent plugin sessions.

---

## Quick Start

### 1. Standalone HTML

```html
<script>
window.SwaggerAuthConfig = {
    // Backend endpoint that accepts the identity token and returns an application Bearer token
    exchangeEndpoint: "/api/auth/token",
    // Name of the OAuth2 / MSAL scheme in Swagger definition (default: "MsalAuth")
    msalSchemeName: "MsalAuth",
    // Target security scheme name in Swagger definition for the exchanged token (default: "Bearer")
    appSchemeName: "Bearer",
    // Request headers to automatically populate with the raw IDP token
    targetHeaders: ["AzureAuthorization"]
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

You can optionally configure the exchange behavior by defining `window.SwaggerAuthConfig` before `swagger-token-interceptor.js` executes:

```html
<script>
  window.SwaggerAuthConfig = {
    exchangeEndpoint: "/api/auth/token",    // Backend URL for exchanging SSO token for internal app token
    tokenProperty: "data.access_token",     // Dot-notated property path in response JSON (default: "data.access_token")
    msalSchemeName: "MsalAuth",             // Security scheme identifier for IDP in OpenAPI spec
    appSchemeName: "Bearer",                // Target security scheme identifier in OpenAPI spec
    targetHeaders: ["AzureAuthorization"]   // Headers to populate automatically with raw IDP token
  };
</script>
<script src="/plugins/token-interceptor/swagger-token-interceptor.js"></script>
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `exchangeEndpoint` | `string` | `"/api/auth/token"` | Backend API URL for exchanging SSO token for internal app token |
| `tokenProperty` | `string` | `"data.access_token"` | Dot-separated path to the token string inside exchange response JSON |
| `msalSchemeName` | `string` | `"MsalAuth"` | Security scheme identifier in OpenAPI spec for IDP / Entra ID |
| `appSchemeName` | `string` | `"Bearer"` | Target security scheme identifier in OpenAPI spec |
| `targetHeaders` | `string[]` | `["AzureAuthorization"]` | List of header names to automatically populate with the raw IDP token |

---

## Workflow Diagram

```text
[User logs in via Swagger "Authorize" (Entra ID / OAuth2)]
                     │
                     ▼
  [Token Interceptor catches MSAL id_token / access_token]
                     │
                     ▼
  [POST /api/auth/token { Authorization: Bearer <msalToken> }]
                     │
                     ▼
  [Backend returns API Bearer Token (data.access_token)]
                     │
                     ▼
  [Apply Bearer Token directly into Swagger UI (ui.authActions.authorize)]
                     │
                     ▼
  [Notify dependent plugins & update JWT status bar]
```

---

## Internationalization (i18n)

This plugin fully supports runtime internationalization (i18n) with base dictionaries for:
- 🇬🇧 **English (`en`)** - Default
- 🇮🇹 **Italian (`it`)**

### Runtime Language Switcher
When used alongside `swagger-activity-bar.js`, users can toggle the active language live via the Activity Bar switcher (`🌐 EN | IT`) at the bottom left. The active language is automatically persisted to `localStorage` under the key `"swp_swagger_i18n_locale"` and survives page reloads.

### Host Configuration & Custom Overrides
You can define initial locale or override specific message keys via `window.SwaggerI18nConfig`:

```html
<script>
  window.SwaggerI18nConfig = {
    locale: "it", // "en" | "it" (default: "en")
    autoDetect: true, // Auto-detect from <html lang="..."> if no saved preference
    messages: {
      it: {
        // Optional key overrides
      }
    }
  };
</script>
```
