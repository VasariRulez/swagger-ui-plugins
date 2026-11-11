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

## Styling & Display Options

The viewer styles and thresholds are defined internally in `swagger-pretty-json-view.js`:

- **Adaptive HTTP Color Coding**: Automatically themes the viewer border, badges, and headers based on the endpoint HTTP verb (`GET`: `#61affe`, `POST`: `#49cc90`, `PUT`: `#fca130`, `DELETE`: `#f93e3e`).
- **String Truncation**: Strings exceeding 250 characters are previewed up to 120 characters with a clickable toggle to show the full string without blowing out the layout.
- **Toolbar Actions**:
  - **Espandi tutto**: Expands all child object and array nodes at once.
  - **Comprimi tutto**: Collapses all child levels.
  - **Copia**: Copies formatted, indented JSON to the clipboard.
  - **Scarica**: Triggers a browser download of the response as a `.json` file.
  - **Originale**: Toggles between this interactive tree view and Swagger UI's raw text response block.
