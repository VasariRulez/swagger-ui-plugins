# Swagger UI Spotlight Search & Command Palette (`swagger-spotlight-search.js`)

A macOS Spotlight & VS Code-style Command Palette (`Ctrl + K` / `Cmd + K`) for blazing fast endpoint navigation, fuzzy filtering, and instant deep-linking in Swagger UI.

---

## Features

- **Global Command Palette**: Instant modal invoked via `Ctrl + K` (Windows/Linux), `Cmd + K` (macOS), or the `/` key.
- **Fuzzy Search Algorithm**: Matches against HTTP methods (`GET`, `POST`), endpoint paths (`/api/v1/...`), operation IDs, tags/controllers, and summary descriptions.
- **Keyboard Navigation**: Full arrow-key navigation (`↑` / `↓`), `Enter` to select, and `Escape` to close.
- **Smooth Glow Deep-Linking**: Automatically expands collapsed controller sections, scrolls smoothly to the target operation, and highlights it with a temporary pulse animation.
- **Back-to-Top Floating Widget**: Appears automatically when scrolling long documents, allowing instant return to top.

---

## Quick Start

### 1. Standalone HTML

```html
<script src="/plugins/spotlight-search/swagger-spotlight-search.js"></script>
```

### 2. ASP.NET Core (`Program.cs`)

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    c.InjectJavascript("/plugins/spotlight-search/swagger-spotlight-search.js");
});
```

---

## Configuration Reference

You can customize shortcuts, thresholds, and behavior by defining `window.SwaggerSpotlightConfig` before loading the script:

```html
<script>
  window.SwaggerSpotlightConfig = {
    primaryKey: "k",               // Key used with Ctrl or Cmd (default: "k")
    enableSlashShortcut: true,     // Enable '/' key trigger when not typing in an input (default: true)
    maxResults: 30,                // Maximum number of results in the search modal (default: 30)
    highlightDurationMs: 2500,     // Duration of target glow highlight in ms (default: 2500)
    backToTopEnabled: true,        // Enable floating Back to Top button (default: true)
    backToTopThresholdPx: 280      // Scroll distance before Back to Top button appears (default: 280)
  };
</script>
<script src="/plugins/spotlight-search/swagger-spotlight-search.js"></script>
```

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `primaryKey` | `string` | `"k"` | Trigger key used with `Ctrl` or `Cmd` |
| `enableSlashShortcut` | `boolean` | `true` | Allows pressing `/` to open search when no input has focus |
| `maxResults` | `number` | `30` | Maximum number of results returned in search dropdown |
| `highlightDurationMs` | `number` | `2500` | Duration of the glow ring animation after scrolling |
| `backToTopEnabled` | `boolean` | `true` | Enables bottom-right floating Back to Top button |
| `backToTopThresholdPx` | `number` | `280` | Scroll offset threshold to show Back to Top button |

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + K` / `Cmd + K` | Open Spotlight Command Palette |
| `/` (when not typing in an input) | Open Spotlight Command Palette |
| `↑` / `↓` | Navigate search results |
| `Enter` | Select endpoint, jump to it, and expand |
| `Escape` | Dismiss modal |

---

## How It Works

1. Once the OpenAPI document loads, the plugin scans the Swagger DOM and internal schema to index every operation with its path, method, tags, and summary.
2. Typing in the search input performs weighted scoring:
   - Path matches receive top priority.
   - Summaries and tag names match secondary.
3. Upon selecting an item, the plugin dispatches an expand event to the Swagger tag group if closed, uses smooth scrolling (`scrollIntoView({ behavior: 'smooth' })`), and flashes the card with `--swp-spotlight-glow`.
