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

The inspector's behavior is defined via the internal `CONFIG` block in `swagger-jwt-inspector.js`:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `APP_BEARER_SCHEME` | `"Bearer"` | Name of the primary API Bearer scheme registered in Swagger |
| `MSAL_SCHEME` | `"MsalAuth"` | Name of the enterprise IDP / OAuth2 scheme registered in Swagger |
| `WARNING_THRESHOLD_SECONDS` | `120` (2 mins) | Seconds remaining before expiration when the badge turns amber |
| `COUNTDOWN_TICK_INTERVAL_MS` | `1000` ms | Refresh frequency of the countdown display |

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Escape` | Close the JWT Inspector modal dialog |

> [!NOTE]
> The claims inspector modal is opened by clicking **"Ispeziona Claims"** in the JWT status bar (located directly below Swagger UI's Authorize section) or by clicking the key icon in the **Activity Bar**.
