# Swagger UI DTO Presets & Polymorphic Mock Generator (`swagger-dto-presets.js`)

A productivity tool for Swagger UI that manages request body presets, polymorphic payloads (`$type` / discriminator), and developer favorites.

---

## Features

- **Polymorphic DTO Generator**: Handles complex object hierarchies and C# / Java inheritance models where JSON request bodies require `$type` or type discriminators.
- **Custom Developer Presets**: Save, name, and manage custom request body configurations directly inside Swagger UI; saved in `localStorage` scoped per endpoint.
- **Predefined Presets Support**: Easily load standard enterprise mock scenarios (e.g. `Minimal Payload`, `Full Enterprise Payload`, `Edge Case - Null Fields`).
- **1-Click Apply**: Instantly injects selected JSON directly into Swagger's editable request textarea with syntax formatting and change event triggering.
- **Clean Preset Management**: Save custom presets per endpoint in `localStorage` and delete obsolete ones directly from the toolbar.

---

## Quick Start

### 1. Standalone HTML

```html
<script src="/plugins/dto-presets/swagger-dto-presets.js"></script>
```

### 2. ASP.NET Core (`Program.cs`)

```csharp
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    c.InjectJavascript("/plugins/dto-presets/swagger-dto-presets.js");
});
```

---

## How Presets Are Generated

The plugin automatically analyzes your OpenAPI specification (`requestBody` schema) to build presets with zero manual configuration:

### 1. Automatic Schema Mocking
- **Full Schema Mock**: Generates realistic dummy data based on property types, OpenAPI formats (`date-time`, `uuid`, `email`), and default/enum values.
- **Minimal Required**: Filters properties to only include fields marked as `required` in the OpenAPI schema.

### 2. Polymorphic Inheritance & Discriminators
- When a schema contains inheritance hierarchies or type discriminators (e.g. `$type`, `discriminator`, `oneOf`, `anyOf`), the plugin inspects the definitions and provides specialized presets for each concrete subtype with its discriminator pre-injected.

### 3. Custom Developer Presets
- Custom payloads saved by developers are stored in `localStorage` under the key prefix `swp_swagger_preset_{method}_{path}` and remain available across page reloads.

---

## Developer Workflow

1. Expand any endpoint in Swagger UI that accepts a request body.
2. The **DTO Presets** toolbar appears directly above the body textarea.
3. Select an automatic preset (Full, Minimal, or Polymorphic subtype) from the dropdown.
4. Click **Applica** (Apply) to inject the JSON into Swagger's editable textarea, or **Copia** (Copy) to place it on your clipboard.
5. Customize the JSON values in the textarea and click **Salva** (Save) to store it as a permanent custom preset for that endpoint.
6. To remove a previously saved custom preset, select it from the dropdown and click **Elimina** (Delete).
