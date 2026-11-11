# Swagger UI Network History & Performance Inspector (`swagger-network-history.js`)

A live network logger, latency/payload metric monitor, and instant request replay engine for Swagger UI.

---

## Features

- **Global Fetch & XHR Interception**: Transparently captures all HTTP calls executed by Swagger UI without modifying Swagger's internal state.
- **Inline Operation Performance Badges**: Displays execution metrics (`HTTP Status`, latency in `ms`, payload size in `KB`) right inside the response block of each operation.
- **Instant Replay Engine**: Allows 1-click replaying of any historical request directly from the log drawer, automatically re-populating parameters and executing the call.
- **Slide-out History Drawer**: A rich slide-out panel accessible from the Activity Bar, featuring:
  - Real-time search filter (URL, method, status code).
  - Method pills (`GET`, `POST`, `PUT`, `DELETE`, etc.).
  - Detailed request & response inspection (headers, body, timestamps).
  - cURL exporter for command-line reproduction.
- **Persistent Storage**: Retains request history in `localStorage` across page reloads using a circular buffer (default: 50 items).

---

## Quick Start

### 1. Standalone HTML

```html
<script src="/plugins/activity-bar/swagger-activity-bar.js"></script>
<script src="/plugins/network-history/swagger-network-history.js"></script>
```

### 2. ASP.NET Core (`Program.cs`)

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    c.InjectJavascript("/plugins/activity-bar/swagger-activity-bar.js");
    c.InjectJavascript("/plugins/network-history/swagger-network-history.js");
});
```

---

## Configuration Reference

You can customize the plugin by declaring `window.SwaggerNetworkHistoryConfig` before loading the script:

```html
<script>
  window.SwaggerNetworkHistoryConfig = {
    maxEntries: 100,                     // Retain up to 100 entries in the circular buffer (default: 50)
    storageKey: "my_network_history",    // Custom localStorage key (default: "swp_swagger_network_history")
    drawerWidth: 520,                    // Drawer width in pixels (default: 480)
    openOnError: true,                   // Automatically open drawer on HTTP >= 400 or network error (default: false)
    fastThreshold: 400,                  // Latency < 400ms renders green badge (default: 500)
    mediumThreshold: 1200,               // Latency 400-1200ms renders yellow badge (default: 1500)
    excludePatterns: [/healthcheck/i]    // Additional RegExp patterns to exclude from history
  };
</script>
<script src="/plugins/network-history/swagger-network-history.js"></script>
```

| Setting | Default | Description |
| :--- | :--- | :--- |
| `storageKey` | `"swp_swagger_network_history"` | Key used in `localStorage` for persisting the circular buffer across sessions |
| `maxEntries` | `50` | Maximum number of intercepted calls retained in history |
| `drawerWidth` | `480` | Width in pixels of the slide-out drawer |
| `openOnError` | `false` | Automatically opens history drawer when a request fails or returns HTTP >= 400 |
| `fastThreshold` | `500` ms | Latencies below this threshold display green pills |
| `mediumThreshold`| `1500` ms | Latencies between fast and medium display orange pills; above display red pills |
| `activityBarOrder` | `10` | Sort order in Activity Bar dock (lower values appear first, default: 10) |
| `excludePatterns` | `[]` | Additional regex patterns to exclude from recording |

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Escape` | Close the history drawer |

> [!NOTE]
> The drawer is toggled by clicking the clock/network icon (clock with arrows) in the **Activity Bar** (or the floating action button when Activity Bar is not installed).

---

## Replay Workflow

1. Execute any request in Swagger UI using the standard **Execute** button.
2. The response container displays a performance badge with latency (e.g., `⚡ 124ms · 4.2 KB · 200 OK`).
3. Click the Activity Bar network icon to open the history drawer.
4. Click **Replay** on any previous request to restore parameters, focus the operation, and trigger execution.
5. Click **Restore** to populate parameters into the form without auto-executing.

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
