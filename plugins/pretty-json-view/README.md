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

## Configuration

Customize theme and formatting options via `window.SwaggerPrettyJsonConfig`:

```javascript
window.SwaggerPrettyJsonConfig = {
    // Default indentation spaces (default: 2)
    indent: 2,

    // Initial expansion level (default: 2; 0 collapses all root nodes)
    initialExpandDepth: 2,

    // Max length before collapsing long string values
    truncateStringLength: 500
};
```
