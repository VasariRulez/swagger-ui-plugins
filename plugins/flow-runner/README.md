# Swagger UI Flow Runner & Chained Scenarios (`swagger-flow-runner.js`)

A multi-step API workflow execution studio embedded directly inside Swagger UI. Run chained sequences of HTTP requests (e.g., `POST /auth/login` ➔ `POST /orders` ➔ `GET /orders/{{orderId}}`), piping variables dynamically across steps with response property extraction and bearer authorization inheritance.

---

## Features

- **Sequential Multi-Step Scenarios**: Define workflows with ordered HTTP steps, custom descriptions, inter-step delays, and optional stop-on-failure mode.
- **Dynamic Variable Piping (`{{varName}}`)**:
  - Interpolate dynamic values in URL paths (`/api/v1/orders/{{orderId}}`), query parameters, headers, and JSON request bodies (`{ "candidateId": "{{candidateId}}" }`).
  - Supports deep paths such as `{{user.id}}` and `{{items[0].guid}}`.
- **Visual Property Extraction Table**:
  - Declaratively extract values from response JSON bodies into named workflow variables.
  - Dot-notation and array index support (e.g., `id`, `data.token`, `results[0].orderId`).
  - **Auto-Discovery Assistant**: 1-click discovery that inspects the last response payload and auto-suggests extraction keys.
- **OpenAPI Operation Auto-Discovery**:
  - Non-invasive spec indexing: click "+ Step" and browse all operations grouped by tags directly from Swagger UI's parsed OpenAPI spec (`ui.getState().get("spec")`).
- **Inherited Bearer Authorization**:
  - Automatically borrows active Bearer tokens from Swagger UI's Redux authorization state (`state.auth.authorized`) with per-step toggle.
- **Host Predefined Scenarios & Local Persistence**:
  - Supply backend scenarios via `window.SwaggerFlowRunnerConfig.scenarios`.
  - Create and edit custom scenarios saved locally in browser `localStorage`.
  - JSON Import / Export for team sharing.
- **Interactive 2-Column Flow Studio**:
  - Left column: Scenario switcher, step sequence reordering, step status badges (`WAITING`, `RUNNING`, `SUCCESS`, `FAILED`, `SKIPPED`), execution metrics, and Live Variable Inspector.
  - Right column: Step request editor, headers/body inputs, extraction rule builder, and live formatted response view.
- **Activity Bar Integration**:
  - Docks seamlessly into the Swagger UI Activity Bar (`order: 35`, icon: 🔗).
  - Fully localized in English (`en`) and Italian (`it`) responding to the global language switcher.

---

## Quick Start

### 1. Standalone HTML

```html
<!-- 1. Activity Bar (Optional, for dock icon) -->
<script src="/plugins/activity-bar/swagger-activity-bar.js"></script>

<!-- 2. Swagger Flow Runner -->
<script src="/plugins/flow-runner/swagger-flow-runner.js"></script>
```

### 2. ASP.NET Core (`Program.cs`)

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    c.InjectJavascript("/plugins/activity-bar/swagger-activity-bar.js");
    c.InjectJavascript("/plugins/flow-runner/swagger-flow-runner.js");
});
```

---

## Configuration Reference

You can configure host predefined scenarios and default execution settings by declaring `window.SwaggerFlowRunnerConfig` prior to loading the script:

```html
<script>
  window.SwaggerFlowRunnerConfig = {
    activityBarOrder: 35, // Sort order in Activity Bar (default: 35)
    defaultDelayMs: 300,  // Inter-step delay in milliseconds (default: 300)
    stopOnError: true,    // Stop execution on first 4xx/5xx error (default: true)
    scenarios: [
      {
        id: "onboarding-flow",
        name: "User Onboarding & Profile Verification",
        description: "Creates an applicant, authenticates, and retrieves applicant profile.",
        steps: [
          {
            id: "step-1",
            name: "1. Create Candidate",
            method: "POST",
            path: "/api/v1/candidates",
            inheritAuth: false,
            body: JSON.stringify({
              fullName: "Mario Rossi",
              email: "mario.rossi@example.com"
            }, null, 2),
            extractions: [
              { jsonPath: "id", varName: "candidateId" }
            ]
          },
          {
            id: "step-2",
            name: "2. Authenticate Candidate",
            method: "POST",
            path: "/api/v1/auth/token",
            inheritAuth: false,
            body: JSON.stringify({
              candidateId: "{{candidateId}}"
            }, null, 2),
            extractions: [
              { jsonPath: "token", varName: "jwtToken" }
            ]
          },
          {
            id: "step-3",
            name: "3. Get Candidate Profile",
            method: "GET",
            path: "/api/v1/candidates/{{candidateId}}",
            inheritAuth: true,
            headers: [
              { key: "Authorization", value: "Bearer {{jwtToken}}" }
            ]
          }
        ]
      }
    ]
  };
</script>
<script src="/plugins/flow-runner/swagger-flow-runner.js"></script>
```

### Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `scenarios` | `Scenario[]` | `[]` | List of host-provided scenarios loaded on startup |
| `appSchemeName` | `string` | `"Bearer"` | Name of the Swagger application security scheme (e.g. Febe) prioritized over IDP/MSAL tokens |
| `msalSchemeName` | `string` | `"MsalAuth"` | Name of the identity provider / MSAL scheme to identify and avoid prioritizing for API requests |
| `preferredScheme` | `string` | `null` | Explicit scheme name to always prefer if multiple security schemes are authorized |
| `activityBarOrder` | `number` | `35` | Order in the Activity Bar vertical dock |
| `defaultDelayMs` | `number` | `300` | Default pause between sequential steps |
| `stopOnError` | `boolean` | `true` | Whether to abort remaining steps if a step returns status >= 400 |

---

## Scenario & Step Schema

```typescript
interface Scenario {
  id: string;
  name: string;
  description?: string;
  isHostPredefined?: boolean;
  steps: Step[];
}

interface Step {
  id: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
  path: string; // e.g. "/api/v1/orders/{{orderId}}"
  headers?: Array<{ key: string; value: string }>;
  body?: string; // Raw JSON or text payload with {{varName}} placeholders
  inheritAuth?: boolean; // Inherit Swagger UI Bearer token
  extractions?: Array<{
    jsonPath: string; // Property path, e.g. "id", "data.user.guid", "items[0].id"
    varName: string;  // Target variable name, e.g. "orderId"
  }>;
}
```

---

## Programmatic API

The plugin exposes `window.SwaggerFlowRunner` for external automation:

```javascript
// Open the Studio modal
window.SwaggerFlowRunner.open();

// Close the Studio modal
window.SwaggerFlowRunner.close();

// Toggle Studio modal visibility
window.SwaggerFlowRunner.toggle();

// Run the currently active scenario sequentially
await window.SwaggerFlowRunner.run();

// Interpolate variables into arbitrary strings
const resolved = window.SwaggerFlowRunner.interpolateVariables(
  "Order {{orderId}} for {{user.name}}",
  { orderId: "12345", user: { name: "Alice" } }
);

// Extract nested values
const val = window.SwaggerFlowRunner.extractValueByPath(
  { data: { items: [{ id: "token-abc" }] } },
  "data.items[0].id"
); // "token-abc"

// Inspect current internal state
const state = window.SwaggerFlowRunner.getState();
console.log(state.variables, state.scenarios);
```
