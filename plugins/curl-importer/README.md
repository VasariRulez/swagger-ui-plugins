# Swagger UI cURL Importer Plugin (`swagger-curl-importer.js`)

An intelligent, zero-build-step plugin for **Swagger UI** that allows developers and QA testers to paste raw **cURL** commands from browser DevTools, Postman, terminal, or backend logs. It automatically parses the command, finds the matching OpenAPI operation, navigates and expands the endpoint, activates "Try it out", and pre-populates all path, query, header, and body parameters.

---

## 🌟 Key Features

- **Robust cURL Parser**:
  - Supports multi-line commands with trailing backslashes `\` or PowerShell backticks `` ` ``.
  - Recognizes standard flags: `-X / --request`, `-H / --header`, `-d / --data / --data-raw / --data-binary / --data-urlencode`, `-u / --user`, `-b / --cookie`, `-A / --user-agent`, and raw URLs.
  - Correctly strips single/double quotes and escaped tokens.
  - Infers HTTP method (`POST` if body flags are passed without `-X`, otherwise `GET`).
- **OpenAPI Path Template Matching**:
  - Automatically matches parameterized routes (e.g., `/api/v1/orders/1024` -> `/api/v1/orders/{id}`).
  - Resolves server prefixes and basePath from the OpenAPI specification.
  - Extracts path parameters into key-value pairs.
- **Form Auto-Filling & React State Dispatch**:
  - Expands tag accordions and operation blocks (`.opblock`).
  - Activates "Try it out" mode automatically.
  - Fills input fields and request body textareas with native setter dispatching for seamless Swagger UI React state synchronization.
  - Smoothly scrolls to the endpoint with an animated highlight glow ring.
- **Security & Privacy Hardened**:
  - Extracted tokens are strictly ephemeral in-memory: **never saved to `localStorage` or `sessionStorage`**.
  - Synchronizing Authorization with Swagger's global Authorize dialog is **opt-in (disabled by default)**.
  - Visual token masking in the modal preview (`Bearer eyJhbG...xxxx [340 chars]`).
- **Configurable Auto-Execution**:
  - Optional toggle to automatically click "Execute" immediately after pre-filling the form.
- **Activity Bar & Guide Integration**:
  - Registers the 📥 button in `SwaggerActivityBar` with tooltips and badge.
  - Self-registers its complete manual in the Extensions Guide dialog.
- **Light & Dark Theme Sync**:
  - Fully supports light and dark themes synchronized with Swagger UI and suite plugins.
- **Bilingual i18n**:
  - Built-in English and Italian translations with auto-detection.

---

## 📦 Installation

Simply include `swagger-curl-importer.js` in your Swagger UI HTML page after Swagger UI bundles (and optionally after `swagger-activity-bar.js`):

```html
<!-- Swagger UI Bundle & Presets -->
<script src="swagger-ui-bundle.js"></script>
<script src="swagger-ui-standalone-preset.js"></script>

<!-- Activity Bar (Optional, Recommended) -->
<script src="plugins/activity-bar/swagger-activity-bar.js"></script>

<!-- cURL Importer Plugin -->
<script src="plugins/curl-importer/swagger-curl-importer.js"></script>
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Shift + I` (or `Cmd + Shift + I` on macOS) | Open the cURL Importer modal |
| `Ctrl + Enter` (or `Cmd + Enter`) | Submit and import cURL command from modal |
| `Escape` | Close the cURL Importer modal |

---

## ⚙️ Configuration (`window.SwaggerCurlImporterConfig`)

Customize the plugin behavior before loading the script:

```html
<script>
window.SwaggerCurlImporterConfig = {
    // Language: "auto" (default), "it", or "en"
    locale: "auto",

    // Keyboard shortcuts
    shortcuts: {
        openModal: "i",             // Key to trigger
        modifier: "ctrl+shift",     // "ctrl+shift" or "alt"
        submitOnEnter: true         // Ctrl+Enter to submit
    },

    // Behavior Defaults
    defaultAutoExecute: false,      // Checkbox state for immediate execution
    defaultSyncAuth: false,         // Checkbox state for Swagger Authorize sync
    maskTokenInPreview: true,       // Obfuscate tokens in modal preview
    enableHighlightGlow: true,      // Visual glow around target endpoint
    glowDurationMs: 2500,           // Duration of glow animation in ms

    // Activity Bar integration
    activityBar: {
        enabled: true,
        order: 45
    },

    // Topbar Button injection
    topbarButton: {
        enabled: true               // Add button to .topbar if present
    }
};
</script>
<script src="plugins/curl-importer/swagger-curl-importer.js"></script>
```

---

## 💻 Programmatic API

The plugin exposes `window.SwaggerCurlImporter` for external scripts:

```javascript
// Open the import modal programmatically
window.SwaggerCurlImporter.openModal();

// Parse a cURL command into an object
const parsed = window.SwaggerCurlImporter.parseCurl('curl -X GET "https://api.example.com/v1/users/42"');

// Import and fill an operation directly without modal
window.SwaggerCurlImporter.importCommand('curl -X POST "https://api.example.com/v1/orders" -d \'{"id": 1}\'', {
    autoExecute: true,
    syncAuth: false
});
```

---

## 🛡️ Security Note

This plugin does **not** persist any tokens to permanent storage. Authorization sync is opt-in per import and remains strictly in-memory within the active Swagger UI page session.
