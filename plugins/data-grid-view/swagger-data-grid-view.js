/**
 * @file swagger-data-grid-view.js
 * @summary Interactive Data Grid & Table View plugin for list endpoints in Swagger UI (OpenAPI / REST).
 *          Automatically detects responses containing list datasets (PagedResult<T>, direct arrays, or generic envelopes)
 *          and injects a view toggle [📄 JSON View] / [📊 Table View].
 *          Provides an interactive grid with column sorting, full-text search, typed cells
 *          (1-click GUID copy, localized dates, boolean pills, nested sub-JSON modal popovers),
 *          customizable CSV export, and live pagination synchronized with Swagger UI.
 *
 * --- CORE FEATURES ---
 * 1. Heuristic Dataset Recognition:
 *    - Detects `Result<PagedResult<T>>` (`json.value.items`), direct arrays (`[...]`), and standard envelopes.
 *    - Completely invisible for non-tabular responses (single objects, primitives, error responses).
 * 2. Non-Invasive Toggle:
 *    - Default view remains formatted JSON.
 *    - Users can switch to Table View on demand.
 * 3. Optimized Horizontal Navigation:
 *    - Smooth horizontal scroll (`overflow-x: auto`) with sticky primary column.
 *    - Contextual column visibility menu to hide/show secondary fields on wide DTOs.
 * 4. Live In-Place Server & Client Pagination.
 * 5. Light & Dark theme support.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. GENERAL CONFIGURATION (Host Injection & Defaults)
    // =========================================================================
    const userConfig = window.SwaggerDataGridConfig || {};

    const CONFIG = {
        /** Default page size for client-side pagination */
        DEFAULT_CLIENT_PAGE_SIZE: typeof userConfig.defaultPageSize === "number" ? userConfig.defaultPageSize : 15,

        /** Available choices for rows per page in client pagination */
        PAGE_SIZE_OPTIONS: Array.isArray(userConfig.pageSizeOptions) ? userConfig.pageSizeOptions : [10, 15, 25, 50],

        /** Optional custom CSV filename generator function: (path, method) => string */
        GET_CSV_FILENAME: typeof userConfig.getCsvFilename === "function" ? userConfig.getCsvFilename : null,

        /** Recognized query parameter names for page number */
        PAGE_PARAM_NAMES: ["page", "pageindex", "pagenumber", "page_number", "page_index"],

        /** Recognized query parameter names for page size */
        PAGE_SIZE_PARAM_NAMES: ["pagesize", "page_size", "perpage", "limit", "take"],

        /** Injected style element ID */
        STYLE_ID: "swagger-data-grid-view-styles",

        /** CSS class prefix */
        CSS_PREFIX: "swagger-grid"
    };

    // =========================================================================
    // 2. STILI CSS ADATTIVI (Light e Dark Mode)
    // =========================================================================
    function injectStyles() {
        if (document.getElementById(CONFIG.STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = CONFIG.STYLE_ID;
        style.textContent = `
            /* =========================================================================
               SWAGGER DATA GRID & TABLE VIEW - STILI GRAFICI ADATTIVI
               ========================================================================= */

            :root {
                --grid-bg: #ffffff;
                --grid-bg-header: #f8fafc;
                --grid-bg-hover: #f1f5f9;
                --grid-bg-zebra: #fafafa;
                --grid-border: #e2e8f0;
                --grid-border-strong: #cbd5e1;
                --grid-text: #0f172a;
                --grid-text-muted: #64748b;
                --grid-primary: #0284c7;
                --grid-primary-hover: #0369a1;
                --grid-primary-light: #e0f2fe;
            }

            html.dark-mode,
            body.dark-mode {
                --grid-bg: #181818;
                --grid-bg-header: #202020;
                --grid-bg-hover: #262626;
                --grid-bg-zebra: #1b1b1b;
                --grid-border: #2d2d2d;
                --grid-border-strong: #383838;
                --grid-text: #f1f5f9;
                --grid-text-muted: #94a3b8;
                --grid-primary: #49cc90;
                --grid-primary-hover: #3cb87e;
                --grid-primary-light: #162a1f;
            }

            /* --- Contenitore Principale e Toggle Bar --- */
            .swagger-grid-container {
                margin: 8px 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 12px;
                color: var(--grid-text);
                width: 100%;
                box-sizing: border-box;
            }

            /* Toggle Toolbar [📄 JSON] / [📊 Table] */
            .swagger-grid-toggle-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 8px;
                padding: 6px 10px;
                background: var(--grid-bg-header);
                border: 1px solid var(--grid-border);
                border-radius: 6px;
                margin-bottom: 8px;
                box-sizing: border-box;
            }

            .swagger-grid-toggle-group {
                display: inline-flex;
                align-items: center;
                background: var(--grid-border);
                padding: 2px;
                border-radius: 6px;
                gap: 2px;
            }

            .swagger-grid-toggle-btn {
                background: transparent;
                border: none;
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                color: var(--grid-text-muted);
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: all 0.15s ease;
            }

            .swagger-grid-toggle-btn:hover {
                color: var(--grid-text);
            }

            .swagger-grid-toggle-btn.is-active {
                background: var(--grid-bg);
                color: var(--grid-primary);
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
            }

            .swagger-grid-badge {
                display: inline-block;
                padding: 1px 6px;
                border-radius: 10px;
                font-size: 10px;
                font-weight: 700;
                background: var(--grid-primary-light);
                color: var(--grid-primary);
            }

            .swagger-grid-meta-tag {
                font-size: 11px;
                color: var(--grid-text-muted);
                font-weight: 500;
            }

            /* --- Wrapper Griglia Tabellare --- */
            .swagger-grid-wrapper {
                background: var(--grid-bg);
                border: 1px solid var(--grid-border);
                border-radius: 6px;
                overflow: hidden;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                position: relative;
            }

            /* --- Toolbar Interna Griglia --- */
            .swagger-grid-toolbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 8px;
                padding: 8px 12px;
                background: var(--grid-bg-header);
                border-bottom: 1px solid var(--grid-border);
                box-sizing: border-box;
            }

            .swagger-grid-search-wrap {
                position: relative;
                display: inline-flex;
                align-items: center;
                flex: 1 1 200px;
                max-width: 320px;
            }

            /* Bug 2 Fix: padding-left forzato per non sovrapporsi all'icona lente */
            .swagger-grid-search-wrap input.swagger-grid-search-input {
                width: 100% !important;
                padding-left: 32px !important;
                padding-right: 28px !important;
                padding-top: 5px !important;
                padding-bottom: 5px !important;
                height: 28px !important;
                line-height: 18px !important;
                border-radius: 5px !important;
                border: 1px solid var(--grid-border-strong) !important;
                background: var(--grid-bg) !important;
                color: var(--grid-text) !important;
                font-size: 11px !important;
                outline: none !important;
                transition: border-color 0.15s ease;
                box-sizing: border-box !important;
            }

            .swagger-grid-search-wrap input.swagger-grid-search-input:focus {
                border-color: var(--grid-primary) !important;
            }

            .swagger-grid-search-wrap .swagger-grid-search-icon {
                position: absolute;
                left: 10px;
                top: 50%;
                transform: translateY(-50%);
                pointer-events: none;
                font-size: 12px;
                opacity: 0.6;
                line-height: 1;
                z-index: 2;
            }

            .swagger-grid-search-clear {
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                cursor: pointer;
                background: none;
                border: none;
                color: var(--grid-text-muted);
                font-size: 12px;
                padding: 0 4px;
                display: none;
                z-index: 2;
            }

            .swagger-grid-search-clear:hover {
                color: var(--grid-text);
            }

            .swagger-grid-tools {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .swagger-grid-btn {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                height: 26px;
                padding: 0 8px;
                border-radius: 4px;
                border: 1px solid var(--grid-border-strong);
                background: var(--grid-bg);
                color: var(--grid-text);
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
                user-select: none;
            }

            .swagger-grid-btn:hover {
                background: var(--grid-bg-hover);
                color: var(--grid-primary);
            }

            /* --- Pannello Menu a Comparsa Colonne --- */
            .swagger-grid-columns-menu {
                position: absolute;
                top: 42px;
                right: 12px;
                background: var(--grid-bg);
                border: 1px solid var(--grid-border-strong);
                border-radius: 6px;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
                padding: 8px;
                z-index: 100;
                max-height: 280px;
                overflow-y: auto;
                min-width: 180px;
                display: none;
                flex-direction: column;
                gap: 4px;
            }

            .swagger-grid-columns-menu.is-open {
                display: flex;
            }

            .swagger-grid-column-item {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 3px 6px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                user-select: none;
            }

            .swagger-grid-column-item:hover {
                background: var(--grid-bg-hover);
            }

            /* --- Data Table (Horizontal Scroll + Sticky Header & Column) --- */
            .swagger-grid-scroll-pane {
                width: 100%;
                overflow-x: auto;
                overflow-y: auto;
                max-height: 520px;
                box-sizing: border-box;
                position: relative;
            }

            /* Bug 1 Fix: border-collapse: separate è essenziale per position:sticky in HTML tables */
            .swagger-grid-table {
                width: 100%;
                border-collapse: separate !important;
                border-spacing: 0 !important;
                text-align: left;
                font-size: 11px;
                white-space: nowrap;
                box-sizing: border-box;
            }

            .swagger-grid-table th {
                background: var(--grid-bg-header);
                color: var(--grid-text-muted);
                font-weight: 700;
                padding: 8px 12px;
                border-bottom: 2px solid var(--grid-border);
                border-right: 1px solid var(--grid-border);
                user-select: none;
                cursor: pointer;
                position: sticky;
                top: 0;
                z-index: 5;
                box-sizing: border-box;
                transition: background 0.15s ease, color 0.15s ease;
            }

            .swagger-grid-table th:hover {
                background: var(--grid-bg-hover);
                color: var(--grid-text);
            }

            .swagger-grid-th-content {
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }

            .swagger-grid-sort-arrow {
                font-size: 9px;
                color: var(--grid-primary);
                opacity: 0.8;
            }

            .swagger-grid-table td {
                padding: 6px 12px;
                border-bottom: 1px solid var(--grid-border);
                border-right: 1px solid var(--grid-border);
                color: var(--grid-text);
                vertical-align: middle;
                max-width: 320px;
                overflow: hidden;
                text-overflow: ellipsis;
                box-sizing: border-box;
            }

            .swagger-grid-table tbody tr:nth-child(even) {
                background: var(--grid-bg-zebra);
            }

            .swagger-grid-table tbody tr:hover {
                background: var(--grid-bg-hover);
            }

            /* Sticky column header - Sticky both horizontally (left: 0) and vertically (top: 0) with z-index 10 */
            .swagger-grid-table th.swagger-grid-th-sticky {
                position: sticky !important;
                top: 0 !important;
                left: 0 !important;
                z-index: 10 !important;
                background: var(--grid-bg-header) !important;
                border-right: 2px solid var(--grid-border-strong) !important;
                border-bottom: 2px solid var(--grid-border) !important;
                box-shadow: 2px 0 5px rgba(0, 0, 0, 0.08);
            }

            /* Sticky body cell - Sticky horizontally (left: 0) with z-index 3 */
            .swagger-grid-table td.swagger-grid-td-sticky {
                position: sticky !important;
                left: 0 !important;
                z-index: 3 !important;
                background: var(--grid-bg) !important;
                border-right: 2px solid var(--grid-border-strong) !important;
                box-shadow: 2px 0 5px rgba(0, 0, 0, 0.08);
            }

            .swagger-grid-table tbody tr:nth-child(even) td.swagger-grid-td-sticky {
                background: var(--grid-bg-zebra) !important;
            }

            .swagger-grid-table tbody tr:hover td.swagger-grid-td-sticky {
                background: var(--grid-bg-hover) !important;
            }

            /* --- Celle Tipizzate (Badge, GUID, Date, Booleani) --- */
            .swagger-grid-cell-guid {
                font-family: Consolas, monospace;
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            .swagger-grid-copy-guid-btn {
                background: none;
                border: none;
                cursor: pointer;
                opacity: 0.5;
                padding: 1px 3px;
                border-radius: 3px;
                font-size: 10px;
                transition: opacity 0.15s ease;
            }

            .swagger-grid-copy-guid-btn:hover {
                opacity: 1;
                background: var(--grid-border);
            }

            .swagger-grid-cell-bool {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 1px 6px;
                border-radius: 10px;
                font-size: 10px;
                font-weight: 700;
            }

            .swagger-grid-cell-bool--true {
                background: rgba(16, 185, 129, 0.15);
                color: #10b981;
            }

            .swagger-grid-cell-bool--false {
                background: rgba(100, 116, 139, 0.15);
                color: #64748b;
            }

            .swagger-grid-cell-nested {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
                background: var(--grid-border);
                color: var(--grid-text);
                border: none;
                cursor: pointer;
                transition: background 0.15s ease;
            }

            .swagger-grid-cell-nested:hover {
                background: var(--grid-primary-light);
                color: var(--grid-primary);
            }

            .swagger-grid-cell-null {
                color: var(--grid-text-muted);
                opacity: 0.6;
            }

            /* --- Footer e Paginazione --- */
            .swagger-grid-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 8px;
                padding: 8px 12px;
                background: var(--grid-bg-header);
                border-top: 1px solid var(--grid-border);
                font-size: 11px;
                box-sizing: border-box;
            }

            .swagger-grid-row-counter {
                color: var(--grid-text-muted);
            }

            .swagger-grid-pagination {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            .swagger-grid-page-btn {
                background: var(--grid-bg);
                border: 1px solid var(--grid-border-strong);
                color: var(--grid-text);
                padding: 3px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
            }

            .swagger-grid-page-btn:hover:not(:disabled) {
                background: var(--grid-bg-hover);
                color: var(--grid-primary);
            }

            .swagger-grid-page-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }

            .swagger-grid-page-info {
                font-size: 11px;
                font-weight: 600;
                color: var(--grid-text-muted);
                margin: 0 4px;
            }

            /* Modal Popover with opaque backdrop in Light and Dark Mode */
            .swagger-grid-popover-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.55) !important;
                backdrop-filter: blur(2px);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
            }

            .swagger-grid-popover-card {
                background: #ffffff !important;
                background: var(--grid-bg, #ffffff) !important;
                color: #0f172a !important;
                color: var(--grid-text, #0f172a) !important;
                border: 1px solid var(--grid-border-strong, #cbd5e1) !important;
                border-radius: 8px;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
                width: 650px;
                max-width: 95vw;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-sizing: border-box;
            }

            .swagger-grid-popover-header {
                padding: 10px 14px;
                background: #f8fafc !important;
                background: var(--grid-bg-header, #f8fafc) !important;
                border-bottom: 1px solid var(--grid-border, #e2e8f0);
                color: var(--grid-text, #0f172a);
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-weight: 700;
                font-size: 12px;
                box-sizing: border-box;
            }

            .swagger-grid-popover-body {
                padding: 14px;
                overflow-y: auto;
                font-family: Consolas, Monaco, "Courier New", monospace;
                font-size: 11px;
                line-height: 1.5;
                background: #ffffff !important;
                background: var(--grid-bg, #ffffff) !important;
                color: #0f172a !important;
                color: var(--grid-text, #0f172a) !important;
                white-space: pre-wrap;
                word-break: break-all;
                box-sizing: border-box;
            }

            /* Popover in Tema Scuro */
            html.dark-mode .swagger-grid-popover-card,
            body.dark-mode .swagger-grid-popover-card {
                background: #181818 !important;
                color: #f1f5f9 !important;
                border-color: #383838 !important;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
            }

            html.dark-mode .swagger-grid-popover-header,
            body.dark-mode .swagger-grid-popover-header {
                background: #202020 !important;
                border-color: #2d2d2d !important;
                color: #f1f5f9 !important;
            }

            html.dark-mode .swagger-grid-popover-body,
            body.dark-mode .swagger-grid-popover-body {
                background: #181818 !important;
                color: #f1f5f9 !important;
            }

            /* Live Pagination Loading Overlay */
            .swagger-grid-loading-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255, 255, 255, 0.7);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                z-index: 50;
                font-size: 12px;
                font-weight: 600;
                color: var(--grid-primary);
            }

            html.dark-mode .swagger-grid-loading-overlay,
            body.dark-mode .swagger-grid-loading-overlay {
                background: rgba(24, 24, 24, 0.75);
            }

            .swagger-grid-spinner {
                width: 24px;
                height: 24px;
                border: 3px solid var(--grid-border);
                border-top-color: var(--grid-primary);
                border-radius: 50%;
                animation: swaggerGridSpin 0.7s linear infinite;
            }

            @keyframes swaggerGridSpin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    // =========================================================================
    // 3. LOGICA DI RILEVAMENTO DATI TABULARI (Agnostica e Flessibile)
    // =========================================================================

    /**
     * Attempts to parse JSON string or returns null if invalid.
     * @param {string} text
     * @returns {any|null}
     */
    function tryParseJson(text) {
        if (!text || typeof text !== "string") return null;
        const trimmed = text.trim();
        if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
        try {
            return JSON.parse(trimmed);
        } catch {
            return null;
        }
    }

    /**
     * Ispeziona l'oggetto JSON per determinare se contiene dati tabulari.
     * Riconosce envelope Result<PagedResult<T>>, array diretti di oggetti o envelope standard.
     * @param {any} json
     * @returns {object|null}
     */
    function detectTabularData(json) {
        if (!json || typeof json !== "object") return null;

        // Se l'oggetto è già un array diretto: [ {...}, {...} ]
        if (Array.isArray(json)) {
            if (json.length === 0 || (typeof json[0] === "object" && json[0] !== null)) {
                return {
                    type: "direct-array",
                    items: json,
                    pagination: {
                        page: 1,
                        pageSize: CONFIG.DEFAULT_CLIENT_PAGE_SIZE,
                        totalCount: json.length,
                        totalPages: Math.max(1, Math.ceil(json.length / CONFIG.DEFAULT_CLIENT_PAGE_SIZE)),
                        isServerPaged: false
                    }
                };
            }
            return null;
        }

        // Estrae l'eventuale payload incapsulato da envelope di risposta (Result<T>, standard REST, API Envelope, ecc.)
        // Supporta le convenzioni `Data`/`data`, `Value`/`value`, `Result`/`result` e payload diretti.
        const candidatePayloads = [
            json.data, json.Data,
            json.value, json.Value,
            json.result, json.Result,
            json
        ];

        for (const payload of candidatePayloads) {
            if (!payload) continue;

            // Caso 1: Se il payload è esso stesso un Array di oggetti: { data: [ {...} ] }
            if (Array.isArray(payload)) {
                if (payload.length === 0 || (typeof payload[0] === "object" && payload[0] !== null)) {
                    return {
                        type: "list-result",
                        items: payload,
                        pagination: {
                            page: 1,
                            pageSize: CONFIG.DEFAULT_CLIENT_PAGE_SIZE,
                            totalCount: payload.length,
                            totalPages: Math.max(1, Math.ceil(payload.length / CONFIG.DEFAULT_CLIENT_PAGE_SIZE)),
                            isServerPaged: false
                        }
                    };
                }
                continue;
            }

            // Caso 2: Se il payload è un oggetto contenente una lista: { data: { items: [...], totalCount: ... } }
            if (typeof payload === "object") {
                const list = payload.items ?? payload.Items ?? payload.data ?? payload.Data ?? payload.results ?? payload.Results;
                if (Array.isArray(list)) {
                    if (list.length === 0 || (typeof list[0] === "object" && list[0] !== null)) {
                        const totalCountVal = payload.totalCount ?? payload.TotalCount ?? payload.total ?? payload.Total ?? payload.count ?? payload.Count;
                        const pageVal = payload.page ?? payload.Page ?? payload.pageIndex ?? payload.PageIndex ?? payload.currentPage ?? payload.CurrentPage;
                        const isServer = Boolean(totalCountVal !== undefined || pageVal !== undefined);

                        const page = Number(pageVal ?? 1);
                        const pageSize = Number(payload.pageSize ?? payload.PageSize ?? payload.perPage ?? payload.PerPage ?? payload.limit ?? payload.Limit ?? (list.length || 20));
                        const totalCount = Number(totalCountVal ?? list.length);
                        const totalPages = Number(payload.totalPages ?? payload.TotalPages ?? Math.max(1, Math.ceil(totalCount / (pageSize || 1))));

                        return {
                            type: isServer ? "swp-paged-result" : "object-list",
                            items: list,
                            pagination: {
                                page: page,
                                pageSize: pageSize,
                                totalCount: totalCount,
                                totalPages: totalPages,
                                isServerPaged: isServer
                            }
                        };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Estrae l'unione di tutte le proprietà presenti in tutti gli oggetti dell'elenco.
     * Mette in prima posizione 'id' o 'key' se presente.
     * @param {Array<object>} items
     * @returns {string[]}
     */
    function extractColumns(items) {
        const keysSet = new Set();
        items.forEach((item) => {
            if (item && typeof item === "object") {
                Object.keys(item).forEach((key) => keysSet.add(key));
            }
        });

        const keys = Array.from(keysSet);
        keys.sort((a, b) => {
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            if (aLower === "id" && bLower !== "id") return -1;
            if (aLower !== "id" && bLower === "id") return 1;
            return 0;
        });

        return keys;
    }

    // =========================================================================
    // 4. FORMATTAZIONE VALORI CELLE
    // =========================================================================

    const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

    /**
     * Formatta il valore di una cella in base al tipo (GUID, data, booleano, oggetto, ecc.).
     * @param {any} value
     * @param {string} columnName
     * @returns {string} Cell HTML markup
     */
    function formatCellHtml(value, columnName) {
        if (value === null || value === undefined) {
            return `<span class="swagger-grid-cell-null">—</span>`;
        }

        // Booleano
        if (typeof value === "boolean") {
            const badgeClass = value ? "swagger-grid-cell-bool--true" : "swagger-grid-cell-bool--false";
            const icon = value ? "✓" : "✕";
            return `<span class="swagger-grid-cell-bool ${badgeClass}"><span>${icon}</span><span>${value}</span></span>`;
        }

        // Numero
        if (typeof value === "number") {
            return `<span>${value}</span>`;
        }

        // Stringa
        if (typeof value === "string") {
            // GUID
            if (GUID_REGEX.test(value)) {
                const shortGuid = value.substring(0, 8) + "…";
                return `
                    <span class="swagger-grid-cell-guid" title="${escapeHtml(value)}">
                        <span>${shortGuid}</span>
                        <button type="button" class="swagger-grid-copy-guid-btn" data-copy="${escapeHtml(value)}" title="Copia GUID completo">📋</button>
                    </span>
                `;
            }

            // Data ISO 8601
            if (ISO_DATE_REGEX.test(value)) {
                try {
                    const date = new Date(value);
                    if (!isNaN(date.getTime())) {
                        const itFormatted = date.toLocaleString("it-IT", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit"
                        });
                        return `<span title="ISO UTC: ${escapeHtml(value)}">${itFormatted}</span>`;
                    }
                } catch {
                    // Fallback a testo normale se fallisce il parsing
                }
            }

            return `<span title="${escapeHtml(value)}">${escapeHtml(value)}</span>`;
        }

        // Array o Oggetto annidato
        if (typeof value === "object") {
            const jsonStr = JSON.stringify(value);
            const label = Array.isArray(value) ? `[${value.length} elementi]` : `{...}`;
            return `
                <button type="button" class="swagger-grid-cell-nested btn-open-nested-popover" data-json="${escapeHtml(jsonStr)}" data-title="${escapeHtml(columnName)}">
                    <span>${label}</span>
                    <span style="font-size:9px; opacity:0.7;">🔍</span>
                </button>
            `;
        }

        return `<span>${escapeHtml(String(value))}</span>`;
    }

    /**
     * Escapes special HTML characters.
     * @param {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // =========================================================================
    // 5. FULL DATA GRID CONSTRUCTION
    // =========================================================================

    /**
     * Builds and manages the interactive Data Grid instance.
     * @param {HTMLElement} mountContainer
     * @param {object} tabularData
     * @param {HTMLElement} opblockElement
     */
    function createDataGrid(mountContainer, tabularData, opblockElement) {
        const rawItems = tabularData.items || [];
        const columns = extractColumns(rawItems);

        // Local table state
        const gridState = {
            allRows: rawItems,
            filteredRows: [...rawItems],
            visibleColumns: new Set(columns),
            sortColumn: columns[0] || null,
            sortDirection: "asc", // "asc" | "desc" | "none"
            searchQuery: "",
            clientPage: 1,
            clientPageSize: CONFIG.DEFAULT_CLIENT_PAGE_SIZE,
            serverPagination: tabularData.pagination || null
        };

        const wrapper = document.createElement("div");
        wrapper.className = "swagger-grid-wrapper";

        // Layout HTML complessivo
        wrapper.innerHTML = `
            <!-- Grid Toolbar (Search, Columns, Export) -->
            <div class="swagger-grid-toolbar">
                <div class="swagger-grid-search-wrap">
                    <span class="swagger-grid-search-icon">🔍</span>
                    <input type="text" class="swagger-grid-search-input" placeholder="Filtra righe in tempo reale..." />
                    <button type="button" class="swagger-grid-search-clear" title="Clear search">✕</button>
                </div>

                <div class="swagger-grid-tools">
                    <button type="button" class="swagger-grid-btn btn-toggle-cols" title="Show or hide columns">
                        <span>👁️ Colonne</span>
                        <span class="cols-count-badge" style="font-size:10px; opacity:0.8;">(${columns.length})</span>
                    </button>
                    <button type="button" class="swagger-grid-btn btn-export-csv" title="Esporta le righe visualizzate in file CSV">
                        <span>📥 CSV</span>
                    </button>
                    <button type="button" class="swagger-grid-btn btn-copy-grid" title="Copy rows as JSON to clipboard">
                        <span>📋 Copia</span>
                    </button>
                </div>

                <!-- Menu a comparsa visibilità colonne -->
                <div class="swagger-grid-columns-menu"></div>
            </div>

            <!-- Scrollable Table Area -->
            <div class="swagger-grid-scroll-pane">
                <table class="swagger-grid-table">
                    <thead></thead>
                    <tbody></tbody>
                </table>
            </div>

            <!-- Footer con Paginazione -->
            <div class="swagger-grid-footer">
                <div class="swagger-grid-row-counter"></div>
                <div class="swagger-grid-pagination"></div>
            </div>
        `;

        mountContainer.appendChild(wrapper);

        // Riferimenti DOM interni
        const searchInput = wrapper.querySelector(".swagger-grid-search-input");
        const searchClearBtn = wrapper.querySelector(".swagger-grid-search-clear");
        const colsBtn = wrapper.querySelector(".btn-toggle-cols");
        const colsMenu = wrapper.querySelector(".swagger-grid-columns-menu");
        const exportCsvBtn = wrapper.querySelector(".btn-export-csv");
        const copyGridBtn = wrapper.querySelector(".btn-copy-grid");
        const thead = wrapper.querySelector("thead");
        const tbody = wrapper.querySelector("tbody");
        const footerCounter = wrapper.querySelector(".swagger-grid-row-counter");
        const footerPagination = wrapper.querySelector(".swagger-grid-pagination");

        // Populate columns dropdown
        function renderColumnsMenu() {
            colsMenu.innerHTML = "";
            columns.forEach((col) => {
                const item = document.createElement("label");
                item.className = "swagger-grid-column-item";
                const isChecked = gridState.visibleColumns.has(col);
                item.innerHTML = `
                    <input type="checkbox" value="${escapeHtml(col)}" ${isChecked ? "checked" : ""} />
                    <span>${escapeHtml(col)}</span>
                `;
                item.querySelector("input")?.addEventListener("change", (e) => {
                    if (e.target.checked) {
                        gridState.visibleColumns.add(col);
                    } else {
                        // Impedisce di deselezionare tutte le colonne
                        if (gridState.visibleColumns.size > 1) {
                            gridState.visibleColumns.delete(col);
                        } else {
                            e.target.checked = true;
                        }
                    }
                    renderHeader();
                    renderBody();
                });
                colsMenu.appendChild(item);
            });
        }

        // Toggle apertura/chiusura menu colonne
        colsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            colsMenu.classList.toggle("is-open");
        });

        document.addEventListener("click", (e) => {
            if (!colsMenu.contains(e.target) && e.target !== colsBtn) {
                colsMenu.classList.remove("is-open");
            }
        });

        // Full-text search
        searchInput.addEventListener("input", () => {
            gridState.searchQuery = searchInput.value.trim().toLowerCase();
            searchClearBtn.style.display = gridState.searchQuery ? "inline-block" : "none";
            gridState.clientPage = 1;
            applyFilterAndSort();
        });

        searchClearBtn.addEventListener("click", () => {
            searchInput.value = "";
            gridState.searchQuery = "";
            searchClearBtn.style.display = "none";
            gridState.clientPage = 1;
            applyFilterAndSort();
        });

        // Applica filtro e ordinamento ai dati in memoria
        function applyFilterAndSort() {
            let res = [...gridState.allRows];

            // 1. Filtro
            if (gridState.searchQuery) {
                const q = gridState.searchQuery;
                res = res.filter((row) => {
                    return Array.from(gridState.visibleColumns).some((col) => {
                        const val = row[col];
                        if (val === null || val === undefined) return false;
                        if (typeof val === "object") return JSON.stringify(val).toLowerCase().includes(q);
                        return String(val).toLowerCase().includes(q);
                    });
                });
            }

            // 2. Ordinamento
            if (gridState.sortColumn && gridState.sortDirection !== "none") {
                const col = gridState.sortColumn;
                const dir = gridState.sortDirection === "asc" ? 1 : -1;
                res.sort((a, b) => {
                    const valA = a[col];
                    const valB = b[col];
                    if (valA === valB) return 0;
                    if (valA === null || valA === undefined) return 1;
                    if (valB === null || valB === undefined) return -1;
                    if (typeof valA === "number" && typeof valB === "number") return (valA - valB) * dir;
                    return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * dir;
                });
            }

            gridState.filteredRows = res;
            renderHeader();
            renderBody();
            renderFooter();
        }

        // Renderizza l'intestazione thead
        function renderHeader() {
            thead.innerHTML = "";
            const tr = document.createElement("tr");

            const visibleList = columns.filter((col) => gridState.visibleColumns.has(col));
            visibleList.forEach((col, index) => {
                const th = document.createElement("th");
                if (index === 0) {
                    th.className = "swagger-grid-th-sticky";
                }

                let arrow = "⇅";
                if (gridState.sortColumn === col) {
                    arrow = gridState.sortDirection === "asc" ? "▲" : (gridState.sortDirection === "desc" ? "▼" : "⇅");
                }

                th.innerHTML = `
                    <div class="swagger-grid-th-content">
                        <span>${escapeHtml(col)}</span>
                        <span class="swagger-grid-sort-arrow">${arrow}</span>
                    </div>
                `;

                th.addEventListener("click", () => {
                    if (gridState.sortColumn === col) {
                        if (gridState.sortDirection === "asc") gridState.sortDirection = "desc";
                        else if (gridState.sortDirection === "desc") gridState.sortDirection = "none";
                        else gridState.sortDirection = "asc";
                    } else {
                        gridState.sortColumn = col;
                        gridState.sortDirection = "asc";
                    }
                    applyFilterAndSort();
                });

                tr.appendChild(th);
            });

            thead.appendChild(tr);
        }

        // Renderizza il corpo tbody
        function renderBody() {
            tbody.innerHTML = "";
            const visibleList = columns.filter((col) => gridState.visibleColumns.has(col));

            // Paginazione per la visualizzazione corrente
            let displayedRows = gridState.filteredRows;
            if (!gridState.serverPagination || !gridState.serverPagination.isServerPaged) {
                const start = (gridState.clientPage - 1) * gridState.clientPageSize;
                displayedRows = gridState.filteredRows.slice(start, start + gridState.clientPageSize);
            }

            if (displayedRows.length === 0) {
                const emptyTr = document.createElement("tr");
                emptyTr.innerHTML = `
                    <td colspan="${visibleList.length}" style="text-align: center; padding: 24px; color: var(--grid-text-muted); font-style: italic;">
                        No items match current search criteria.
                    </td>
                `;
                tbody.appendChild(emptyTr);
                return;
            }

            displayedRows.forEach((row) => {
                const tr = document.createElement("tr");
                visibleList.forEach((col, index) => {
                    const td = document.createElement("td");
                    if (index === 0) {
                        td.className = "swagger-grid-td-sticky";
                    }
                    td.innerHTML = formatCellHtml(row[col], col);
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });

            // Gestione click su pulsanti copia GUID
            tbody.querySelectorAll(".swagger-grid-copy-guid-btn").forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const val = btn.getAttribute("data-copy");
                    if (val) {
                        navigator.clipboard.writeText(val);
                        const oldText = btn.textContent;
                        btn.textContent = "✓";
                        setTimeout(() => (btn.textContent = oldText), 1500);
                    }
                });
            });

            // Gestione click su sotto-JSON annidati
            tbody.querySelectorAll(".btn-open-nested-popover").forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const rawJson = btn.getAttribute("data-json");
                    const title = btn.getAttribute("data-title") || "Dettaglio Oggetto Annidato";
                    showNestedPopover(title, rawJson);
                });
            });
        }

        // Renderizza il footer e i controlli di paginazione
        function renderFooter() {
            const isServer = Boolean(gridState.serverPagination && gridState.serverPagination.isServerPaged);

            if (isServer) {
                const { page, totalPages, totalCount } = gridState.serverPagination;
                footerCounter.innerHTML = `<span>Totale record: <strong>${totalCount}</strong></span>`;

                footerPagination.innerHTML = `
                    <button type="button" class="swagger-grid-page-btn btn-page-first" ${page <= 1 ? "disabled" : ""} title="Prima Pagina">⏮</button>
                    <button type="button" class="swagger-grid-page-btn btn-page-prev" ${page <= 1 ? "disabled" : ""} title="Pagina Precedente">◀</button>
                    <span class="swagger-grid-page-info">Pagina ${page} di ${totalPages}</span>
                    <button type="button" class="swagger-grid-page-btn btn-page-next" ${page >= totalPages ? "disabled" : ""} title="Pagina Successiva">▶</button>
                    <button type="button" class="swagger-grid-page-btn btn-page-last" ${page >= totalPages ? "disabled" : ""} title="Ultima Pagina">⏭</button>
                `;

                footerPagination.querySelector(".btn-page-first")?.addEventListener("click", () => triggerServerPageChange(opblockElement, wrapper, 1));
                footerPagination.querySelector(".btn-page-prev")?.addEventListener("click", () => triggerServerPageChange(opblockElement, wrapper, page - 1));
                footerPagination.querySelector(".btn-page-next")?.addEventListener("click", () => triggerServerPageChange(opblockElement, wrapper, page + 1));
                footerPagination.querySelector(".btn-page-last")?.addEventListener("click", () => triggerServerPageChange(opblockElement, wrapper, totalPages));
            } else {
                // Paginazione client-side
                const total = gridState.filteredRows.length;
                const totalPages = Math.max(1, Math.ceil(total / gridState.clientPageSize));
                const start = total === 0 ? 0 : (gridState.clientPage - 1) * gridState.clientPageSize + 1;
                const end = Math.min(total, gridState.clientPage * gridState.clientPageSize);

                footerCounter.innerHTML = `<span>Mostrati <strong>${start}-${end}</strong> di <strong>${total}</strong> record</span>`;

                let sizeOptionsHtml = "";
                CONFIG.PAGE_SIZE_OPTIONS.forEach((size) => {
                    sizeOptionsHtml += `<option value="${size}" ${gridState.clientPageSize === size ? "selected" : ""}>${size} / pag</option>`;
                });

                footerPagination.innerHTML = `
                    <select class="swagger-grid-select-pagesize" style="font-size:11px; padding:2px 4px; border-radius:4px; border:1px solid var(--grid-border-strong); background:var(--grid-bg); color:var(--grid-text); margin-right:6px;">
                        ${sizeOptionsHtml}
                    </select>
                    <button type="button" class="swagger-grid-page-btn btn-client-prev" ${gridState.clientPage <= 1 ? "disabled" : ""}>◀</button>
                    <span class="swagger-grid-page-info">${gridState.clientPage} / ${totalPages}</span>
                    <button type="button" class="swagger-grid-page-btn btn-client-next" ${gridState.clientPage >= totalPages ? "disabled" : ""}>▶</button>
                `;

                footerPagination.querySelector(".btn-client-prev")?.addEventListener("click", () => {
                    if (gridState.clientPage > 1) {
                        gridState.clientPage--;
                        renderBody();
                        renderFooter();
                    }
                });

                footerPagination.querySelector(".btn-client-next")?.addEventListener("click", () => {
                    if (gridState.clientPage < totalPages) {
                        gridState.clientPage++;
                        renderBody();
                        renderFooter();
                    }
                });

                footerPagination.querySelector(".swagger-grid-select-pagesize")?.addEventListener("change", (e) => {
                    gridState.clientPageSize = Number(e.target.value);
                    gridState.clientPage = 1;
                    renderBody();
                    renderFooter();
                });
            }
        }

        // Esportazione in file CSV
        exportCsvBtn.addEventListener("click", () => {
            const visibleList = columns.filter((col) => gridState.visibleColumns.has(col));
            const rows = gridState.filteredRows;
            const opPath = opblockElement?.querySelector(".opblock-summary-path")?.getAttribute("data-path") ||
                           opblockElement?.querySelector(".opblock-summary-path")?.textContent?.trim() || "";
            const opMethod = opblockElement?.querySelector(".opblock-summary-method")?.textContent?.trim() || "";
            downloadCsv(visibleList, rows, { path: opPath, method: opMethod });
        });

        // Copy filtered JSON to clipboard
        copyGridBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(JSON.stringify(gridState.filteredRows, null, 2)).then(() => {
                const oldText = copyGridBtn.innerHTML;
                copyGridBtn.innerHTML = `<span>✓ Copiato!</span>`;
                setTimeout(() => (copyGridBtn.innerHTML = oldText), 1500);
            });
        });

        // Initial view setup
        renderColumnsMenu();
        applyFilterAndSort();
    }

    // =========================================================================
    // 6. POPUP SOTTO-JSON PER OGGETTI ANNIDATI
    // =========================================================================

    function showNestedPopover(title, rawJson) {
        let formatted = rawJson;
        try {
            formatted = JSON.stringify(JSON.parse(rawJson), null, 2);
        } catch {
            // Usa testo grezzo
        }

        const overlay = document.createElement("div");
        overlay.className = "swagger-grid-popover-overlay swagger-grid-container";
        overlay.innerHTML = `
            <div class="swagger-grid-popover-card">
                <div class="swagger-grid-popover-header">
                    <span>${escapeHtml(title)}</span>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="swagger-grid-btn btn-copy-nested">📋 Copia</button>
                        <button type="button" class="swagger-grid-btn btn-close-nested">✕</button>
                    </div>
                </div>
                <div class="swagger-grid-popover-body">${escapeHtml(formatted)}</div>
            </div>
        `;

        const closePopover = () => overlay.remove();

        overlay.querySelector(".btn-close-nested")?.addEventListener("click", closePopover);
        overlay.querySelector(".btn-copy-nested")?.addEventListener("click", () => {
            navigator.clipboard.writeText(formatted);
            alert("Sub-JSON copied to clipboard!");
        });

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closePopover();
        });

        const keyHandler = (e) => {
            if (e.key === "Escape") {
                closePopover();
                window.removeEventListener("keydown", keyHandler);
            }
        };
        window.addEventListener("keydown", keyHandler);

        document.body.appendChild(overlay);
    }

    // =========================================================================
    // 7. GENERATORE ED ESPORTATORE CSV
    // =========================================================================

    function downloadCsv(columns, rows, context) {
        const lines = [];

        // CSV Header
        lines.push(columns.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));

        // CSV Rows
        rows.forEach((row) => {
            const line = columns.map((col) => {
                const val = row[col];
                if (val === null || val === undefined) return '""';
                if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            lines.push(line.join(";"));
        });

        // UTF-8 BOM prefix for Excel compatibility
        const csvContent = "\uFEFF" + lines.join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        let fileName = `swagger_export_${Date.now()}.csv`;
        if (CONFIG.GET_CSV_FILENAME && context) {
            try {
                const custom = CONFIG.GET_CSV_FILENAME(context.path, context.method);
                if (custom && typeof custom === "string") {
                    fileName = custom.endsWith(".csv") ? custom : `${custom}.csv`;
                }
            } catch (e) {
                console.warn("[DataGrid] Error in custom getCsvFilename:", e);
            }
        }

        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // =========================================================================
    // 8. PAGINAZIONE LIVE (Aggiornamento Input Swagger + Trigger Execute)
    // =========================================================================

    /**
     * Aggiorna in modo compatibile con React il valore di un campo input DOM.
     * @param {HTMLInputElement} element
     * @param {string|number} value
     */
    function setReactInputValue(element, value) {
        const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
        const prototype = Object.getPrototypeOf(element);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
            valueSetter.call(element, value);
        } else {
            element.value = value;
        }

        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    /**
     * Performs server-side page transition by updating Swagger parameter and clicking Execute.
     * @param {HTMLElement} opblock
     * @param {HTMLElement} gridWrapper
     * @param {number} targetPage
     */
    function triggerServerPageChange(opblock, gridWrapper, targetPage) {
        if (!opblock || targetPage < 1) return;

        // Show semi-transparent loading overlay on table
        const loading = document.createElement("div");
        loading.className = "swagger-grid-loading-overlay";
        loading.innerHTML = `
            <div class="swagger-grid-spinner"></div>
            <span>Loading Page ${targetPage}...</span>
        `;
        gridWrapper.appendChild(loading);

        // 1. Look for 'Page' or 'pageIndex' query/path parameter
        const inputs = opblock.querySelectorAll(".parameters input, .opblock-body input");
        let pageInput = null;

        for (const input of inputs) {
            const name = (input.name || input.placeholder || input.getAttribute("data-param-name") || "").toLowerCase();
            if (CONFIG.PAGE_PARAM_NAMES.includes(name)) {
                pageInput = input;
                break;
            }
        }

        if (pageInput) {
            setReactInputValue(pageInput, targetPage);
        }

        // 2. For POST search endpoints with request bodies: update JSON pagination properties
        const bodyTextarea = opblock.querySelector(".body-param__text, .body-param textarea, textarea.body-param");
        if (bodyTextarea && bodyTextarea.value) {
            try {
                const bodyJson = JSON.parse(bodyTextarea.value);
                let updated = false;

                // Pattern A: { pagination: { page: 1, pageSize: 10 } } (Pattern Standard)
                if (bodyJson.pagination && typeof bodyJson.pagination === "object" && bodyJson.pagination.page !== undefined) {
                    bodyJson.pagination.page = targetPage;
                    updated = true;
                } else if (bodyJson.Pagination && typeof bodyJson.Pagination === "object" && bodyJson.Pagination.Page !== undefined) {
                    bodyJson.Pagination.Page = targetPage;
                    updated = true;
                } else if (bodyJson.page !== undefined) {
                    bodyJson.page = targetPage;
                    updated = true;
                } else if (bodyJson.Page !== undefined) {
                    bodyJson.Page = targetPage;
                    updated = true;
                } else if (bodyJson.pageIndex !== undefined) {
                    bodyJson.pageIndex = targetPage;
                    updated = true;
                } else if (bodyJson.PageIndex !== undefined) {
                    bodyJson.PageIndex = targetPage;
                    updated = true;
                }

                if (updated) {
                    setReactInputValue(bodyTextarea, JSON.stringify(bodyJson, null, 2));
                }
            } catch {
                // Body non formattato in JSON
            }
        }

        // Flag to keep table view active on next response render
        opblock._keepTableViewActive = true;

        // Programmatically click Swagger UI Execute button
        setTimeout(() => {
            const executeBtn = opblock.querySelector(".btn.execute");
            if (executeBtn) {
                executeBtn.click();
            } else {
                loading.remove();
            }
        }, 80);
    }

    // =========================================================================
    // 9. TOGGLE MOUNTING & SWAGGER RESPONSE INTEGRATION
    // =========================================================================

    /**
     * Verifica tassativamente che l'elemento appartenga a una RISPOSTA REALE del server
     * (and NOT the example documentation or OpenAPI schema).
     * @param {HTMLElement} responseCol
     * @returns {boolean}
     */
    function isLiveServerResponse(responseCol) {
        if (!responseCol) return false;

        // 1. Esclusione immediata: se l'elemento appartiene a un tab/schema di documentazione
        if (
            responseCol.closest(".model-example") ||
            responseCol.querySelector(".model-example") ||
            responseCol.closest(".tabitem") ||
            responseCol.querySelector(".tabitem")
        ) {
            return false;
        }

        // 2. Verify "Response body" header (present only in executed live responses)
        const headers = Array.from(responseCol.querySelectorAll("h5"));
        const hasResponseBodyHeader = headers.some(h => h.textContent.trim().toLowerCase().includes("response body"));
        if (hasResponseBodyHeader) {
            return true;
        }

        // 3. Verifica contenitore "Server response"
        const responsesInner = responseCol.closest(".responses-inner");
        if (responsesInner) {
            const h4 = responsesInner.querySelector("h4");
            if (h4 && h4.textContent.toLowerCase().includes("server response")) {
                return true;
            }
        }

        // 4. If opblock has already executed a request (.request-url present)
        const opblock = responseCol.closest(".opblock");
        if (opblock && opblock.querySelector(".request-url")) {
            const inners = Array.from(opblock.querySelectorAll(".responses-inner"));
            if (inners.length > 1 && inners[0].contains(responseCol)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Estrae in modo affidabile il payload JSON grezzo dalla risposta live,
     * compatibile sia con swagger-pretty-json-view che con Swagger nativo.
     * @param {HTMLElement} responseCol
     * @returns {{ parsed: any, rawText: string }|null}
     */
    function extractLiveResponseJson(responseCol) {
        // Tentativo 1: Dalle proprietà interne memorizzate da swagger-pretty-json-view.js
        const customViewer = responseCol.querySelector(".custom-json-view");
        if (customViewer) {
            const jsonText = customViewer._jsonText || customViewer.dataset?.json;
            if (jsonText) {
                const parsed = tryParseJson(jsonText);
                if (parsed) return { parsed, rawText: jsonText };
            }
        }

        // Tentativo 2: Dal tag pre/code originale di Swagger UI (.highlight-code pre o pre.microlight)
        const candidates = responseCol.querySelectorAll(".highlight-code pre, pre.microlight, .response-col_description__inner pre, pre");
        for (const el of candidates) {
            // Ignoriamo categoricamente pre o div interni all'albero di custom-json-view o a swagger-grid
            if (el.closest(".swagger-grid-container") || el.closest(".custom-json-view")) {
                continue;
            }
            const text = el.textContent;
            const parsed = tryParseJson(text);
            if (parsed) {
                return { parsed, rawText: text };
            }
        }

        return null;
    }

    /**
     * Ispeziona un contenitore di risposta Swagger e inietta il toggle e il Data Grid.
     * @param {HTMLElement} responseCol
     */
    function processResponseElement(responseCol) {
        if (!responseCol) return;

        // Safety filter: activate Data Grid ONLY on real server responses
        if (!isLiveServerResponse(responseCol)) {
            const rogueContainer = responseCol.querySelector(".swagger-grid-container");
            if (rogueContainer) {
                rogueContainer.remove();
            }
            return;
        }

        // Find parent opblock
        const opblock = responseCol.closest(".opblock");

        // Extract real response JSON
        const extracted = extractLiveResponseJson(responseCol);
        if (!extracted || !extracted.parsed) return;

        const { parsed: json, rawText } = extracted;

        // Rileva se il JSON contiene dati tabulari
        const tabularData = detectTabularData(json);
        if (!tabularData) {
            // Se non sono dati tabulari, rimuovi eventuale grid preesistente
            const existingGrid = responseCol.querySelector(".swagger-grid-container");
            if (existingGrid) existingGrid.remove();
            return;
        }

        // Se già processato con lo stesso identico payload JSON, sincronizza solo la visibilità
        let gridContainer = responseCol.querySelector(".swagger-grid-container");
        if (gridContainer && responseCol._lastProcessedRawJson === rawText) {
            syncVisibility(responseCol, gridContainer);
            return;
        }

        // Se il payload è cambiato o non esiste ancora, rimuovi vecchio container
        if (gridContainer) {
            gridContainer.remove();
            gridContainer = null;
        }

        // Memorizza l'ultimo payload processato
        responseCol._lastProcessedRawJson = rawText;

        // Host container for table and toggle toolbar
        gridContainer = document.createElement("div");
        gridContainer.className = "swagger-grid-container";

        const itemsCount = tabularData.items.length;
        const metaText = tabularData.pagination?.isServerPaged
            ? `Paginato: Pagina ${tabularData.pagination.page} di ${tabularData.pagination.totalPages} (${tabularData.pagination.totalCount} totali)`
            : `Elenco di ${itemsCount} record`;

        gridContainer.innerHTML = `
            <div class="swagger-grid-toggle-bar">
                <div class="swagger-grid-toggle-group">
                    <button type="button" class="swagger-grid-toggle-btn btn-view-json is-active" title="View original JSON format">
                        <span>📄 JSON View</span>
                    </button>
                    <button type="button" class="swagger-grid-toggle-btn btn-view-table" title="Display interactive table grid">
                        <span>📊 Table View</span>
                        <span class="swagger-grid-badge">${itemsCount}</span>
                    </button>
                </div>
                <div class="swagger-grid-toggle-meta">
                    <span class="swagger-grid-meta-tag">${metaText}</span>
                </div>
            </div>
            <div class="swagger-grid-content-mount"></div>
        `;

        // Find anchor element to insert toolbar and table before
        const anchor = responseCol.querySelector(".custom-json-view, .response-controls, .highlight-code");
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(gridContainer, anchor);
        } else {
            responseCol.appendChild(gridContainer);
        }

        const mountPoint = gridContainer.querySelector(".swagger-grid-content-mount");
        createDataGrid(mountPoint, tabularData, opblock);

        const btnViewJson = gridContainer.querySelector(".btn-view-json");
        const btnViewTable = gridContainer.querySelector(".btn-view-table");

        function setView(isTable) {
            gridContainer.dataset.activeView = isTable ? "table" : "json";
            btnViewTable.classList.toggle("is-active", isTable);
            btnViewJson.classList.toggle("is-active", !isTable);
            syncVisibility(responseCol, gridContainer);
        }

        btnViewJson.addEventListener("click", () => setView(false));
        btnViewTable.addEventListener("click", () => setView(true));

        // If opblock has flag to keep table view active (e.g. from page change)
        if (opblock && opblock._keepTableViewActive) {
            setView(true);
            opblock._keepTableViewActive = false;
        } else {
            setView(false);
        }
    }

    /**
     * Synchronizes visibility of original/custom JSON elements vs active view.
     * @param {HTMLElement} responseCol
     * @param {HTMLElement} gridContainer
     */
    function syncVisibility(responseCol, gridContainer) {
        if (!responseCol || !gridContainer) return;

        const isTable = gridContainer.dataset.activeView === "table";
        const gridWrapper = gridContainer.querySelector(".swagger-grid-wrapper");
        const customView = responseCol.querySelector(".custom-json-view");
        // Specifically select native Swagger block, excluding clones in customView
        const highlightCode = Array.from(responseCol.querySelectorAll(".highlight-code"))
            .find(el => !el.closest(".custom-json-view") && !el.closest(".swagger-grid-container"));
        const responseControls = responseCol.querySelector(".response-controls");

        if (gridWrapper) {
            gridWrapper.style.display = isTable ? "flex" : "none";
        }

        if (isTable) {
            // In Table View, hide both pretty JSON viewer and Swagger native pre
            if (customView) customView.style.display = "none";
            if (highlightCode) highlightCode.style.display = "none";
            if (responseControls) responseControls.style.display = "none";
        } else {
            // In JSON View (default), restore JSON view
            if (responseControls) responseControls.style.display = "";
            if (customView) {
                customView.style.display = "";
                // Ensure cloned original inside customView is visible and not collapsed
                const clonedOriginal = customView.querySelector(".custom-json-view__original-swagger");
                if (clonedOriginal) {
                    clonedOriginal.style.display = "";
                }
                if (highlightCode) highlightCode.style.display = "none";
            } else if (highlightCode) {
                highlightCode.style.display = "";
                highlightCode.hidden = false;
            }
        }
    }

    // =========================================================================
    // 10. SCANSIONE CONTINUA E MUTATION OBSERVER
    // =========================================================================

    function scanResponses() {
        injectStyles();
        document.querySelectorAll(".responses-wrapper .response-col_description, .responses-inner .response-col_description").forEach(processResponseElement);
    }

    function initialize() {
        injectStyles();
        scanResponses();
        registerGuideDocumentation();

        window.addEventListener("swagger-activity-bar:ready", registerGuideDocumentation);

        // Observer per intercettare nuove risposte HTTP renderizzate da Swagger UI
        const observer = new MutationObserver(() => {
            scanResponses();
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.info("[Swagger Data Grid] Plugin Data Grid & Table View per Endpoint di Lista inizializzato con successo.");
    }

    let isGuideRegistered = false;

    /**
     * Publishes plugin metadata and documentation to interactive Activity Bar guide.
     */
    function registerGuideDocumentation() {
        if (isGuideRegistered) return;
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerPluginGuide === "function") {
            isGuideRegistered = true;
            window.SwaggerActivityBar.registerPluginGuide({
                id: "data-grid-view",
                name: "Data Grid & Table View",
                version: "1.0.0",
                description: "Transforms tabular or paginated JSON responses into interactive Excel-like data grids with sorting, filtering, and CSV export.",
                shortcuts: [
                    "Toggle Table/JSON: Switch between data grid and JSON view",
                    "Click Header: Sort column ascending or descending",
                    "Search Table: Filter visible rows in real time",
                    "{...}: Inspect nested complex objects in modal",
                    "Export CSV: Download dataset for Excel"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="3" y1="9" x2="21" y2="9"/>
                        <line x1="3" y1="15" x2="21" y2="15"/>
                        <line x1="9" y1="3" x2="9" y2="21"/>
                    </svg>
                `,
                manual: `
### Overview
When an endpoint returns a list of items or a paginated envelope, the plugin injects a convenient **Table View / JSON View** toggle.

### Grid Capabilities
- **Interactive Sorting**: click any column header to sort data ascending or descending.
- **Instant Search**: type in the search box to filter records in real time without additional network requests.
- **Live Pagination**: select page size options and navigate pages with synchronized server or client pagination.
- **Nested Object Inspection**: columns with nested objects or arrays display a \`{...}\` chip that opens a modal viewer.
- **CSV Export**: download the dataset in CSV format with configurable filename generation.
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
