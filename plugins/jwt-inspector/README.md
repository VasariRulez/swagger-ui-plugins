# Swagger UI JWT Inspector & Token Lifecycle Monitor (`swagger-jwt-inspector.js`)

A real-time JWT token decoder, claims explorer, and expiration countdown monitor for Swagger UI.

---

## Features

- **Automatic Swagger UI Token Detection**: Intercepts authorization tokens stored in Swagger UI (`auth` state in `window.ui`) and `localStorage`.
- **Dual-Token Support**: Decodes both standard Bearer tokens and enterprise identity tokens (Microsoft Entra ID / MSAL / OpenID Connect).
- **Header & Payload Claims Viewer**:
  - Formatted claims table with search filter (`sub`, `iss`, `aud`, `exp`, `roles`, `email`, etc.).
  - Color-coded JSON view of raw claims.
- **Live Expiration Clock**:
  - Real-time countdown timer (`Expires in: 14m 32s`).
  - Visual status pill: Active (Green), Expiring Soon (< 5 mins, Amber), Expired (Red).
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

## Configuration

Optionally configure token storage keys and warning thresholds via `window.SwaggerJwtConfig`:

```javascript
window.SwaggerJwtConfig = {
    // Custom storage keys to watch for tokens
    tokenStorageKeys: [
        "swp_bearer_token",
        "access_token",
        "id_token"
    ],

    // Warning threshold in minutes for "Expiring Soon" state (default: 5)
    expiringThresholdMinutes: 5,

    // Preferred external debugger link: "jwt.ms" | "jwt.io" (default: "jwt.ms")
    externalDebugger: "jwt.ms"
};
```

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Alt + J` | Toggle JWT Inspector drawer |
| `Escape` | Close inspector drawer |
