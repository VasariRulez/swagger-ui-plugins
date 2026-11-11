# Swagger UI Data Grid & Tabular View (`swagger-data-grid-view.js`)

Transforms JSON arrays and paginated API responses into interactive, sortable, searchable data tables directly inside Swagger UI response panels.

---

## Features

- **Smart Response Detection**: Automatically identifies tabular data from:
  - Direct JSON arrays: `[ { "id": 1, ... }, { "id": 2, ... } ]`
  - Paginated envelopes: `{ "items": [ ... ], "totalCount": 120 }`
  - Standard REST envelopes: `{ "data": [ ... ] }`, `{ "value": [ ... ] }`, `{ "result": [ ... ] }`
  - Deeply nested structures: `{ "value": { "items": [ ... ], "page": 1 } }`
- **Interactive Data Table**:
  - Multi-column sort (ascending / descending) by clicking headers.
  - Global client-side text search across all columns and nested values.
  - Client-side pagination with selectable page sizes (10, 15, 25, 50).
- **Nested Object Inspector**: Complex nested objects and arrays render as interactive `{...}` chips that open a detail popover on click instead of unreadable `[object Object]`.
- **Export Capabilities**: 1-click **Export to CSV** with automatic header mapping and quote escaping.
- **Non-Destructive View Switcher**: A segmented toggle (`Table` / `JSON`) lets developers seamlessly toggle between the formatted Data Grid and the standard/pretty JSON viewer without losing response state.

---

## Quick Start

### 1. Standalone HTML

```html
<script src="/plugins/data-grid-view/swagger-data-grid-view.js"></script>
```

### 2. ASP.NET Core (`Program.cs`)

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    // Compatible alongside pretty-json-view
    c.InjectJavascript("/plugins/pretty-json-view/swagger-pretty-json-view.js");
    c.InjectJavascript("/plugins/data-grid-view/swagger-data-grid-view.js");
});
```

---

## Envelope Compatibility

The detection engine parses response bodies according to standard backend architectural patterns:

| Pattern / Library | Recognized JSON Shape |
| :--- | :--- |
| **Direct Array** | `[ { "id": 1 }, { "id": 2 } ]` |
| **PagedResult (C# / Java / Go)** | `{ "items": [ ... ], "totalCount": 42, "pageNumber": 1 }` |
| **API Envelope (`data`)** | `{ "success": true, "data": [ ... ] }` |
| **Result / Value Envelope** | `{ "isSuccess": true, "value": { "items": [ ... ] } }` |

---

## Configuration Reference

The data grid behavior is defined via the internal `CONFIG` block in `swagger-data-grid-view.js`:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `DEFAULT_CLIENT_PAGE_SIZE` | `15` | Default number of records displayed per page |
| `PAGE_SIZE_OPTIONS` | `[10, 15, 25, 50]` | Selectable page size choices in the table footer |
| `PAGE_PARAM_NAMES` | `["page", "pageindex", ...]` | Query parameter names checked for server-side pagination |
| `PAGE_SIZE_PARAM_NAMES`| `["pagesize", "limit", ...]` | Query parameter names checked for page size |

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Escape` | Close the nested object / array details popover |
