# Swagger UI Activity Bar & Extensions Guide (`swagger-activity-bar.js`)

A sleek, VS Code-inspired Activity Bar and extensible documentation hub for Swagger UI.

The **Activity Bar** attaches a vertical toolbar to the left edge of Swagger UI, providing a unified container for custom tools, drawers, status indicators, and an interactive **Extensions Guide** modal that documents all registered plugins in real time.

---

## Features

- **VS Code-style Activity Dock**: Docked vertically on the left edge with customizable icon buttons, active indicators, and notification badges.
- **Unified Sidebar / Drawer Manager**: Manages opening, closing, and toggling of flyout drawers and tools from registered plugins (e.g. Network History, SignalR Tester, Spotlight Search, JWT Inspector).
- **Interactive Extensions Guide (Help Center)**: Built-in modal dialog documenting every active plugin, keyboard shortcut, configuration snippet, and interactive walkthrough.
- **Runtime Internationalization (i18n) & Language Switcher**: Built-in `🌐 EN | IT` interactive toggle pinned to the bottom of the bar, providing instant runtime translation across all suite plugins with `localStorage` persistence.
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

Any plugin can add its documentation card to the Extensions Guide dialog using `window.SwaggerActivityBar.registerPluginGuide(...)` or the global alias `window.registerPluginGuide(...)`:

```javascript
function registerGuide() {
    const register = window.registerPluginGuide || (window.SwaggerActivityBar && window.SwaggerActivityBar.registerPluginGuide);
    if (typeof register === "function") {
        // Structured / adaptive parameters or standard manual:
        register({
            id: "my-custom-plugin",
            name: "My Custom Plugin",
            version: "1.0.0",
            description: "Detailed overview of what this plugin provides.",
            // Supports either Markdown manual or structured sections:
            features: [
                "Automatic parameter generation",
                "Real-time telemetry and metrics",
                "1-click export to clipboard"
            ],
            howToUse: [
                "Open any endpoint accordion in Swagger UI",
                "Click the tool icon in the Activity Bar to view telemetry"
            ],
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

## Internationalization (i18n) & Runtime Language Switcher

The Activity Bar serves as the internationalization hub for the entire Swagger UI Plugins Suite.

### Features
- **Interactive Language Popover**: Pinned to the bottom section of the Activity Bar (`🌐 EN` / `🌐 IT` / `🌐 AUTO`). Clicking opens a sleek popup menu allowing instant switching between English, Italian, or resetting to configuration defaults.
- **Reset to Config (Auto)**: Clicking `↺ Reset to Config (Auto)` removes the `localStorage` override, allowing the individual plugin configurations (`userConfig.locale`, e.g. `SwaggerSignalRConfig.locale`) and host settings (`window.SwaggerI18nConfig`) to resume full control.
- **LocalStorage Persistence**: Manual language selection is saved to `localStorage.getItem("swp_swagger_i18n_locale")` and survives page refreshes.
- **Dynamic Event Dispatch**: When language changes or is reset, the plugin fires a window event:
  ```javascript
  window.dispatchEvent(new CustomEvent("swagger-i18n:locale-changed", { detail: { locale: "it", isReset: false } }));
  ```
  All suite plugins listen to this event and dynamically re-render their UI.
- **Host Configuration (`window.SwaggerI18nConfig`)**:
  ```javascript
  window.SwaggerI18nConfig = {
      locale: "it", // Initial locale if no localStorage preference is found ("en" | "it")
      autoDetect: true, // If true, detects from <html lang="...">
      messages: {
          en: { /* host overrides */ },
          it: { /* host overrides */ }
      }
  };
  ```

### Localized Plugin Guide Self-Registration
Plugins can provide translations for their Extensions Guide card:
```javascript
window.SwaggerActivityBar.registerPluginGuide({
    id: "my-plugin",
    name: "My Plugin",
    description: "Default English overview",
    i18n: {
        en: {
            name: "My Plugin",
            description: "English description",
            shortcuts: ["Esc: Close panel"],
            manual: "### Overview\\nFull English guide markdown..."
        },
        it: {
            name: "Mio Plugin",
            description: "Descrizione in italiano",
            shortcuts: ["Esc: Chiudi pannello"],
            manual: "### Panoramica\\nGuida completa in italiano..."
        }
    }
});
```

### Global i18n API (`window.SwaggerI18n`)
The Activity Bar exposes `window.SwaggerI18n`:
```javascript
window.SwaggerI18n.getLocale(); // "en" | "it"
window.SwaggerI18n.setLocale("it"); // sets manual override and dispatches event
window.SwaggerI18n.resetLocale(); // removes localStorage override so individual plugin configs take precedence
window.SwaggerI18n.isOverridden(); // true if manual choice is active in localStorage, false if in Auto/Config mode
window.SwaggerI18n.t("myKey", "Default Fallback"); // translates a key
window.SwaggerI18n.getAvailableLocales(); // ["en", "it"]
```

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
