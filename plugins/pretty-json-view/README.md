# Swagger UI Pretty JSON Tree Viewer (`swagger-pretty-json-view.js`)

Replaces Swagger UI's flat, unformatted response text with an interactive, syntax-highlighted, collapsible JSON tree viewer with copy and download utilities.

---

## Features

- **Collapsible Tree Nodes**: Deep JSON structures can be selectively collapsed or expanded with clickable toggle carets (`▼` / `▶`).
- **Global Expand / Collapse Controls**: Convenient buttons to expand all or collapse all levels at once.
- **Syntax Highlighting & Color Schemes**:
  - Keys, strings, numbers, booleans, and nulls are cleanly highlighted.
  - Headers and status badges automatically adapt to standard HTTP method color palettes.
- **Clipboard & File Utilities**:
  - **Copy JSON**: Copies clean, formatted JSON to clipboard.
  - **Download JSON**: Saves the response directly as a `.json` file.
- **Original View Toggle**: Seamlessly switch between the Pretty Tree Viewer and Swagger's native raw code block (`View Original` / `Pretty View`).
- **Seamless Coexistence**: Works smoothly alongside `swagger-data-grid-view.js` without DOM collision or layout flickering.

---

## Quick Start

### 1. Standalone HTML

```html
<script src="/plugins/pretty-json-view/swagger-pretty-json-view.js"></script>
```

### 2. ASP.NET Core (`Program.cs`)

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    c.InjectJavascript("/plugins/pretty-json-view/swagger-pretty-json-view.js");
});
```

---

## Configuration Reference

You can configure indentation, expand depth, and string truncation via `window.SwaggerPrettyJsonConfig`:

```html
<script>
  window.SwaggerPrettyJsonConfig = {
    indent: 2,                  // Indentation spaces for formatted JSON copy & export (default: 2)
    initialExpandDepth: 3,      // Initial tree level expanded automatically (default: 2)
    truncateStringLength: 300   // Threshold in characters to truncate long strings with a toggle (default: 250)
  };
</script>
<script src="/plugins/pretty-json-view/swagger-pretty-json-view.js"></script>
```

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `indent` | `number` | `2` | Number of spaces used for indentation when formatting and copying JSON |
| `initialExpandDepth` | `number` | `2` | Automatic depth of expanded JSON objects and arrays on first render |
| `truncateStringLength` | `number` | `250` | Threshold length beyond which long strings are truncated with an expandable toggle |

---

## Styling & Display Options

The viewer styles and thresholds provide:

- **Adaptive HTTP Color Coding**: Automatically themes the viewer border, badges, and headers based on the endpoint HTTP verb (`GET`: `#61affe`, `POST`: `#49cc90`, `PUT`: `#fca130`, `DELETE`: `#f93e3e`).
- **String Truncation**: Strings exceeding `truncateStringLength` characters are previewed with a clickable toggle to show the full string without overflowing the layout.
- **Toolbar Actions**:
  - **Expand all**: Expands all child object and array nodes at once.
  - **Collapse all**: Collapses all child levels.
  - **Copy**: Copies formatted, indented JSON to the clipboard.
  - **Download**: Triggers a browser download of the response as a `.json` file.
  - **Raw / Pretty View**: Toggles between this interactive tree view and Swagger UI's raw text response block.

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
