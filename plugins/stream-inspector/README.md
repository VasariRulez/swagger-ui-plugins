# Swagger UI Stream Inspector Plugin (`swagger-stream-inspector.js`)

A dedicated, real-time client and diagnostics drawer for **Server-Sent Events (`text/event-stream`)**, **NDJSON (Newline-Delimited JSON)**, and **chunked transfer** APIs in **Swagger UI**.

---

## 🌟 Key Features

- **Real-Time Sliding Drawer (Side-by-Side Workflow)**:
  - Slides in from the right edge (`#swp-stream-inspector-drawer`) and dynamically offsets Swagger UI content (`padding-right: 480px`).
  - Zero modal backdrops: leaves the page completely interactive and clickable (invoke REST endpoints, run Try it out, inspect payloads) while observing live streaming events simultaneously.
- **W3C Server-Sent Events & NDJSON Support**:
  - Line-by-line streaming state machine handling `event:`, `data:`, `id:`, `retry:`, and comment/heartbeat lines (`: ping`).
  - Supports multi-line data buffering and empty-line event dispatching.
  - Automatically identifies NDJSON lines and formats JSON records.
- **Fetch ReadableStream Architecture**:
  - Uses `window.fetch` with `ReadableStream` reader and `AbortController`.
  - Works with `GET`, `POST` (with request body), `PUT`, and custom HTTP headers (surpassing browser `EventSource` limitations).
  - Automatically inherits the active Swagger UI Bearer authorization token.
- **Automatic Endpoint Detection & Injected Button**:
  - Automatically detects endpoints declaring streaming content types (`text/event-stream`, `application/x-ndjson`).
  - Injects a **"Stream Live"** button inside the `.opblock` summary.
  - Clicks automatically extract form parameter values, body text, and open the stream drawer.
- **Interactive Connection Bar & Quick Endpoint Selector**:
  - Top connection bar with editable URL input and HTTP method selector (`GET`, `POST` with request body, `PUT`, `DELETE`).
  - Dropdown listing all Swagger endpoints categorized into *"⚡ Detected Streaming"* and *"All Swagger Endpoints"*.
  - Explanatory tooltip `(?)` detailing the exact OpenAPI rule used for automatic listing.
  - Preconfigure fallback streaming paths via `window.SwaggerStreamInspectorConfig.endpoints`.
- **Live Diagnostics & Metrics**:
  - Total events count, total bytes received, stream duration counter (`mm:ss`), throughput frequency (`events/s`), and packet latency delta (`+120ms`).
- **Developer Tools**:
  - Text search and event type filter.
  - Auto-scroll toggle.
  - Single-click payload copy.
  - JSON log export (`.json` download).
  - Reconnect/replay and instant abort.
- **Activity Bar & Guide Integration**:
  - Registers the ⚡ item in `SwaggerActivityBar`.
  - Self-registers its complete manual in the Extensions Guide dialog.
- **Light & Dark Theme Sync**:
  - Sits on dark/light CSS variables with full automatic synchronization.
- **Bilingual i18n**:
  - Built-in English and Italian translations with auto-detection.

---

## 📦 Installation

Add `swagger-stream-inspector.js` to your Swagger UI index page:

```html
<!-- Swagger UI Bundle & Presets -->
<script src="swagger-ui-bundle.js"></script>
<script src="swagger-ui-standalone-preset.js"></script>

<!-- Activity Bar (Optional, Recommended) -->
<script src="plugins/activity-bar/swagger-activity-bar.js"></script>

<!-- Stream Inspector Plugin -->
<script src="plugins/stream-inspector/swagger-stream-inspector.js"></script>
```

---

## ⚙️ Configuration (`window.SwaggerStreamInspectorConfig`)

Customize the stream inspector behavior before loading the script:

```html
<script>
window.SwaggerStreamInspectorConfig = {
    // Language: "auto" (default), "it", or "en"
    locale: "auto",

    // Drawer dimensions and buffer limits
    drawerWidthPx: 480,             // Drawer width in pixels (matches SignalR and Network History)
    maxStoredEvents: 500,           // Maximum event cards kept in memory
    autoScrollDefault: true,        // Auto-scroll to latest event

    // Endpoint Button Injection
    injectButtonInEndpoints: true,  // Automatically add "⚡ Stream Live" to streaming .opblock

    // Content types recognized as streams
    supportedContentTypes: [
        "text/event-stream",
        "application/x-ndjson",
        "application/jsonl",
        "application/stream+json"
    ],

    // Preconfigured or fallback streaming endpoints (useful if not declared in OpenAPI)
    endpoints: [
        "/api/v1/notifications/stream",
        "/events/live"
    ],

    // Security Schemes & Multi-Auth resolution
    preferredScheme: "BearerAuth",  // Explicit priority scheme if multiple schemes are authorized
    appBearerScheme: "Bearer",      // Application Bearer candidate (prioritized over IdP / OAuth2)

    // Activity Bar integration
    activityBar: {
        enabled: true,
        order: 46
    }
};
</script>
<script src="plugins/stream-inspector/swagger-stream-inspector.js"></script>
```

---

## 💻 Programmatic API

The plugin exposes `window.SwaggerStreamInspector` for scripts and test harnesses:

```javascript
// Open the stream drawer
window.SwaggerStreamInspector.openDrawer({
    url: "https://api.example.com/v1/live-feed",
    method: "GET",
    autoStart: true
});

// Programmatic control
window.SwaggerStreamInspector.stopStream();
window.SwaggerStreamInspector.toggleDrawer();
window.SwaggerStreamInspector.closeDrawer();

// Inspect state
const state = window.SwaggerStreamInspector.getState();
console.log(state.status, state.events);
```
