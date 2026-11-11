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

You can customize the grid pagination and export behavior by declaring `window.SwaggerDataGridConfig`:

```html
<script>
  window.SwaggerDataGridConfig = {
    defaultPageSize: 25,                 // Initial rows per page (default: 15)
    pageSizeOptions: [10, 25, 50, 100],  // Available choices in pagination dropdown (default: [10, 15, 25, 50])
    getCsvFilename: function(path, method) {
      // Custom dynamic CSV export filename
      const cleanPath = path.replace(/[^a-zA-Z0-9]/g, "_");
      return `data_${method.toLowerCase()}_${cleanPath}.csv`;
    }
  };
</script>
<script src="/plugins/data-grid-view/swagger-data-grid-view.js"></script>
```

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `defaultPageSize` | `number` | `15` | Default number of records displayed per page |
| `pageSizeOptions` | `number[]` | `[10, 15, 25, 50]` | Selectable page size choices in the table footer |
| `getCsvFilename` | `function(path, method)` | Auto-generated name | Custom callback returning downloaded CSV filename |

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Escape` | Close the nested object / array details popover |

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
