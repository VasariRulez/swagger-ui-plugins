# Swagger UI DTO Presets & Polymorphic Mock Generator (`swagger-dto-presets.js`)

A productivity tool for Swagger UI that manages request body presets, polymorphic payloads (`$type` / discriminator), and developer favorites.

---

## Features

- **Polymorphic DTO Generator**: Handles complex object hierarchies and C# / Java inheritance models where JSON request bodies require `$type` or type discriminators.
- **Custom Developer Presets**: Save, name, and manage custom request body configurations directly inside Swagger UI; saved in `localStorage` scoped per endpoint.
- **Predefined Presets Support**: Easily load standard enterprise mock scenarios (e.g. `Minimal Payload`, `Full Enterprise Payload`, `Edge Case - Null Fields`).
- **1-Click Apply**: Instantly injects selected JSON directly into Swagger's editable request textarea with syntax formatting and change event triggering.
- **Clean Preset Management**: Delete, duplicate, and export developer presets to share with team members.

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

## Defining Global Presets

You can pre-configure predefined presets for your API endpoints by defining `window.SwaggerPresetsConfig` before loading the script:

```javascript
window.SwaggerPresetsConfig = {
    // Key format: "[METHOD] [PATH]"
    "POST /api/v1/orders": [
        {
            name: "Standard Purchase Order",
            description: "Default order with 2 line items and credit card billing",
            payload: {
                customerId: "cust-001",
                currency: "EUR",
                items: [
                    { sku: "ITEM-A", quantity: 2, price: 19.99 },
                    { sku: "ITEM-B", quantity: 1, price: 49.50 }
                ]
            }
        },
        {
            name: "Polymorphic Express Order ($type)",
            description: "Order using polymorphic VIP customer dispatch",
            payload: {
                $type: "ExpressOrderDto",
                customerId: "cust-vip-99",
                priority: "High",
                expressCourier: "DHL_EXPRESS"
            }
        }
    ],

    "PUT /api/v1/users/{id}": [
        {
            name: "Update Profile Only",
            payload: {
                firstName: "Jane",
                lastName: "Doe",
                status: "Active"
            }
        }
    ]
};
```

---

## Developer Workflow

1. Expand any endpoint that accepts a request body.
2. A new dropdown and preset toolbar appear right above the request body editor.
3. Select any predefined preset to immediately populate the text area.
4. Modify the payload and click **"Save as New Preset..."** to store it permanently in your browser for future testing sessions.
