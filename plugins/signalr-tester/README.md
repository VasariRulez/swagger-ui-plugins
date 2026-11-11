# Swagger UI SignalR Hub Tester (`swagger-signalr-tester.js`)

A complete, interactive WebSocket & SignalR Hub debugging studio embedded directly into Swagger UI.

---

## Features

- **Full Hub Connection Lifecycle**: Connect, disconnect, and monitor real-time connection state (`Connected`, `Connecting`, `Reconnecting`, `Disconnected`).
- **Hub Preset Selector & Auto-Discovery**: Select common hubs or manually enter any custom SignalR URL path.
- **Client Method Invocation (`Invoke`)**: Call backend Hub methods by name, with dynamic JSON argument arrays (`["param1", 123, { "key": "val" }]`).
- **Real-Time Broadcast Listener**: Register client event listeners (e.g. `ReceiveNotification`, `OrderUpdated`) to view incoming push messages in real time.
- **Live Terminal & Event Stream**:
  - Color-coded log levels (`Info`, `Success`, `Warning`, `Error`, `Inbound`, `Outbound`).
  - Expandable JSON payload viewer for inbound/outbound packets.
  - Filter by log level, event name, or search query.
- **Automatic JWT Bearer Token Injection**: Automatically queries `localStorage` (`swp_bearer_token` or active token from the Token Interceptor plugin) and injects it into the SignalR `accessTokenFactory` headers.

---

## Quick Start

### 1. Dependencies

This plugin requires `@microsoft/signalr` client library. A pre-packaged, minified version is included in this directory (`signalr.min.js`).

### 2. Standalone HTML

```html
<!-- 1. Activity Bar (Optional, for dock icon) -->
<script src="/plugins/activity-bar/swagger-activity-bar.js"></script>

<!-- 2. SignalR Client Library -->
<script src="/plugins/signalr-tester/signalr.min.js"></script>

<!-- 3. SignalR Tester Plugin -->
<script src="/plugins/signalr-tester/swagger-signalr-tester.js"></script>
```

### 3. ASP.NET Core (`Program.cs`)

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    c.InjectJavascript("/plugins/activity-bar/swagger-activity-bar.js");
    c.InjectJavascript("/plugins/signalr-tester/signalr.min.js");
    c.InjectJavascript("/plugins/signalr-tester/swagger-signalr-tester.js");
});
```

---

## Configuration

Define predefined hubs, common methods, and default listeners via `window.SwaggerSignalRConfig`:

```javascript
window.SwaggerSignalRConfig = {
    // Hub presets available in the hub URL dropdown
    hubs: [
        { name: "Notifications Hub", url: "/hubs/notifications" },
        { name: "Chat Hub", url: "/hubs/chat" },
        { name: "Live Telemetry", url: "/hubs/telemetry" }
    ],

    // Default listeners pre-registered upon connection
    defaultListeners: [
        "ReceiveMessage",
        "ReceiveNotification",
        "Heartbeat"
    ],

    // Default connection options
    transport: "WebSockets", // "WebSockets" | "LongPolling" | "ServerSentEvents"
    autoReconnect: true
};
```

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Alt + S` | Toggle SignalR Studio drawer |
| `Escape` | Close the SignalR drawer |

---

## Usage Workflow

1. Open the studio via the Activity Bar icon (radio waves) or press `Alt + S`.
2. Choose a preset hub from the dropdown or type `/hubs/yourhub`.
3. If your hub requires authentication, the studio will automatically bind your active Bearer token.
4. Click **Connect**.
5. Under **Listeners**, add methods your backend broadcasts (e.g. `ReceiveUpdate`).
6. Under **Invoke Method**, type your server method name and arguments to test two-way communication.
