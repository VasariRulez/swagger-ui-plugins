# Swagger UI Activity Bar & Extensions Guide (`swagger-activity-bar.js`)

A sleek, VS Code-inspired Activity Bar and extensible documentation hub for Swagger UI.

The **Activity Bar** attaches a vertical toolbar to the left edge of Swagger UI, providing a unified container for custom tools, drawers, status indicators, and an interactive **Extensions Guide** modal that documents all registered plugins in real time.

---

## Features

- **VS Code-style Activity Dock**: Docked vertically on the left edge with customizable icon buttons, active indicators, and notification badges.
- **Unified Sidebar / Drawer Manager**: Manages opening, closing, and toggling of flyout drawers from any registered plugin (e.g. Network History, SignalR Tester, JWT Inspector).
- **Interactive Extensions Guide (Help Center)**: Built-in modal dialog documenting every active plugin, keyboard shortcut, configuration snippet, and interactive walkthrough.
- **Dynamic Plugin Self-Registration API (`window.registerPluginGuide`)**: Other plugins automatically register their metadata, badges, and documentation cards when loaded.
- **Zero Dependencies**: Pure vanilla JavaScript & CSS with isolated namespacing (`swp-activity-bar-*`, `swp-guide-*`).

---

## Quick Start

### 1. Standalone HTML

Include `swagger-activity-bar.js` after Swagger UI's bundle:

```html
<!-- Swagger UI assets -->
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
<script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>

<!-- Activity Bar Plugin (load first among suite plugins) -->
<script src="/plugins/activity-bar/swagger-activity-bar.js"></script>
```

### 2. ASP.NET Core (`Program.cs`)

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    // Inject Activity Bar first so other plugins can register their guide entries
    c.InjectJavascript("/plugins/activity-bar/swagger-activity-bar.js");
    c.InjectJavascript("/plugins/network-history/swagger-network-history.js");
    // ... other plugins
});
```

---

## How It Works

1. Once the DOM and Swagger UI mount, the plugin creates the container `#swp-activity-bar` fixed to the left.
2. The bottom of the bar features a **Guide (Help)** button (puzzle icon) that opens the comprehensive documentation dialog.
3. Plugins can hook into the Activity Bar via global helper APIs exposed on `window`.

---

## JavaScript API

### Registering a Plugin in the Extensions Guide

Any custom plugin can add a card to the Extensions Guide dialog:

```javascript
if (typeof window.registerPluginGuide === "function") {
    window.registerPluginGuide({
        id: "my-custom-plugin",
        title: "My Custom Plugin",
        badge: "v1.0",
        order: 10, // sorting order in the guide modal
        summary: "Detailed overview of what this plugin provides.",
        features: [
            "Feature 1: Automatic parameter generation",
            "Feature 2: Real-time telemetry"
        ],
        howToUse: [
            "Open any endpoint in Swagger UI.",
            "Click the action button to inspect payload."
        ],
        shortcuts: [
            { key: "Ctrl + Shift + X", desc: "Toggle custom tool window" }
        ],
        configSample: `window.MyPluginConfig = { enabled: true };`
    });
}
```

### Adding a Button to the Activity Bar

```javascript
const bar = document.getElementById("swp-activity-bar-items");
if (bar) {
    const btn = document.createElement("button");
    btn.className = "swp-activity-bar-btn";
    btn.title = "Open Tool (Alt + T)";
    btn.innerHTML = `<svg ...>...</svg>`;
    btn.addEventListener("click", () => toggleMyPanel());
    bar.appendChild(btn);
}
```

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Alt + /` or `?` | Toggle the Extensions Guide modal |
| `Escape` | Close the Extensions Guide modal |

---

## Styling & Customization

The Activity Bar uses CSS custom variables and isolated class names. You can override colors to match your brand:

```css
:root {
    --swp-ab-bg: #1e1e1e;          /* Activity bar background */
    --swp-ab-hover: #2a2d2e;       /* Button hover state */
    --swp-ab-active: #007acc;      /* Active indicator border */
    --swp-ab-text: #cccccc;        /* Icon foreground */
}
```
