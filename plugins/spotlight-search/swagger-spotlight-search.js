/**
 * @file swagger-spotlight-search.js
 * @summary Command Palette / Spotlight Search plugin for Swagger UI (OpenAPI / REST).
 *          Allows instant lookup of any API endpoint using Ctrl+K (or Cmd+K on Mac)
 *          or '/', with full keyboard navigation and smooth scrolling.
 *
 * --- ARCHITECTURAL FLOW ---
 * 1. Waits for Swagger UI to load and indexes all registered endpoints from OpenAPI spec
 *    (routes, HTTP verbs, tags/controllers, operation summaries).
 * 2. Injects a search bar next to the Authorize button (or fallback container).
 * 3. Registers global keyboard shortcuts:
 *    - 'Ctrl + K' or 'Cmd + K' (always active)
 *    - '/' (active when not typing inside input fields)
 * 4. On opening the Spotlight modal window:
 *    - Shows an auto-focused search input.
 *    - Performs fast multi-token search (e.g., "post user", "chat", "dev").
 *    - Allows cycling results with Up / Down arrows.
 * 5. On 'Enter' or clicking a search result:
 *    - Closes search modal.
 *    - Expands parent controller/tag group if collapsed.
 *    - Expands endpoint (.opblock) if closed.
 *    - Smoothly scrolls and centers endpoint on screen.
 *    - Triggers temporary animated glow ring.
 * 6. Theme Support (Light / Dark Mode):
 *    - Coordinated with other plugins.
 *    - Reacts in real time to 'dark-mode' class on <html> or <body>.
 *
 * --- CONFIGURATION ---
 * Supports optional `window.SwaggerSpotlightConfig`:
 * {
 *   primaryKey: "k",
 *   enableSlashShortcut: true,
 *   maxResults: 30,
 *   highlightDurationMs: 2500,
 *   backToTopEnabled: true,
 *   backToTopThresholdPx: 280
 * }
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. GENERAL CONFIGURATION (Reads window.SwaggerSpotlightConfig)
    // =========================================================================
    const userConfig = window.SwaggerSpotlightConfig || {};

    const CONFIG = {
        /** Enabled shortcut keys */
        SHORTCUTS: {
            PRIMARY_KEY: typeof userConfig.primaryKey === "string" ? userConfig.primaryKey.toLowerCase() : "k",
            SLASH_TRIGGER: typeof userConfig.enableSlashShortcut === "boolean"
                ? userConfig.enableSlashShortcut
                : (typeof userConfig.slashTrigger === "boolean" ? userConfig.slashTrigger : true)
        },

        /** Maximum number of results returned by search */
        MAX_RESULTS: typeof userConfig.maxResults === "number" ? userConfig.maxResults : 30,

        /** Duration of highlight glow animation upon reaching target endpoint (ms) */
        HIGHLIGHT_DURATION_MS: typeof userConfig.highlightDurationMs === "number" ? userConfig.highlightDurationMs : 2500,

        /** Polling interval for detecting Swagger UI readiness */
        UI_DISCOVERY_INTERVAL_MS: 200,

        /** Discovery timeout */
        UI_DISCOVERY_TIMEOUT_MS: 30000,

        /** DOM ID of Spotlight modal */
        MODAL_ELEMENT_ID: "swagger-spotlight-modal",

        /** Trigger button DOM ID */
        TRIGGER_BTN_ID: "swagger-spotlight-trigger-btn",

        /** Fallback container DOM ID when .scheme-container does not exist */
        FALLBACK_CONTAINER_ID: "swagger-spotlight-fallback-container",

        /** Injected stylesheet element ID */
        STYLE_ELEMENT_ID: "swagger-spotlight-styles",

        /** Back to Top floating button configuration */
        BACK_TO_TOP: {
            ENABLED: typeof userConfig.backToTopEnabled === "boolean" ? userConfig.backToTopEnabled : true,
            SCROLL_THRESHOLD_PX: typeof userConfig.backToTopThresholdPx === "number" ? userConfig.backToTopThresholdPx : 280,
            BUTTON_ID: "swagger-back-to-top-btn"
        }
    };

    /** Standard Swagger color mapping for each HTTP method */
    const METHOD_COLORS = {
        get: { bg: "#61affe", text: "#ffffff" },
        post: { bg: "#49cc90", text: "#ffffff" },
        put: { bg: "#fca130", text: "#ffffff" },
        delete: { bg: "#f93e3e", text: "#ffffff" },
        patch: { bg: "#50e3c2", text: "#ffffff" },
        head: { bg: "#9012fe", text: "#ffffff" },
        options: { bg: "#0d5aa7", text: "#ffffff" },
        trace: { bg: "#9012fe", text: "#ffffff" }
    };

    // =========================================================================
    // 2. RUNTIME IN-MEMORY STATE
    // =========================================================================
    let indexedEndpoints = [];
    let isIndexLoaded = false;
    let selectedResultIndex = 0;
    let currentSearchResults = [];

    // =========================================================================
    // 3. ENDPOINT INDEXING (From OpenAPI Spec & DOM)
    // =========================================================================

    /**
     * Indexed endpoint data structure:
     * @typedef {object} IndexedEndpoint
     * @property {string} method - Lowercase HTTP verb (get, post, etc.)
     * @property {string} path - Route path (e.g. /api/users/{id})
     * @property {string} tag - Controller or category tag
     * @property {string} summary - Operation summary or description
     * @property {string} operationId - OpenAPI operation ID if present
     * @property {string} searchText - Normalized string for multi-token searching
     * @property {string} domId - Expected DOM element ID for the opblock
     */

    /**
     * Extracts OpenAPI specification from Swagger Redux store or selectors.
     * @returns {object|null}
     */
    function getSwaggerSpec() {
        try {
            const ui = window.ui;
            if (!ui) return null;

            // Attempt 1: Via Redux store getter
            const state = ui.getState && ui.getState();
            if (state) {
                const specData = state.get("spec")?.get("json");
                if (specData) {
                    return typeof specData.toJS === "function" ? specData.toJS() : specData;
                }
            }

            // Attempt 2: Via selectors
            if (ui.specSelectors && typeof ui.specSelectors.specJson === "function") {
                const spec = ui.specSelectors.specJson();
                if (spec) {
                    return typeof spec.toJS === "function" ? spec.toJS() : spec;
                }
            }
        } catch (error) {
            console.warn("[Swagger Spotlight] Unable to read specification from Redux:", error);
        }
        return null;
    }

    /**
     * Indexes all available OpenAPI endpoints from specification and fallback DOM.
     */
    function buildEndpointsIndex() {
        const spec = getSwaggerSpec();
        const results = [];

        if (spec && spec.paths) {
            // Indexing from OpenAPI specification
            Object.entries(spec.paths).forEach(([pathName, pathItem]) => {
                const methods = ["get", "post", "put", "delete", "patch", "head", "options", "trace"];

                methods.forEach((method) => {
                    const op = pathItem[method];
                    if (!op) return;

                    const tag = Array.isArray(op.tags) && op.tags.length > 0 ? op.tags[0] : "Default";
                    const summary = op.summary || op.description || "";
                    const operationId = op.operationId || "";

                    // Standard DOM ID used by Swagger UI: operations-{tag}-{operationId or sanitize(path)}
                    const sanitizedTag = tag.replace(/\s+/g, "_");
                    const opIdentifier = operationId || `${method}_${pathName.replace(/[^a-zA-Z0-9]/g, "_")}`;
                    const expectedDomId = `operations-${sanitizedTag}-${opIdentifier}`;

                    const searchText = `${method} ${pathName} ${tag} ${summary} ${operationId}`.toLowerCase();

                    results.push({
                        method: method.toLowerCase(),
                        path: pathName,
                        tag: tag,
                        summary: summary,
                        operationId: operationId,
                        searchText: searchText,
                        domId: expectedDomId
                    });
                });
            });
        }

        // Fallback: scan DOM directly if OpenAPI specification is inaccessible
        if (results.length === 0) {
            document.querySelectorAll(".swagger-ui .opblock").forEach((el) => {
                const methodEl = el.querySelector(".opblock-summary-method");
                const pathEl = el.querySelector(".opblock-summary-path");
                const descEl = el.querySelector(".opblock-summary-description");
                const tagEl = el.closest(".opblock-tag-section")?.querySelector(".opblock-tag");

                const method = methodEl ? methodEl.textContent.trim().toLowerCase() : "get";
                const path = pathEl ? pathEl.textContent.trim() : "";
                const summary = descEl ? descEl.textContent.trim() : "";
                const tag = tagEl ? tagEl.getAttribute("data-tag") || tagEl.textContent.trim() : "API";

                if (path) {
                    results.push({
                        method: method,
                        path: path,
                        tag: tag,
                        summary: summary,
                        operationId: el.id || "",
                        searchText: `${method} ${path} ${tag} ${summary}`.toLowerCase(),
                        domId: el.id || ""
                    });
                }
            });
        }

        indexedEndpoints = results;
        isIndexLoaded = results.length > 0;
        console.info(`[Swagger Spotlight] Successfully indexed ${indexedEndpoints.length} endpoints.`);
    }

    // =========================================================================
    // 4. ENDPOINT SEARCH & FILTERING (Multi-Token Fuzzy Search)
    // =========================================================================

    /**
     * Performs fast multi-token search across all indexed endpoints.
     * @param {string} rawQuery
     * @returns {IndexedEndpoint[]}
     */
    function searchEndpoints(rawQuery) {
        if (!isIndexLoaded || indexedEndpoints.length === 0) {
            buildEndpointsIndex();
        }

        const query = (rawQuery || "").trim().toLowerCase();
        if (!query) {
            // If query is empty, return first N endpoints for exploration
            return indexedEndpoints.slice(0, CONFIG.MAX_RESULTS);
        }

        const tokens = query.split(/\s+/).filter(Boolean);

        const matched = [];
        for (const item of indexedEndpoints) {
            // All tokens entered by user must match
            const allMatched = tokens.every((token) => item.searchText.includes(token));
            if (allMatched) {
                // Calculate relevance score to rank results
                let score = 0;

                // Exact or prefix match on route path
                if (item.path.toLowerCase().startsWith(query)) score += 100;
                else if (item.path.toLowerCase().includes(query)) score += 50;

                // Exact match on HTTP verb
                if (tokens.includes(item.method)) score += 40;

                // Match on controller tag
                if (item.tag.toLowerCase().includes(query)) score += 30;

                matched.push({ item, score });
            }
        }

        // Sort by descending score
        matched.sort((a, b) => b.score - a.score);

        return matched.slice(0, CONFIG.MAX_RESULTS).map((m) => m.item);
    }

    // =========================================================================
    // 5. THEME MANAGEMENT (LIGHT / DARK THEME) & CSS INJECTION
    // =========================================================================

    /**
     * Detects if dark mode is active by checking 'dark-mode' class on <html> or <body>.
     * @returns {boolean}
     */
    function isDarkModeActive() {
        return Boolean(
            document.documentElement.classList.contains("dark-mode") ||
            (document.body && document.body.classList.contains("dark-mode"))
        );
    }

    /**
     * Synchronizes theme class on Spotlight modal if open.
     */
    function applyTheme() {
        const dark = isDarkModeActive();
        const modal = document.getElementById(CONFIG.MODAL_ELEMENT_ID);
        if (modal) {
            modal.classList.toggle("spotlight-modal--dark", dark);
        }
    }

    /**
     * Observes class mutations on <html> and <body> to update theme in real time.
     */
    function observeThemeChanges() {
        const observer = new MutationObserver((mutations) => {
            const classChanged = mutations.some(
                (mutation) =>
                    mutation.type === "attributes" &&
                    mutation.attributeName === "class"
            );

            if (classChanged) {
                applyTheme();
            }
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"]
        });

        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ["class"]
            });
        }

        applyTheme();
    }

    function injectStyles() {
        if (document.getElementById(CONFIG.STYLE_ELEMENT_ID)) return;

        const style = document.createElement("style");
        style.id = CONFIG.STYLE_ELEMENT_ID;
        style.textContent = `
            /* =========================================================================
               SWAGGER SPOTLIGHT SEARCH - STILI GRAFICI ADATTIVI
               ========================================================================= */

            /* --- Scheme container layout (.scheme-container) --- */
            .swagger-ui .scheme-container {
                padding: 15px 0 !important;
            }

            .swagger-ui .scheme-container .schemes {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                flex-wrap: wrap !important;
                gap: 16px !important;
            }

            /* --- Fallback container when Authorize is not present --- */
            #${CONFIG.FALLBACK_CONTAINER_ID} {
                margin: 20px 0 !important;
                padding: 15px 0 !important;
            }

            #${CONFIG.FALLBACK_CONTAINER_ID} .schemes {
                justify-content: flex-start !important;
            }

            /* --- Horizontal Search Bar to the left of Authorize --- */
            #${CONFIG.TRIGGER_BTN_ID} {
                display: inline-flex;
                align-items: center;
                gap: 10px;
                padding: 6px 14px;
                width: 320px;
                max-width: 100%;
                height: 38px;
                box-sizing: border-box;
                border-radius: 4px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                cursor: pointer;
                user-select: none;
                transition: all 0.2s ease;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #0f172a;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            }

            #${CONFIG.TRIGGER_BTN_ID}:hover {
                border-color: #0284c7;
                background: #f8fafc;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
            }

            .spotlight-trigger-label {
                flex: 1;
                text-align: left;
                color: #64748b;
                font-size: 13px;
                font-weight: 500;
            }

            .spotlight-kbd-group {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            .spotlight-kbd-pill {
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                background: #f1f5f9;
                border: 1px solid #cbd5e1;
                color: #475569;
                letter-spacing: 0.3px;
                line-height: 1.2;
            }

            /* --- Search Bar style in Dark Mode --- */
            html.dark-mode #${CONFIG.TRIGGER_BTN_ID},
            body.dark-mode #${CONFIG.TRIGGER_BTN_ID} {
                background: #1e1e1e;
                color: #f5f5f5;
                border-color: #383838;
                box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
            }

            html.dark-mode #${CONFIG.TRIGGER_BTN_ID}:hover,
            body.dark-mode #${CONFIG.TRIGGER_BTN_ID}:hover {
                border-color: #49cc90;
                background: #252525;
            }

            html.dark-mode .spotlight-trigger-label,
            body.dark-mode .spotlight-trigger-label {
                color: #94a3b8;
            }

            html.dark-mode .spotlight-kbd-pill,
            body.dark-mode .spotlight-kbd-pill {
                background: #2a2a2a;
                border-color: #404040;
                color: #cbd5e1;
            }

            /* --- Spotlight Modal Overlay (Default: High-contrast light theme) --- */
            .spotlight-modal-overlay {
                --spot-overlay-bg: rgba(0, 0, 0, 0.55);
                --spot-bg-card: #ffffff;
                --spot-bg-header: #f8fafc;
                --spot-bg-input: #ffffff;
                --spot-bg-item: #ffffff;
                --spot-bg-item-hover: #f1f5f9;
                --spot-bg-item-selected: #e2e8f0;
                --spot-border-card: #94a3b8;
                --spot-border-subtle: #cbd5e1;
                --spot-border-divider: #e2e8f0;
                --spot-text-primary: #0f172a;
                --spot-text-secondary: #334155;
                --spot-text-muted: #64748b;
                --spot-tag-bg: #e2e8f0;
                --spot-tag-color: #334155;
                --spot-footer-bg: #f8fafc;
                --spot-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
                color-scheme: light;

                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: var(--spot-overlay-bg);
                backdrop-filter: blur(4px);
                z-index: 999999;
                display: flex;
                align-items: flex-start;
                justify-content: center;
                padding-top: 10vh;
                animation: spotFadeIn 0.15s ease-out;
            }

            /* --- Spotlight Modal Dark Theme --- */
            html.dark-mode .spotlight-modal-overlay,
            body.dark-mode .spotlight-modal-overlay,
            .spotlight-modal--dark {
                --spot-overlay-bg: rgba(0, 0, 0, 0.78);
                --spot-bg-card: #1e1e1e;
                --spot-bg-header: #141414;
                --spot-bg-input: #1e1e1e;
                --spot-bg-item: #1e1e1e;
                --spot-bg-item-hover: #262626;
                --spot-bg-item-selected: #2e3842;
                --spot-border-card: #383838;
                --spot-border-subtle: #333333;
                --spot-border-divider: #262626;
                --spot-text-primary: #f5f5f5;
                --spot-text-secondary: #e0e0e0;
                --spot-text-muted: #94a3b8;
                --spot-tag-bg: #2a2a2a;
                --spot-tag-color: #cbd5e1;
                --spot-footer-bg: #141414;
                --spot-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75);
                color-scheme: dark;
            }

            @keyframes spotFadeIn {
                from { opacity: 0; transform: scale(0.98); }
                to { opacity: 1; transform: scale(1); }
            }

            .spotlight-card {
                background: var(--spot-bg-card);
                color: var(--spot-text-primary);
                border: 1px solid var(--spot-border-card);
                border-radius: 12px;
                width: 90%;
                max-width: 680px;
                max-height: 75vh;
                display: flex;
                flex-direction: column;
                box-shadow: var(--spot-shadow);
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            /* --- Header with Search Input --- */
            .spotlight-header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px 18px;
                border-bottom: 1px solid var(--spot-border-subtle);
                background: var(--spot-bg-header);
            }

            .spotlight-icon {
                font-size: 18px;
                opacity: 0.8;
                flex-shrink: 0;
            }

            .spotlight-input {
                flex: 1;
                background: transparent;
                border: none;
                outline: none;
                font-size: 16px;
                font-family: inherit;
                color: var(--spot-text-primary);
            }

            .spotlight-input::placeholder {
                color: var(--spot-text-muted);
                opacity: 0.85;
            }

            .spotlight-esc-pill {
                padding: 3px 7px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                border: 1px solid var(--spot-border-subtle);
                color: var(--spot-text-muted);
                cursor: pointer;
            }

            /* --- Results List --- */
            .spotlight-results-list {
                list-style: none;
                margin: 0;
                padding: 8px 0;
                overflow-y: auto;
                max-height: 52vh;
            }

            .spotlight-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 18px;
                cursor: pointer;
                transition: background 0.12s ease;
                border-bottom: 1px solid var(--spot-border-divider);
            }

            .spotlight-item:last-child {
                border-bottom: none;
            }

            .spotlight-item:hover {
                background: var(--spot-bg-item-hover);
            }

            .spotlight-item--selected {
                background: var(--spot-bg-item-selected) !important;
            }

            /* --- HTTP Method Badge --- */
            .spotlight-method-badge {
                font-size: 11px;
                font-weight: 700;
                padding: 3px 8px;
                border-radius: 4px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                min-width: 58px;
                text-align: center;
                flex-shrink: 0;
            }

            .spotlight-endpoint-info {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 3px;
            }

            .spotlight-endpoint-path {
                font-family: Consolas, Monaco, "Courier New", monospace;
                font-size: 13px;
                font-weight: 600;
                color: var(--spot-text-primary);
                word-break: break-all;
            }

            .spotlight-endpoint-summary {
                font-size: 12px;
                color: var(--spot-text-muted);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .spotlight-endpoint-tag {
                font-size: 11px;
                font-weight: 500;
                padding: 2px 7px;
                border-radius: 4px;
                background: var(--spot-tag-bg);
                color: var(--spot-tag-color);
                flex-shrink: 0;
            }

            .spotlight-empty-state {
                padding: 32px 20px;
                text-align: center;
                color: var(--spot-text-muted);
                font-size: 14px;
            }

            /* --- Footer with Keyboard Shortcuts --- */
            .spotlight-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 18px;
                border-top: 1px solid var(--spot-border-subtle);
                background: var(--spot-footer-bg);
                font-size: 12px;
                color: var(--spot-text-muted);
            }

            .spotlight-hints {
                display: flex;
                gap: 14px;
            }

            .spotlight-hint-item kbd {
                padding: 1px 5px;
                border-radius: 3px;
                border: 1px solid var(--spot-border-subtle);
                font-size: 10px;
                font-family: inherit;
            }

            /* --- Flash Glow animation upon arriving at endpoint --- */
            @keyframes swaggerSpotlightTargetGlow {
                0% { box-shadow: 0 0 0 4px #38bdf8, 0 0 20px rgba(56, 189, 248, 0.6); }
                50% { box-shadow: 0 0 0 6px #38bdf8, 0 0 30px rgba(56, 189, 248, 0.8); }
                100% { box-shadow: none; }
            }

            .swagger-spotlight-highlight {
                animation: swaggerSpotlightTargetGlow 1.2s ease-in-out 2 !important;
                border-radius: 4px;
                transition: all 0.3s ease;
            }

            /* --- Floating Back to Top button --- */
            #${CONFIG.BACK_TO_TOP.BUTTON_ID} {
                position: fixed;
                bottom: 24px;
                right: 24px;
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: var(--spot-bg-card, #ffffff);
                color: var(--spot-text-primary, #0f172a);
                border: 1px solid var(--spot-border-card, #94a3b8);
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                cursor: pointer;
                z-index: 99998;
                opacity: 0;
                visibility: hidden;
                transform: translateY(12px);
                transition: opacity 0.25s ease, transform 0.25s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
                user-select: none;
            }

            #${CONFIG.BACK_TO_TOP.BUTTON_ID}.is-visible {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }

            #${CONFIG.BACK_TO_TOP.BUTTON_ID}:hover {
                transform: translateY(-3px);
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
                border-color: #0284c7;
                color: #0284c7;
            }

            #${CONFIG.BACK_TO_TOP.BUTTON_ID}:active {
                transform: translateY(0);
            }

            /* In Dark Theme, back to top button coordinates with Swagger green */
            html.dark-mode #${CONFIG.BACK_TO_TOP.BUTTON_ID},
            body.dark-mode #${CONFIG.BACK_TO_TOP.BUTTON_ID},
            .spotlight-modal--dark #${CONFIG.BACK_TO_TOP.BUTTON_ID} {
                background: #1e1e1e;
                color: #f5f5f5;
                border-color: #383838;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
            }

            html.dark-mode #${CONFIG.BACK_TO_TOP.BUTTON_ID}:hover,
            body.dark-mode #${CONFIG.BACK_TO_TOP.BUTTON_ID}:hover {
                border-color: #49cc90;
                color: #49cc90;
            }
        `;

        document.head.appendChild(style);
    }

    // =========================================================================
    // 6. TARGET ENDPOINT NAVIGATION (Scroll, Expansion, Centering)
    // =========================================================================

    /**
     * Cleans zero-width space characters (\u200B) injected internally by Swagger UI.
     * @param {string} str
     * @returns {string}
     */
    function cleanZeroWidth(str) {
        if (!str || typeof str !== "string") return "";
        return str.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    }

    /**
     * Finds parent controller/tag DOM element in Swagger UI.
     * @param {string} tag
     * @returns {HTMLElement|null}
     */
    function findTagSection(tag) {
        if (!tag) return null;
        const normalizedTargetTag = cleanZeroWidth(tag).toLowerCase();

        // 1. Search by conventional ID assigned by Swagger UI
        const sanitizedId = tag.replace(/\s+/g, "_");
        const byId = document.getElementById(`operations-tag-${tag}`)
                  || document.getElementById(`operations-tag-${sanitizedId}`);
        if (byId) {
            return byId.closest(".opblock-tag-section") || byId;
        }

        // 2. Search by data-tag attribute
        try {
            const byData = document.querySelector(`.swagger-ui [data-tag="${CSS.escape(tag)}"]`);
            if (byData) {
                return byData.closest(".opblock-tag-section") || byData;
            }
        } catch {
            // Ignore CSS.escape syntax exceptions
        }

        // 3. Exhaustive search across all tag sections in DOM
        const sections = document.querySelectorAll(".swagger-ui .opblock-tag-section");
        for (const sec of sections) {
            const tagHeader = sec.querySelector(".opblock-tag");
            if (tagHeader) {
                const rawText = tagHeader.getAttribute("data-tag") || tagHeader.textContent || "";
                const headerText = cleanZeroWidth(rawText).toLowerCase();
                if (headerText === normalizedTargetTag || headerText.startsWith(normalizedTargetTag)) {
                    return sec;
                }
            }
        }
        return null;
    }

    /**
     * Ensures the controller/tag section is open.
     * @param {HTMLElement} tagSection
     * @returns {boolean} True if clicked to open, False if already open
     */
    function ensureTagSectionOpen(tagSection) {
        if (!tagSection) return false;

        // If section does not have 'is-open' class, it is collapsed
        if (!tagSection.classList.contains("is-open")) {
            const toggleElement = tagSection.querySelector(".opblock-tag")
                               || tagSection.querySelector(".opblock-tag button")
                               || tagSection.querySelector(".opblock-tag a");
            if (toggleElement) {
                toggleElement.click();
                return true;
            }
        }
        return false;
    }

    /**
     * Locates the endpoint .opblock element in DOM via ID or method + path scan.
     * @param {IndexedEndpoint} endpoint
     * @returns {HTMLElement|null}
     */
    function findOpblockElement(endpoint) {
        if (endpoint.domId) {
            const el = document.getElementById(endpoint.domId);
            if (el) return el;
        }

        const normalizedTargetMethod = (endpoint.method || "").toLowerCase().trim();
        const normalizedTargetPath = cleanZeroWidth(endpoint.path || "");

        const opblocks = document.querySelectorAll(".swagger-ui .opblock");
        for (const el of opblocks) {
            const methodEl = el.querySelector(".opblock-summary-method");
            const pathEl = el.querySelector(".opblock-summary-path");

            const m = methodEl ? methodEl.textContent.trim().toLowerCase() : "";
            const p = pathEl ? cleanZeroWidth(pathEl.textContent) : "";

            if (m === normalizedTargetMethod && (p === normalizedTargetPath || p.endsWith(normalizedTargetPath))) {
                return el;
            }
        }
        return null;
    }

    /**
     * Ensures endpoint (.opblock) is expanded by clicking .opblock-summary-control.
     * @param {HTMLElement} opblock
     */
    function ensureOpblockOpen(opblock) {
        if (!opblock) return;

        if (!opblock.classList.contains("is-open")) {
            const controlBtn = opblock.querySelector("button.opblock-summary-control")
                            || opblock.querySelector(".opblock-summary button")
                            || opblock.querySelector(".opblock-summary");
            if (controlBtn) {
                controlBtn.click();
            }
        }
    }

    /**
     * Locates endpoint in DOM, ensures parent controller and endpoint are expanded, and scrolls to header.
     * @param {IndexedEndpoint} endpoint
     */
    function navigateToEndpoint(endpoint) {
        closeSpotlightModal();

        // 1. Resolve parent controller and unfold immediately if closed
        const tagSection = findTagSection(endpoint.tag);
        const didOpenTag = tagSection ? ensureTagSectionOpen(tagSection) : false;

        /**
         * Smoothly scrolls and centers the endpoint summary bar, applying glow effect.
         */
        const executeJump = () => {
            const targetElement = findOpblockElement(endpoint);
            if (!targetElement) {
                console.warn(`[Swagger Spotlight] Endpoint not found in DOM: ${endpoint.method} ${endpoint.path}`);
                return;
            }

            // 2. Expand endpoint if collapsed
            ensureOpblockOpen(targetElement);

            // 3. Center endpoint header in viewport (short delay for DOM reflow)
            setTimeout(() => {
                const headerElement = targetElement.querySelector(".opblock-summary") || targetElement;
                headerElement.scrollIntoView({ behavior: "smooth", block: "center" });

                // 4. Visual Glow highlight animation
                targetElement.classList.add("swagger-spotlight-highlight");
                setTimeout(() => {
                    targetElement.classList.remove("swagger-spotlight-highlight");
                }, CONFIG.HIGHLIGHT_DURATION_MS);
            }, 80);
        };

        // If parent controller was opened, Swagger UI mounts opblocks asynchronously; poll briefly
        if (didOpenTag) {
            let attempts = 0;
            const maxAttempts = 25; // 25 * 30ms = 750ms max
            const pollInterval = window.setInterval(() => {
                attempts++;
                const el = findOpblockElement(endpoint);
                if (el || attempts >= maxAttempts) {
                    window.clearInterval(pollInterval);
                    executeJump();
                }
            }, 30);
        } else {
            executeJump();
        }
    }

    // =========================================================================
    // 7. SPOTLIGHT MODAL RENDERING & LIFECYCLE
    // =========================================================================

    /**
     * Opens the Spotlight modal window or focuses search input if already open.
     */
    function openSpotlightModal() {
        // If already open, focus input
        const existingInput = document.querySelector(`#${CONFIG.MODAL_ELEMENT_ID} .spotlight-input`);
        if (existingInput) {
            existingInput.focus();
            existingInput.select();
            return;
        }

        buildEndpointsIndex();

        const overlay = document.createElement("div");
        overlay.id = CONFIG.MODAL_ELEMENT_ID;
        overlay.className = "spotlight-modal-overlay";
        if (isDarkModeActive()) {
            overlay.classList.add("spotlight-modal--dark");
        }

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) closeSpotlightModal();
        });

        const card = document.createElement("div");
        card.className = "spotlight-card";

        card.innerHTML = `
            <div class="spotlight-header">
                <span class="spotlight-icon">🔍</span>
                <input type="text" class="spotlight-input" placeholder="Search endpoints by path, method, tag or summary... (e.g. /users, post, chat, dev)" autocomplete="off" spellcheck="false" />
                <span class="spotlight-esc-pill" id="spotlight-btn-esc" title="Close">ESC</span>
            </div>

            <ul class="spotlight-results-list" id="spotlight-results-container"></ul>

            <div class="spotlight-footer">
                <div class="spotlight-hints">
                    <span class="spotlight-hint-item"><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span>
                    <span class="spotlight-hint-item"><kbd>↵</kbd> Select & Go</span>
                    <span class="spotlight-hint-item"><kbd>ESC</kbd> Close</span>
                </div>
                <div id="spotlight-count-badge">0 endpoints</div>
            </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const input = card.querySelector(".spotlight-input");
        const resultsContainer = card.querySelector("#spotlight-results-container");
        const countBadge = card.querySelector("#spotlight-count-badge");
        const escBtn = card.querySelector("#spotlight-btn-esc");

        escBtn.addEventListener("click", closeSpotlightModal);

        // Update rendered search results
        const renderResults = () => {
            currentSearchResults = searchEndpoints(input.value);
            selectedResultIndex = 0;

            countBadge.textContent = `${currentSearchResults.length} ${currentSearchResults.length === 1 ? 'endpoint' : 'endpoints'}`;

            if (currentSearchResults.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="spotlight-empty-state">
                        No endpoints found for "<strong>${escapeHtml(input.value)}</strong>".
                    </div>
                `;
                return;
            }

            let html = "";
            currentSearchResults.forEach((item, index) => {
                const colorDef = METHOD_COLORS[item.method] || { bg: "#64748b", text: "#ffffff" };
                const isSelected = index === selectedResultIndex;

                html += `
                    <li class="spotlight-item ${isSelected ? "spotlight-item--selected" : ""}" data-index="${index}">
                        <span class="spotlight-method-badge" style="background-color: ${colorDef.bg}; color: ${colorDef.text};">
                            ${escapeHtml(item.method)}
                        </span>
                        <div class="spotlight-endpoint-info">
                            <span class="spotlight-endpoint-path">${escapeHtml(item.path)}</span>
                            ${item.summary ? `<span class="spotlight-endpoint-summary">${escapeHtml(item.summary)}</span>` : ""}
                        </div>
                        <span class="spotlight-endpoint-tag">${escapeHtml(item.tag)}</span>
                    </li>
                `;
            });

            resultsContainer.innerHTML = html;

            // Click su un risultato
            resultsContainer.querySelectorAll(".spotlight-item").forEach((itemEl) => {
                itemEl.addEventListener("click", () => {
                    const idx = Number(itemEl.getAttribute("data-index"));
                    if (currentSearchResults[idx]) {
                        navigateToEndpoint(currentSearchResults[idx]);
                    }
                });
            });
        };

        // Input live search
        input.addEventListener("input", renderResults);

        // Keyboard navigation inside modal (Arrows, Enter, ESC)
        input.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                closeSpotlightModal();
                return;
            }

            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (currentSearchResults.length > 0) {
                    selectedResultIndex = (selectedResultIndex + 1) % currentSearchResults.length;
                    highlightSelectedItem(resultsContainer);
                }
                return;
            }

            if (e.key === "ArrowUp") {
                e.preventDefault();
                if (currentSearchResults.length > 0) {
                    selectedResultIndex = (selectedResultIndex - 1 + currentSearchResults.length) % currentSearchResults.length;
                    highlightSelectedItem(resultsContainer);
                }
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();
                if (currentSearchResults[selectedResultIndex]) {
                    navigateToEndpoint(currentSearchResults[selectedResultIndex]);
                }
            }
        });

        // Initial render
        renderResults();

        // Immediate focus on search input
        setTimeout(() => input.focus(), 30);
    }

    /**
     * Updates visual selection and auto-scrolls selected element into view.
     * @param {HTMLElement} container
     */
    function highlightSelectedItem(container) {
        const items = container.querySelectorAll(".spotlight-item");
        items.forEach((item, idx) => {
            if (idx === selectedResultIndex) {
                item.classList.add("spotlight-item--selected");
                item.scrollIntoView({ block: "nearest" });
            } else {
                item.classList.remove("spotlight-item--selected");
            }
        });
    }

    /**
     * Closes Spotlight modal and removes it from DOM.
     */
    function closeSpotlightModal() {
        const modal = document.getElementById(CONFIG.MODAL_ELEMENT_ID);
        if (modal) modal.remove();
    }

    /**
     * Sanitizes string to prevent HTML injection in template literals.
     * @param {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
        if (!str || typeof str !== "string") return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // =========================================================================
    // 8. GLOBAL SHORTCUT REGISTRATION & NAVBAR TRIGGER BUTTON
    // =========================================================================

    /**
     * Injects horizontal search bar into .scheme-container .schemes aligned left of Authorize.
     * If Authorize is not present, creates fallback container below .information-container.
     */
    function renderTriggerButton() {
        if (document.getElementById(CONFIG.TRIGGER_BTN_ID)) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = CONFIG.TRIGGER_BTN_ID;
        btn.title = "Search endpoints by route, method or summary (Ctrl + K or /)";
        btn.innerHTML = `
            <span style="font-size: 15px; opacity: 0.85;">🔍</span>
            <span class="spotlight-trigger-label">Search endpoints...</span>
            <div class="spotlight-kbd-group">
                <span class="spotlight-kbd-pill">Ctrl K</span>
                <span class="spotlight-kbd-pill">/</span>
            </div>
        `;

        btn.addEventListener("click", openSpotlightModal);

        // Case 1: Swagger UI generated native .scheme-container (Authorize present)
        const nativeSchemesContainer = document.querySelector(`.swagger-ui .scheme-container:not(#${CONFIG.FALLBACK_CONTAINER_ID}) .schemes`);
        if (nativeSchemesContainer) {
            // Remove previous fallback if Swagger UI mounted schemes later
            const oldFallback = document.getElementById(CONFIG.FALLBACK_CONTAINER_ID);
            if (oldFallback) oldFallback.remove();

            const authWrapper = nativeSchemesContainer.querySelector(".auth-wrapper");
            if (authWrapper) {
                nativeSchemesContainer.insertBefore(btn, authWrapper);
            } else {
                nativeSchemesContainer.appendChild(btn);
            }
            return;
        }

        // Case 2: Fallback container when Authorize / .scheme-container is absent
        const infoContainer = document.querySelector(".swagger-ui .information-container");
        if (infoContainer && infoContainer.parentNode) {
            let fallbackContainer = document.getElementById(CONFIG.FALLBACK_CONTAINER_ID);
            if (!fallbackContainer) {
                fallbackContainer = document.createElement("div");
                fallbackContainer.id = CONFIG.FALLBACK_CONTAINER_ID;
                fallbackContainer.className = "scheme-container swagger-spotlight-fallback-container";
                fallbackContainer.innerHTML = `<section class="schemes wrapper"></section>`;
                infoContainer.parentNode.insertBefore(fallbackContainer, infoContainer.nextSibling);
            }

            const fallbackSchemes = fallbackContainer.querySelector(".schemes");
            if (fallbackSchemes && !fallbackSchemes.contains(btn)) {
                fallbackSchemes.appendChild(btn);
            }
        }
    }

    /**
     * Injects and manages floating "Back to Top" button at bottom right.
     */
    function renderBackToTopButton() {
        if (!CONFIG.BACK_TO_TOP.ENABLED) return;
        if (document.getElementById(CONFIG.BACK_TO_TOP.BUTTON_ID)) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = CONFIG.BACK_TO_TOP.BUTTON_ID;
        btn.title = "Torna in cima alla pagina (Home)";
        btn.setAttribute("aria-label", "Torna in cima alla pagina");
        btn.innerHTML = `<span style="display:inline-block; line-height:1; transform: translateY(-1px);">↑</span>`;

        btn.addEventListener("click", () => {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });

        document.body.appendChild(btn);

        // Visibility check via requestAnimationFrame on scroll
        let scrollTicking = false;
        window.addEventListener(
            "scroll",
            () => {
                if (!scrollTicking) {
                    window.requestAnimationFrame(() => {
                        const scrollPos = window.scrollY || document.documentElement.scrollTop || 0;
                        if (scrollPos > CONFIG.BACK_TO_TOP.SCROLL_THRESHOLD_PX) {
                            btn.classList.add("is-visible");
                        } else {
                            btn.classList.remove("is-visible");
                        }
                        scrollTicking = false;
                    });
                    scrollTicking = true;
                }
            },
            { passive: true }
        );
    }

    /**
     * Registers global keyboard listeners (Ctrl+K, Cmd+K, /).
     */
    function registerKeyboardShortcuts() {
        window.addEventListener("keydown", (event) => {
            // Shortcut Ctrl+K or Cmd+K (MetaKey on macOS)
            const isCtrlK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === CONFIG.SHORTCUTS.PRIMARY_KEY;

            if (isCtrlK) {
                event.preventDefault();
                openSpotlightModal();
                return;
            }

            // Shortcut '/' (active only when not typing inside input/textarea/select)
            if (CONFIG.SHORTCUTS.SLASH_TRIGGER && event.key === "/") {
                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
                const isContentEditable = document.activeElement ? document.activeElement.isContentEditable : false;

                if (activeTag !== "input" && activeTag !== "textarea" && activeTag !== "select" && !isContentEditable) {
                    event.preventDefault();
                    openSpotlightModal();
                }
            }
        });
    }

    // =========================================================================
    // 9. PLUGIN INITIALIZATION
    // =========================================================================
    /**
     * Registers Spotlight search button in modular Activity Bar (if present).
     */
    function registerInActivityBar() {
        if (!window.SwaggerActivityBar || typeof window.SwaggerActivityBar.registerItem !== "function") return;
        if (window.SwaggerActivityBar.getItemElement("spotlight-search")) return;

        window.SwaggerActivityBar.registerItem({
            id: "spotlight-search",
            title: "Search endpoints by route, method or summary (Ctrl + K or /)",
            ariaLabel: "Search endpoints",
            iconHtml: `
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
            `,
            onClick: openSpotlightModal,
            section: "top",
            order: 20
        });
    }

    function initialize() {
        registerInActivityBar();
        window.addEventListener("swagger-activity-bar:ready", registerInActivityBar);
        const startTime = Date.now();

        const checkInterval = window.setInterval(() => {
            const nativeSchemes = document.querySelector(`.swagger-ui .scheme-container:not(#${CONFIG.FALLBACK_CONTAINER_ID}) .schemes`);
            const infoContainer = document.querySelector(".swagger-ui .information-container");
            const topbar = document.querySelector(".swagger-ui .topbar .topbar-wrapper");
            const hasSwaggerState = window.ui && typeof window.ui.getState === "function";

            if (nativeSchemes || infoContainer || topbar || hasSwaggerState) {
                injectStyles();
                observeThemeChanges();
                renderTriggerButton();
                renderBackToTopButton();
                registerKeyboardShortcuts();

                // If page has rendered schemes section, info container or endpoints, complete initialization
                if (nativeSchemes || infoContainer || document.querySelector(".swagger-ui .opblock")) {
                    window.clearInterval(checkInterval);
                    setTimeout(buildEndpointsIndex, 600);
                    registerGuideDocumentation();
                    console.info("[Swagger Spotlight] Command Palette plugin initialized successfully.");
                    return;
                }
            }

            if (Date.now() - startTime >= CONFIG.UI_DISCOVERY_TIMEOUT_MS) {
                window.clearInterval(checkInterval);
                setTimeout(buildEndpointsIndex, 600);
                registerGuideDocumentation();
            }
        }, CONFIG.UI_DISCOVERY_INTERVAL_MS);

        window.addEventListener("swagger-activity-bar:ready", registerGuideDocumentation);

        // DOM observer to ensure search bar persistence across Swagger UI re-renders
        const domObserver = new MutationObserver(() => {
            registerInActivityBar();
            if (!document.getElementById(CONFIG.TRIGGER_BTN_ID)) {
                renderTriggerButton();
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
    }

    let isGuideRegistered = false;

    /**
     * Publishes plugin metadata and documentation to the interactive Activity Bar guide.
     */
    function registerGuideDocumentation() {
        if (isGuideRegistered) return;
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerPluginGuide === "function") {
            isGuideRegistered = true;
            window.SwaggerActivityBar.registerPluginGuide({
                id: "spotlight-search",
                name: "Spotlight Search (Ctrl + K)",
                version: "1.0.0",
                description: "Command Palette-style quick search with multi-token fuzzy matching across all endpoints, auto-expanding parent controllers, and visual glow centering.",
                shortcuts: [
                    "Ctrl + K: Open Spotlight quick search",
                    "↑ / ↓: Navigate between results",
                    "Enter: Navigate to and expand endpoint",
                    "Esc: Close search modal"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                `,
                manual: `
### Overview
The Spotlight Command Palette enables you to instantly locate and expand any API endpoint without manually scrolling through hundreds of operations in Swagger UI.

### Keyboard Shortcut
Press \`Ctrl + K\` (or \`Cmd + K\` on macOS) at any time, or click the horizontal search bar in the navbar or the search lens in the Activity Bar.

### Features
- **Fuzzy Search**: Query simultaneously by path (\`/api/...\`), controller tags, summary, and HTTP method (\`GET\`, \`POST\`, etc.).
- **Keyboard Navigation**: Scroll through matches with the \`↑\` and \`↓\` arrow keys and press \`Enter\` to jump directly to the target endpoint.
- **Async Expansion**: Automatically unfolds collapsed controller groups and endpoints before smoothly scrolling with an animated glow ring.
- **Back to Top Button**: A floating button in the bottom-right corner allows returning to the top of the documentation with a single click.
`
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
})();
