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
- **Automatic JWT Bearer Token Injection**: Automatically extracts the active Bearer token from Swagger UI's internal authorization state and injects it into SignalR's `accessTokenFactory`.

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

## Configuration Reference

You can customize the studio presets and transport by defining `window.SwaggerSignalRConfig`:

```html
<script>
  window.SwaggerSignalRConfig = {
    hubs: [
      { name: "Notifications Hub", url: "/hubs/notifications" },
      { name: "Live Chat Hub", url: "/hubs/chat" },
      { name: "Telemetry Hub", url: "/hubs/telemetry" }
    ],
    defaultListeners: ["ReceiveMessage", "Notification", "StatusChanged"],
    transport: "WebSockets", // Optional: "WebSockets" | "ServerSentEvents" | "LongPolling"
    autoReconnect: true       // Optional: enable automatic reconnect with exponential backoff
  };
</script>
<script src="/plugins/signalr-tester/swagger-signalr-tester.js"></script>
```

| Setting | Type | Description |
| :--- | :--- | :--- |
| `hubs` | `Array<{name, url}>` | List of hub presets shown in the hub selector dropdown |
| `defaultListeners` | `string[]` | Initial event names preloaded into listener tags |
| `transport` | `string` | Force specific SignalR transport (`"WebSockets"`, `"LongPolling"`, `"ServerSentEvents"`) |
| `autoReconnect` | `boolean` | Enable automatic reconnection logic (`withAutomaticReconnect()`) |

> [!TIP]
> You do not need to modify the code to connect to your hub: you can directly type any relative (`/hubs/my-hub`) or absolute (`https://api.domain.com/hubs/my-hub`) hub URL directly in the studio's input field.

---

## Keyboard Shortcuts

| Shortcut | Context | Description |
| :--- | :--- | :--- |
| `Escape` | Global | Close the SignalR Studio drawer |
| `Enter` | Listener input field | Register the typed event listener |

> [!NOTE]
> The studio drawer is opened by clicking the radio waves icon in the **Activity Bar** (or the floating action button if Activity Bar is not installed).

---

## Usage Workflow

1. Open the studio via the Activity Bar icon (radio waves).
2. Choose a preset hub from the dropdown or type `/hubs/yourhub`.
3. If your hub requires authentication, the studio will automatically bind your active Bearer token from Swagger UI.
4. Click **Connect**.
5. Under **Listeners**, add methods your backend broadcasts (e.g. `ReceiveUpdate`).
6. Under **Invoke Method**, type your server method name and arguments (as a JSON array, e.g. `["hello", 42]`) to test two-way communication.
