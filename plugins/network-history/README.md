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

The plugin behavior is governed by the internal `CONFIG` block in `swagger-network-history.js`:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `STORAGE_KEY` | `"swp_swagger_network_history"` | Key used in `localStorage` for persisting the circular buffer across sessions |
| `MAX_HISTORY_ENTRIES` | `50` | Maximum number of intercepted calls retained in history |
| `DRAWER_WIDTH_PX` | `480` | Width in pixels of the slide-out drawer |
| `LATENCY_THRESHOLDS.FAST` | `500` ms | Latencies below this threshold display green pills |
| `LATENCY_THRESHOLDS.MEDIUM`| `1500` ms | Latencies between fast and medium display orange pills; above display red pills |
| `IGNORED_URL_PATTERNS` | `[ /\.js/i, /\.css/i, /swagger\.json/i, ... ]` | Asset types and endpoints excluded from logging |

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
5. Click **Ripristina** (Restore) to populate parameters into the form without auto-executing.
