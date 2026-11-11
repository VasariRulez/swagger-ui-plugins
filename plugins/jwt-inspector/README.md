# Swagger UI JWT Inspector & Token Lifecycle Monitor (`swagger-jwt-inspector.js`)

A real-time JWT token decoder, claims explorer, and expiration countdown monitor for Swagger UI.

---

## Features

- **Automatic Swagger UI Token Detection**: Intercepts authorization tokens stored in Swagger UI's Redux state (`auth.authorized` in `window.ui`).
- **Dual-Token Support**: Decodes both standard Bearer tokens and enterprise identity tokens (Microsoft Entra ID / MSAL / OpenID Connect).
- **Header & Payload Claims Viewer**:
  - Formatted claims table with search filter (`sub`, `iss`, `aud`, `exp`, `roles`, `email`, etc.).
  - Color-coded JSON view of raw claims.
- **Live Expiration Clock**:
  - Real-time countdown timer (`Expires in: 14m 32s`).
  - Visual status pill: Active (Green), Expiring Soon (< 2 mins, Amber), Expired (Red).
- **1-Click Copy & Debugger Link**:
  - Copy raw token or payload with a single click.
  - One-click link to open the token on `jwt.ms` or `jwt.io`.

---

## Quick Start

### 1. Standalone HTML

```html
<script src="/plugins/activity-bar/swagger-activity-bar.js"></script>
<script src="/plugins/jwt-inspector/swagger-jwt-inspector.js"></script>
```

### 2. ASP.NET Core (`Program.cs`)

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    c.InjectJavascript("/plugins/activity-bar/swagger-activity-bar.js");
    c.InjectJavascript("/plugins/jwt-inspector/swagger-jwt-inspector.js");
});
```

---

## Configuration Reference

You can customize the JWT Inspector by providing `window.SwaggerJwtConfig`:

```html
<script>
  window.SwaggerJwtConfig = {
    appSchemeName: "Bearer",               // Primary Bearer scheme name in OpenAPI (default: "Bearer")
    msalSchemeName: "MsalAuth",            // Identity provider scheme name (default: "MsalAuth")
    expiringThresholdMinutes: 5,           // Warning threshold in minutes before expiration (default: 2)
    externalDebugger: "jwt.ms",            // 1-click external debugger: "jwt.ms" or "jwt.io" (default: "jwt.ms")
    tokenStorageKeys: ["access_token"]     // LocalStorage keys checked as fallback if Redux state is empty
  };
</script>
<script src="/plugins/jwt-inspector/swagger-jwt-inspector.js"></script>
```

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `appSchemeName` | `string` | `"Bearer"` | Name of the primary API Bearer scheme registered in Swagger UI |
| `msalSchemeName` | `string` | `"MsalAuth"` | Name of the enterprise IDP / OAuth2 scheme registered in Swagger UI |
| `expiringThresholdMinutes` | `number` | `2` | Minutes remaining before expiration when countdown turns amber/warning |
| `externalDebugger` | `string` | `"jwt.ms"` | Online JWT debugger opened via footer button (`"jwt.ms"` or `"jwt.io"`) |
| `tokenStorageKeys` | `string[]` | `["access_token", ...]` | Keys searched in `localStorage` if token is absent from Redux |

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Escape` | Close the JWT Inspector modal dialog |

> [!NOTE]
> The claims inspector modal is opened by clicking **"Inspect Claims"** in the JWT status bar (located directly below Swagger UI's Authorize section) or by clicking the key icon in the **Activity Bar**.
