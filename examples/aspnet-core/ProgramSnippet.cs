// Example ASP.NET Core Program.cs configuration
// Injects Swagger UI Suite plugins directly into Swagger UI pipeline

using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseStaticFiles(); // Serves wwwroot/plugins

    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "API v1");

        // 1. Core Activity Bar & Help Guide
        options.InjectJavascript("/plugins/activity-bar/swagger-activity-bar.js");

        // 2. Navigation & Productivity
        options.InjectJavascript("/plugins/spotlight-search/swagger-spotlight-search.js");
        options.InjectJavascript("/plugins/dto-presets/swagger-dto-presets.js");

        // 3. Response Enhancers
        options.InjectJavascript("/plugins/pretty-json-view/swagger-pretty-json-view.js");
        options.InjectJavascript("/plugins/data-grid-view/swagger-data-grid-view.js");

        // 4. Monitoring & Replay
        options.InjectJavascript("/plugins/network-history/swagger-network-history.js");
        options.InjectJavascript("/plugins/jwt-inspector/swagger-jwt-inspector.js");

        // 5. Auth Token Interceptor (optional)
        // options.InjectJavascript("/plugins/token-interceptor/swagger-token-interceptor.js");

        // 6. SignalR Hub Tester (requires signalr.min.js first)
        options.InjectJavascript("/plugins/signalr-tester/signalr.min.js");
        options.InjectJavascript("/plugins/signalr-tester/swagger-signalr-tester.js");
    });
}

app.Run();
