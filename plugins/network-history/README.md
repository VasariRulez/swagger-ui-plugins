# Swagger UI Network History & Performance Inspector (`swagger-network-history.js`)

A live network logger, latency/payload metric monitor, and instant request replay engine for Swagger UI.

---

## Features

- **Global Fetch & XHR Interception**: Transparently captures all HTTP calls executed by Swagger UI without modifying Swagger's internal state.
- **Inline Operation Performance Badges**: Displays execution metrics (`HTTP Status`, latency in `ms`, payload size in `KB`) right inside the response block of each operation.
- **Instant Replay Engine**: Allows 1-click replaying of any historical request directly from the log drawer, automatically re-populating parameters and executing the call.
- **Slide-out History Drawer**: A rich slide-out panel accessible from the Activity Bar or hotkey, featuring:
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

## Configuration

You can customize the network history behavior by setting `window.SwaggerNetworkHistoryConfig` before the script runs:

```javascript
window.SwaggerNetworkHistoryConfig = {
    // Maximum number of entries kept in circular buffer (default: 50)
    maxEntries: 100,

    // Storage key in localStorage (default: "swp_swagger_network_history")
    storageKey: "swp_swagger_network_history",

    // Automatically open drawer on network errors (default: false)
    openOnError: false,

    // Filter out specific URLs from logging (e.g. swagger.json)
    excludePatterns: [
        /swagger\.json/i,
        /\/favicon\.ico/i
    ]
};
```

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Alt + H` | Toggle Network History drawer |
| `Escape` | Close the history drawer |

---

## Replay Workflow

1. Execute any request in Swagger UI using the standard **Execute** button.
2. The response container displays a performance badge with latency (e.g., `⚡ 124ms · 4.2 KB · 200 OK`).
3. Click the Activity Bar network icon or press `Alt + H` to view the history drawer.
4. Click **Replay** on any previous request to restore parameters, focus the operation, and trigger execution.
