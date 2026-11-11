# Swagger UI Activity Bar & Extensions Guide (`swagger-activity-bar.js`)

A sleek, VS Code-inspired Activity Bar and extensible documentation hub for Swagger UI.

The **Activity Bar** attaches a vertical toolbar to the left edge of Swagger UI, providing a unified container for custom tools, drawers, status indicators, and an interactive **Extensions Guide** modal that documents all registered plugins in real time.

---

## Features

- **VS Code-style Activity Dock**: Docked vertically on the left edge with customizable icon buttons, active indicators, and notification badges.
- **Unified Sidebar / Drawer Manager**: Manages opening, closing, and toggling of flyout drawers from any registered plugin (e.g. Network History, SignalR Tester, JWT Inspector).
- **Interactive Extensions Guide (Help Center)**: Built-in modal dialog documenting every active plugin, keyboard shortcut, configuration snippet, and interactive walkthrough.
- **Dynamic Plugin Self-Registration API (`window.SwaggerActivityBar.registerPluginGuide`)**: Other plugins automatically register their metadata, badges, and documentation cards when loaded.
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

1. Once the DOM and Swagger UI mount, the plugin creates the container `#swagger-activity-bar` fixed to the left edge.
2. The bottom of the bar features a **Guide (Help)** button (puzzle icon 🧩) that opens the comprehensive documentation dialog.
3. Plugins hook into the Activity Bar via the global `window.SwaggerActivityBar` API or by listening for the `swagger-activity-bar:ready` event.

---

## JavaScript API

The plugin exposes `window.SwaggerActivityBar` with the following methods:

### Registering a Plugin in the Extensions Guide

Any plugin can add its documentation card to the Extensions Guide dialog:

```javascript
function registerGuide() {
    if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerPluginGuide === "function") {
        window.SwaggerActivityBar.registerPluginGuide({
            id: "my-custom-plugin",
            name: "My Custom Plugin",
            version: "1.0.0",
            description: "Detailed overview of what this plugin provides.",
            manual: `### Overview
Detailed plugin manual formatted in Markdown.

- Feature 1: Automatic parameter generation
- Feature 2: Real-time telemetry
`,
            shortcuts: [
                "Esc: Close panel or active modal"
            ],
            iconHtml: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`
        });
    }
}

// Register directly or wait for the ready event if loaded beforehand
if (window.SwaggerActivityBar) {
    registerGuide();
} else {
    window.addEventListener("swagger-activity-bar:ready", registerGuide);
}
```

### Adding a Tool Button to the Activity Bar

```javascript
if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerItem === "function") {
    window.SwaggerActivityBar.registerItem({
        id: "my-tool",
        title: "My Custom Tool",
        iconHtml: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">...</svg>`,
        section: "top", // "top" or "bottom"
        order: 10,
        onClick: (event, buttonEl) => {
            toggleMyToolPanel();
        }
    });
}
```

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Escape` | Close the Extensions Guide modal (or return from detail view to main guide list) |

> [!NOTE]
> The Extensions Guide is opened by clicking the puzzle icon (🧩) at the bottom of the Activity Bar.

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
