# Swagger UI Plugins Suite

A modular collection of productivity extensions, debugging studios, and developer tools for [Swagger UI](https://swagger.io/tools/swagger-ui/).

Zero external build steps. Vanilla JavaScript and CSS. Fully compatible with standalone Swagger UI as well as ASP.NET Core Swashbuckle / NSwag.

---

## Plugins Overview

| Plugin | Directory | Description |
| :--- | :--- | :--- |
| **Activity Bar & Guide** | [`plugins/activity-bar`](./plugins/activity-bar) | VS Code-style vertical dock with dynamic plugin registry and Extensions Help Guide. |
| **Network History & Replay** | [`plugins/network-history`](./plugins/network-history) | Global fetch/XHR logger, inline performance badges (`ms`/`KB`), and instant request replay. |
| **Spotlight Command Palette** | [`plugins/spotlight-search`](./plugins/spotlight-search) | `Ctrl + K` fuzzy search modal with smooth scroll glow and keyboard navigation. |
| **Data Grid & Tabular View** | [`plugins/data-grid-view`](./plugins/data-grid-view) | Turns JSON arrays and paged envelopes into interactive sortable tables with CSV export. |
| **SignalR Hub Tester** | [`plugins/signalr-tester`](./plugins/signalr-tester) | Embedded WebSocket/SignalR debugging console with invoke and real-time listeners. |
| **JWT Inspector** | [`plugins/jwt-inspector`](./plugins/jwt-inspector) | Decodes Bearer and MSAL tokens, claims table inspection, and real-time expiration timer. |
| **Pretty JSON View** | [`plugins/pretty-json-view`](./plugins/pretty-json-view) | Collapsible tree view, HTTP method color coding, copy, download, and raw view toggle. |
| **DTO Presets Generator** | [`plugins/dto-presets`](./plugins/dto-presets) | Polymorphic body generator (`$type`), custom developer presets saved in `localStorage`. |
| **Token Interceptor** | [`plugins/token-interceptor`](./plugins/token-interceptor) | Enterprise SSO bridge exchanging identity provider tokens for application Bearer tokens. |

---

## Directory Structure

```text
swagger-ui-plugins/
├── LICENSE
├── README.md
├── examples/
│   ├── aspnet-core/
│   │   └── ProgramSnippet.cs
│   └── static-html/
│       └── index.html
└── plugins/
    ├── activity-bar/
    │   ├── README.md
    │   └── swagger-activity-bar.js
    ├── data-grid-view/
    │   ├── README.md
    │   └── swagger-data-grid-view.js
    ├── dto-presets/
    │   ├── README.md
    │   └── swagger-dto-presets.js
    ├── jwt-inspector/
    │   ├── README.md
    │   └── swagger-jwt-inspector.js
    ├── network-history/
    │   ├── README.md
    │   └── swagger-network-history.js
    ├── pretty-json-view/
    │   ├── README.md
    │   └── swagger-pretty-json-view.js
    ├── signalr-tester/
    │   ├── README.md
    │   ├── signalr.min.js
    │   └── swagger-signalr-tester.js
    ├── spotlight-search/
    │   ├── README.md
    │   └── swagger-spotlight-search.js
    └── token-interceptor/
        ├── README.md
        └── swagger-token-interceptor.js
```

---

## Integration Guide

### ASP.NET Core (`app.UseSwaggerUI`)

Drop the plugin files into your `wwwroot/plugins/` directory and inject them in `Program.cs`:

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");

    // Load Activity Bar first so plugins can register in the Guide
    c.InjectJavascript("/plugins/activity-bar/swagger-activity-bar.js");

    // Utilities & Enhancers
    c.InjectJavascript("/plugins/spotlight-search/swagger-spotlight-search.js");
    c.InjectJavascript("/plugins/pretty-json-view/swagger-pretty-json-view.js");
    c.InjectJavascript("/plugins/data-grid-view/swagger-data-grid-view.js");
    c.InjectJavascript("/plugins/dto-presets/swagger-dto-presets.js");

    // Telemetry & Tools
    c.InjectJavascript("/plugins/network-history/swagger-network-history.js");
    c.InjectJavascript("/plugins/jwt-inspector/swagger-jwt-inspector.js");

    // Real-Time SignalR
    c.InjectJavascript("/plugins/signalr-tester/signalr.min.js");
    c.InjectJavascript("/plugins/signalr-tester/swagger-signalr-tester.js");
});
```

See [examples/aspnet-core/ProgramSnippet.cs](./examples/aspnet-core/ProgramSnippet.cs) for a complete example.

### Standalone HTML / Docker Swagger UI

Include the script tags after `swagger-ui-bundle.js`. See [examples/static-html/index.html](./examples/static-html/index.html).

---

## Global Keyboard Shortcuts

| Shortcut | Action | Plugin |
| :--- | :--- | :--- |
| `Ctrl + K` / `Cmd + K` or `/` | Open Spotlight Search | Spotlight Search |
| `Alt + /` or `?` | Open Extensions Guide | Activity Bar |
| `Alt + H` | Toggle Network History Drawer | Network History |
| `Alt + S` | Toggle SignalR Studio Drawer | SignalR Tester |
| `Alt + J` | Toggle JWT Inspector Drawer | JWT Inspector |
| `Escape` | Close any active modal or drawer | All Plugins |

---

## Namespace & Customization

All plugins follow the isolated `swp-` CSS class, DOM ID, and storage prefix standard (e.g., `swp-activity-bar`, `swp_swagger_network_history`), ensuring complete isolation from host application styles and third-party scripts.

---

## License

This project is licensed under the [MIT License](./LICENSE).
