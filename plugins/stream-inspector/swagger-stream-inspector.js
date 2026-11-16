/**
 * Swagger UI Plugins - SSE & Chunked Stream Inspector
 * File: swagger-stream-inspector.js
 * Version: 1.0.0
 *
 * Description:
 * Dedicated real-time inspector and interactive streaming client for
 * Server-Sent Events (text/event-stream), chunked transfer, and NDJSON
 * (Newline-Delimited JSON) streaming APIs in Swagger UI.
 *
 * Features:
 * - Live sliding drawer console with full event cards.
 * - Supports W3C Server-Sent Events, NDJSON, and raw chunked streams.
 * - Native fetch ReadableStream reader supporting GET/POST, custom headers & bodies.
 * - Automatic inheritance of active Swagger Authorization (Bearer) tokens.
 * - Injects "⚡ Stream Live" button into matching Swagger UI operations.
 * - Real-time metrics: events count, bytes, stream duration, throughput, and packet latency.
 * - Event filtering, auto-scroll toggle, search, and JSON/log export.
 * - Activity Bar integration & Extensions Guide self-registration.
 * - Bilingual i18n (Italian & English) with auto-detection.
 * - Full Light / Dark theme synchronization.
 * - Comprehensive user configuration via `window.SwaggerStreamInspectorConfig`.
 *
 * Zero external dependencies. 100% Vanilla JS & CSS.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. CONFIGURATION & STATE
    // =========================================================================
    const userConfig = window.SwaggerStreamInspectorConfig || {};

    const CONFIG = {
        /** Plugin identity */
        PLUGIN_ID: "stream-inspector",
        PLUGIN_NAME: "Stream Inspector",
        PLUGIN_VERSION: "1.0.0",

        /** Element IDs */
        ELEMENT_IDS: {
            DRAWER: "swp-stream-inspector-drawer",
            STYLES: "swp-stream-inspector-styles",
            BACKDROP: "swp-stream-inspector-backdrop"
        },

        /** Drawer & Buffer Settings */
        DRAWER_WIDTH_PX: typeof userConfig.drawerWidthPx === "number" ? userConfig.drawerWidthPx : 580,
        MAX_STORED_EVENTS: typeof userConfig.maxStoredEvents === "number" ? userConfig.maxStoredEvents : 500,
        AUTO_SCROLL_DEFAULT: userConfig.autoScrollDefault !== false,
        INJECT_BUTTON: userConfig.injectButtonInEndpoints !== false,

        /** Activity Bar Integration */
        ACTIVITY_BAR: {
            ENABLED: userConfig.activityBar?.enabled !== false,
            ORDER: typeof userConfig.activityBar?.order === "number" ? userConfig.activityBar.order : 46
        },

        /** Content Types for Stream Recognition */
        STREAM_MIME_TYPES: userConfig.supportedContentTypes || [
            "text/event-stream",
            "application/x-ndjson",
            "application/jsonl",
            "application/stream+json"
        ],

        /** Language Setting */
        LOCALE: userConfig.locale || "auto"
    };

    /** Stream runtime state */
    const streamState = {
        isOpen: false,
        status: "idle", // "idle" | "connecting" | "streaming" | "closed" | "error"
        url: "",
        method: "GET",
        headers: {},
        body: "",
        abortController: null,
        reader: null,
        events: [],
        filterQuery: "",
        autoScroll: CONFIG.AUTO_SCROLL_DEFAULT,
        stats: {
            totalEvents: 0,
            totalBytes: 0,
            startTime: null,
            elapsedSeconds: 0,
            timerInterval: null,
            lastPacketTime: null
        }
    };

    // =========================================================================
    // 2. INTERNATIONALIZATION (i18n)
    // =========================================================================
    const I18N = {
        en: {
            activityBarTitle: "Stream Inspector (SSE / NDJSON)",
            btnStreamLive: "Stream Live",
            drawerTitle: "Live Stream Inspector",
            statusIdle: "Idle",
            statusConnecting: "Connecting...",
            statusStreaming: "Live Streaming",
            statusClosed: "Closed",
            statusError: "Error",
            btnConnect: "Connect",
            btnDisconnect: "Stop / Abort",
            btnReplay: "Replay",
            btnClear: "Clear",
            btnExport: "Export",
            filterPlaceholder: "Filter events or search payload...",
            autoScrollLabel: "Auto-scroll",
            statsEvents: "Events:",
            statsBytes: "Bytes:",
            statsTime: "Time:",
            statsRate: "Rate:",
            emptyFeedTitle: "No stream events received yet",
            emptyFeedDesc: "Click 'Connect' or invoke an endpoint with '⚡ Stream Live' to observe real-time chunks.",
            copyPayload: "Copy",
            copiedToast: "Copied!",
            exportTitle: "Export stream events",
            exportJson: "Download JSON",
            exportText: "Download Text Log",
            guideDescription: "Inspects and tests Server-Sent Events (SSE), NDJSON, and chunked transfer endpoints in real time with packet latency, filtering, and export."
        },
        it: {
            activityBarTitle: "Stream Inspector (SSE / NDJSON)",
            btnStreamLive: "Stream Live",
            drawerTitle: "Live Stream Inspector",
            statusIdle: "Inattivo",
            statusConnecting: "Connessione...",
            statusStreaming: "In Streaming",
            statusClosed: "Chiuso",
            statusError: "Errore",
            btnConnect: "Connetti",
            btnDisconnect: "Interrompi",
            btnReplay: "Riavvia",
            btnClear: "Pulisci",
            btnExport: "Esporta",
            filterPlaceholder: "Filtra per evento o cerca testo...",
            autoScrollLabel: "Auto-scroll",
            statsEvents: "Eventi:",
            statsBytes: "Byte:",
            statsTime: "Tempo:",
            statsRate: "Frequenza:",
            emptyFeedTitle: "Nessun evento ricevuto",
            emptyFeedDesc: "Clicca su 'Connetti' o usa '⚡ Stream Live' su un endpoint per visualizzare i dati in tempo reale.",
            copyPayload: "Copia",
            copiedToast: "Copiato!",
            exportTitle: "Esporta eventi dello stream",
            exportJson: "Scarica JSON",
            exportText: "Scarica Log Testuale",
            guideDescription: "Ispeziona e testa in tempo reale endpoint Server-Sent Events (SSE), NDJSON e stream chunked con metriche di latenza, filtri ed export."
        }
    };

    function getActiveLocale() {
        if (CONFIG.LOCALE && CONFIG.LOCALE !== "auto") {
            return CONFIG.LOCALE.toLowerCase().startsWith("it") ? "it" : "en";
        }
        try {
            const stored = localStorage.getItem("swp_swagger_i18n_locale");
            if (stored) return stored.toLowerCase().startsWith("it") ? "it" : "en";
        } catch {}
        const navLang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
        return navLang.startsWith("it") ? "it" : "en";
    }

    function t(key, fallback = "") {
        const locale = getActiveLocale();
        const dict = I18N[locale] || I18N.en;
        return dict[key] !== undefined ? dict[key] : (I18N.en[key] !== undefined ? I18N.en[key] : fallback);
    }

    function escapeHtml(str) {
        if (typeof str !== "string") return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function cleanZeroWidth(str) {
        if (!str || typeof str !== "string") return "";
        return str.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function formatTime(totalSec) {
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    // =========================================================================
    // 3. READABLE STREAM & SSE PARSER ENGINE
    // =========================================================================
    /**
     * Retrieves active Authorization header from Swagger UI Redux state if present.
     */
    function getActiveSwaggerBearerToken() {
        if (!window.ui || typeof window.ui.getState !== "function") return "";
        try {
            const authMap = window.ui.getState().get("auth")?.get("authorized");
            if (!authMap) return "";
            const authObj = typeof authMap.toJS === "function" ? authMap.toJS() : authMap;
            for (const [, schemeData] of Object.entries(authObj)) {
                if (schemeData && typeof schemeData === "object") {
                    const token = schemeData.value || schemeData.token || schemeData.apiKey;
                    if (token) return token;
                }
            }
        } catch {}
        return "";
    }

    /**
     * Initiates the streaming fetch connection.
     */
    async function startStream(targetUrl, method = "GET", headers = {}, body = "") {
        stopStream();

        streamState.url = targetUrl || streamState.url;
        streamState.method = (method || "GET").toUpperCase();
        streamState.headers = { ...headers };
        streamState.body = body || "";

        // Inherit Bearer token if not explicitly passed
        const hasAuth = Object.keys(streamState.headers).some(k => k.toLowerCase() === "authorization");
        if (!hasAuth) {
            const bearer = getActiveSwaggerBearerToken();
            if (bearer) {
                streamState.headers["Authorization"] = bearer.startsWith("Bearer ") ? bearer : `Bearer ${bearer}`;
            }
        }

        // Set default Accept header for SSE / NDJSON if absent
        const hasAccept = Object.keys(streamState.headers).some(k => k.toLowerCase() === "accept");
        if (!hasAccept) {
            streamState.headers["Accept"] = "text/event-stream, application/x-ndjson, */*";
        }

        streamState.abortController = new AbortController();
        setStreamStatus("connecting");
        resetMetrics();
        startTimer();

        try {
            const fetchOptions = {
                method: streamState.method,
                headers: streamState.headers,
                signal: streamState.abortController.signal
            };

            if (streamState.method !== "GET" && streamState.method !== "HEAD" && streamState.body) {
                fetchOptions.body = streamState.body;
            }

            const response = await fetch(streamState.url, fetchOptions);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            if (!response.body) {
                throw new Error("Response body is not readable.");
            }

            setStreamStatus("streaming");

            const contentType = (response.headers.get("content-type") || "").toLowerCase();
            const isNdjson = contentType.includes("ndjson") || contentType.includes("jsonl");

            const reader = response.body.getReader();
            streamState.reader = reader;
            const decoder = new TextDecoder("utf-8");

            let buffer = "";
            let currentEvent = { id: "", event: "message", data: "", retry: null };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunkText = decoder.decode(value, { stream: true });
                const chunkBytes = value.byteLength || chunkText.length;
                updateByteStats(chunkBytes);

                buffer += chunkText;

                if (isNdjson) {
                    buffer = processNdjsonBuffer(buffer);
                } else {
                    buffer = processSseBuffer(buffer, currentEvent);
                }
            }

            // Flush remaining buffer if present
            if (buffer.trim()) {
                if (isNdjson) {
                    processNdjsonLine(buffer.trim());
                } else {
                    emitEvent({
                        id: currentEvent.id || "",
                        event: currentEvent.event || "message",
                        data: currentEvent.data || buffer.trim(),
                        raw: buffer
                    });
                }
            }

            setStreamStatus("closed");
        } catch (err) {
            if (err.name === "AbortError") {
                setStreamStatus("closed");
            } else {
                console.error("[SwaggerStreamInspector] Stream error:", err);
                setStreamStatus("error", err.message);
            }
        } finally {
            stopTimer();
            streamState.reader = null;
            streamState.abortController = null;
            renderDrawerStats();
        }
    }

    function stopStream() {
        if (streamState.abortController) {
            try { streamState.abortController.abort(); } catch {}
            streamState.abortController = null;
        }
        if (streamState.reader) {
            try { streamState.reader.cancel(); } catch {}
            streamState.reader = null;
        }
        stopTimer();
        if (streamState.status === "streaming" || streamState.status === "connecting") {
            setStreamStatus("closed");
        }
    }

    /**
     * Parses SSE chunks according to W3C Server-Sent Events spec.
     */
    function processSseBuffer(buffer, currentEvent) {
        const lines = buffer.split(/\r\n|\r|\n/);
        // The last line might be incomplete, retain it in buffer
        const remaining = lines.pop();

        for (const line of lines) {
            if (line === "") {
                // Empty line triggers event dispatch if data is present
                if (currentEvent.data !== "") {
                    emitEvent({
                        id: currentEvent.id,
                        event: currentEvent.event || "message",
                        data: currentEvent.data,
                        retry: currentEvent.retry
                    });
                    currentEvent.data = "";
                    currentEvent.event = "message";
                }
                continue;
            }

            if (line.startsWith(":")) {
                // Comment line (ping / heartbeat)
                emitEvent({
                    id: "",
                    event: "comment",
                    data: line.substring(1).trim(),
                    isComment: true
                });
                continue;
            }

            const colonIdx = line.indexOf(":");
            let field = line;
            let value = "";
            if (colonIdx !== -1) {
                field = line.substring(0, colonIdx);
                value = line.substring(colonIdx + 1);
                if (value.startsWith(" ")) value = value.substring(1);
            }

            switch (field) {
                case "event":
                    currentEvent.event = value;
                    break;
                case "data":
                    currentEvent.data = currentEvent.data ? currentEvent.data + "\n" + value : value;
                    break;
                case "id":
                    currentEvent.id = value;
                    break;
                case "retry":
                    currentEvent.retry = parseInt(value, 10);
                    break;
            }
        }

        return remaining !== undefined ? remaining : "";
    }

    /**
     * Parses NDJSON chunks (line-by-line JSON objects).
     */
    function processNdjsonBuffer(buffer) {
        const lines = buffer.split(/\r\n|\r|\n/);
        const remaining = lines.pop();

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                processNdjsonLine(trimmed);
            }
        }

        return remaining !== undefined ? remaining : "";
    }

    function processNdjsonLine(line) {
        let isJson = false;
        try {
            JSON.parse(line);
            isJson = true;
        } catch {}

        emitEvent({
            id: "",
            event: isJson ? "ndjson" : "chunk",
            data: line,
            isJson: isJson
        });
    }

    function emitEvent(eventObj) {
        const now = new Date();
        const deltaMs = streamState.stats.lastPacketTime
            ? now.getTime() - streamState.stats.lastPacketTime
            : 0;
        streamState.stats.lastPacketTime = now.getTime();
        streamState.stats.totalEvents++;

        const enriched = {
            index: streamState.stats.totalEvents,
            timestamp: now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0"),
            deltaMs: deltaMs,
            sizeBytes: new Blob([eventObj.data || ""]).size,
            ...eventObj
        };

        streamState.events.push(enriched);
        if (streamState.events.length > CONFIG.MAX_STORED_EVENTS) {
            streamState.events.shift();
        }

        appendEventToFeed(enriched);
        renderDrawerStats();
    }

    function updateByteStats(bytes) {
        streamState.stats.totalBytes += bytes;
    }

    function resetMetrics() {
        streamState.stats.totalEvents = 0;
        streamState.stats.totalBytes = 0;
        streamState.stats.elapsedSeconds = 0;
        streamState.stats.startTime = Date.now();
        streamState.stats.lastPacketTime = null;
        streamState.events = [];
        clearEventFeedDOM();
    }

    function startTimer() {
        stopTimer();
        streamState.stats.startTime = Date.now();
        streamState.stats.timerInterval = setInterval(() => {
            streamState.stats.elapsedSeconds = Math.floor((Date.now() - streamState.stats.startTime) / 1000);
            const timeEl = document.getElementById("swp-stream-stat-time");
            if (timeEl) timeEl.textContent = formatTime(streamState.stats.elapsedSeconds);
            const rateEl = document.getElementById("swp-stream-stat-rate");
            if (rateEl && streamState.stats.elapsedSeconds > 0) {
                const rate = (streamState.stats.totalEvents / streamState.stats.elapsedSeconds).toFixed(1);
                rateEl.textContent = `${rate} ev/s`;
            }
        }, 1000);
    }

    function stopTimer() {
        if (streamState.stats.timerInterval) {
            clearInterval(streamState.stats.timerInterval);
            streamState.stats.timerInterval = null;
        }
    }

    function setStreamStatus(newStatus, errorMsg = "") {
        streamState.status = newStatus;
        const statusPill = document.getElementById("swp-stream-status-pill");
        if (statusPill) {
            statusPill.className = `swp-stream-pill swp-stream-pill-${newStatus}`;
            let label = t("statusIdle");
            if (newStatus === "connecting") label = t("statusConnecting");
            else if (newStatus === "streaming") label = t("statusStreaming");
            else if (newStatus === "closed") label = t("statusClosed");
            else if (newStatus === "error") label = errorMsg ? `${t("statusError")}: ${errorMsg}` : t("statusError");
            statusPill.textContent = label;
        }

        const connectBtn = document.getElementById("swp-stream-btn-connect");
        const stopBtn = document.getElementById("swp-stream-btn-stop");
        if (connectBtn && stopBtn) {
            if (newStatus === "streaming" || newStatus === "connecting") {
                connectBtn.style.display = "none";
                stopBtn.style.display = "inline-flex";
            } else {
                connectBtn.style.display = "inline-flex";
                stopBtn.style.display = "none";
            }
        }
    }

    // =========================================================================
    // 4. DRAWER UI & STYLES
    // =========================================================================
    function injectStyles() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.STYLES)) return;

        const style = document.createElement("style");
        style.id = CONFIG.ELEMENT_IDS.STYLES;
        style.textContent = `
            /* Theme Variables */
            #${CONFIG.ELEMENT_IDS.DRAWER} {
                --swp-si-bg: #ffffff;
                --swp-si-header-bg: #f8fafc;
                --swp-si-card-bg: #ffffff;
                --swp-si-card-border: #e2e8f0;
                --swp-si-border: #cbd5e1;
                --swp-si-text: #0f172a;
                --swp-si-text-muted: #64748b;
                --swp-si-primary: #0284c7;
                --swp-si-primary-hover: #0369a1;
                --swp-si-code-bg: #f1f5f9;
                --swp-si-shadow: -8px 0 30px rgba(0, 0, 0, 0.18);
            }

            html.dark-mode #${CONFIG.ELEMENT_IDS.DRAWER},
            body.dark-mode #${CONFIG.ELEMENT_IDS.DRAWER},
            .dark-mode #${CONFIG.ELEMENT_IDS.DRAWER},
            [data-theme="dark"] #${CONFIG.ELEMENT_IDS.DRAWER} {
                --swp-si-bg: #181818;
                --swp-si-header-bg: #202020;
                --swp-si-card-bg: #1f1f1f;
                --swp-si-card-border: #2d2d2d;
                --swp-si-border: #383838;
                --swp-si-text: #f5f5f5;
                --swp-si-text-muted: #94a3b8;
                --swp-si-primary: #38bdf8;
                --swp-si-primary-hover: #7dd3fc;
                --swp-si-code-bg: #121212;
                --swp-si-shadow: -8px 0 35px rgba(0, 0, 0, 0.6);
            }

            /* Backdrop */
            #${CONFIG.ELEMENT_IDS.BACKDROP} {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(15, 23, 42, 0.4);
                backdrop-filter: blur(2px);
                z-index: 999970;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
            }
            #${CONFIG.ELEMENT_IDS.BACKDROP}.is-open {
                opacity: 1;
                pointer-events: auto;
            }

            /* Sliding Drawer */
            #${CONFIG.ELEMENT_IDS.DRAWER} {
                position: fixed;
                top: 0;
                right: 0;
                bottom: 0;
                width: ${CONFIG.DRAWER_WIDTH_PX}px;
                max-width: 95vw;
                background-color: var(--swp-si-bg) !important;
                color: var(--swp-si-text) !important;
                border-left: 1px solid var(--swp-si-border);
                box-shadow: var(--swp-si-shadow);
                z-index: 999980;
                display: flex;
                flex-direction: column;
                transform: translateX(100%);
                transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            #${CONFIG.ELEMENT_IDS.DRAWER}.is-open {
                transform: translateX(0);
            }

            /* Drawer Header */
            .swp-si-header {
                padding: 14px 18px;
                border-bottom: 1px solid var(--swp-si-border);
                background: var(--swp-si-header-bg);
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-shrink: 0;
            }

            /* Status Pill */
            .swp-stream-pill {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 2px 8px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
            }
            .swp-stream-pill-idle { background: #64748b; color: #fff; }
            .swp-stream-pill-connecting { background: #f59e0b; color: #fff; }
            .swp-stream-pill-streaming { background: #10b981; color: #fff; animation: swpSiPulse 1.5s infinite; }
            .swp-stream-pill-closed { background: #64748b; color: #fff; }
            .swp-stream-pill-error { background: #ef4444; color: #fff; }
            @keyframes swpSiPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.65; }
            }

            /* Toolbar */
            .swp-si-toolbar {
                padding: 10px 16px;
                border-bottom: 1px solid var(--swp-si-border);
                background: var(--swp-si-header-bg);
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 8px;
                flex-shrink: 0;
            }

            /* Stats Bar */
            .swp-si-stats-bar {
                padding: 6px 16px;
                border-bottom: 1px solid var(--swp-si-card-border);
                background: var(--swp-si-bg);
                display: flex;
                align-items: center;
                gap: 16px;
                font-size: 11px;
                color: var(--swp-si-text-muted);
                flex-shrink: 0;
            }
            .swp-si-stat-val {
                font-weight: 700;
                color: var(--swp-si-text);
                font-family: monospace;
            }

            /* Event Feed Scroll Container */
            .swp-si-feed {
                flex: 1;
                overflow-y: auto;
                padding: 14px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                background: var(--swp-si-bg);
            }

            /* Event Card */
            .swp-si-card {
                padding: 10px 12px;
                border-radius: 6px;
                background: var(--swp-si-card-bg);
                border: 1px solid var(--swp-si-card-border);
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                display: flex;
                flex-direction: column;
                gap: 6px;
                animation: swpSiCardIn 0.15s ease-out;
            }
            @keyframes swpSiCardIn {
                from { opacity: 0; transform: translateY(4px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .swp-si-card-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 11px;
            }

            .swp-si-event-badge {
                display: inline-block;
                padding: 1px 6px;
                border-radius: 3px;
                background: #0284c7;
                color: #fff;
                font-size: 10px;
                font-weight: 700;
                font-family: monospace;
            }
            .swp-si-event-badge-comment {
                background: #64748b;
            }

            .swp-si-card-body {
                background: var(--swp-si-code-bg);
                padding: 8px 10px;
                border-radius: 4px;
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
                font-size: 11px;
                line-height: 1.4;
                white-space: pre-wrap;
                word-break: break-all;
                max-height: 240px;
                overflow-y: auto;
                color: var(--swp-si-text);
                border: 1px solid var(--swp-si-card-border);
            }

            /* Buttons & Controls */
            .swp-si-btn {
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                border: 1px solid var(--swp-si-border);
                background: var(--swp-si-bg);
                color: var(--swp-si-text);
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s;
            }
            .swp-si-btn:hover {
                border-color: var(--swp-si-primary);
            }

            .swp-si-btn-primary {
                background: #10b981;
                color: #fff;
                border-color: #10b981;
            }
            .swp-si-btn-primary:hover {
                background: #059669;
            }

            .swp-si-btn-stop {
                background: #ef4444;
                color: #fff;
                border-color: #ef4444;
            }
            .swp-si-btn-stop:hover {
                background: #dc2626;
            }

            .swp-si-input {
                padding: 5px 8px;
                border-radius: 4px;
                border: 1px solid var(--swp-si-border);
                background: var(--swp-si-bg);
                color: var(--swp-si-text);
                font-size: 11px;
                outline: none;
            }
            .swp-si-input:focus {
                border-color: var(--swp-si-primary);
            }

            /* Endpoint Button */
            .swp-si-trigger-btn {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 10px;
                margin-left: 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 700;
                background: #0284c7;
                color: #ffffff;
                border: none;
                cursor: pointer;
                transition: background 0.15s, transform 0.1s;
                vertical-align: middle;
            }
            .swp-si-trigger-btn:hover {
                background: #0369a1;
                transform: scale(1.02);
            }
        `;
        document.head.appendChild(style);
    }

    function createDrawerDOM() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.DRAWER)) return;
        injectStyles();

        // Backdrop
        const backdrop = document.createElement("div");
        backdrop.id = CONFIG.ELEMENT_IDS.BACKDROP;
        backdrop.addEventListener("click", closeStreamDrawer);
        document.body.appendChild(backdrop);

        // Drawer
        const drawer = document.createElement("div");
        drawer.id = CONFIG.ELEMENT_IDS.DRAWER;

        drawer.innerHTML = `
            <div class="swp-si-header">
                <div style="display:flex;align-items:center;gap:10px;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--swp-si-primary);">
                        <rect x="2" y="5" width="20" height="14" rx="3.5"></rect>
                        <text x="12" y="15.2" text-anchor="middle" font-size="8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" fill="currentColor" stroke="none" letter-spacing="0.5">SSE</text>
                    </svg>
                    <div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <strong style="font-size:13px;color:var(--swp-si-text);">${escapeHtml(t("drawerTitle"))}</strong>
                            <span id="swp-stream-status-pill" class="swp-stream-pill swp-stream-pill-idle">${escapeHtml(t("statusIdle"))}</span>
                        </div>
                        <div id="swp-stream-url-display" style="font-size:11px;color:var(--swp-si-text-muted);font-family:monospace;max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">-</div>
                    </div>
                </div>
                <button type="button" class="swp-si-btn" id="swp-stream-btn-close" style="padding:4px 8px;font-size:14px;" aria-label="Close">✕</button>
            </div>

            <div class="swp-si-toolbar">
                <div style="display:flex;align-items:center;gap:6px;">
                    <button type="button" class="swp-si-btn swp-si-btn-primary" id="swp-stream-btn-connect">▶ ${escapeHtml(t("btnConnect"))}</button>
                    <button type="button" class="swp-si-btn swp-si-btn-stop" id="swp-stream-btn-stop" style="display:none;">⏹ ${escapeHtml(t("btnDisconnect"))}</button>
                    <button type="button" class="swp-si-btn" id="swp-stream-btn-replay">🔄 ${escapeHtml(t("btnReplay"))}</button>
                    <button type="button" class="swp-si-btn" id="swp-stream-btn-clear">🧹 ${escapeHtml(t("btnClear"))}</button>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--swp-si-text-muted);">
                        <input type="checkbox" id="swp-stream-chk-autoscroll" ${streamState.autoScroll ? "checked" : ""}>
                        ${escapeHtml(t("autoScrollLabel"))}
                    </label>
                    <button type="button" class="swp-si-btn" id="swp-stream-btn-export">💾 ${escapeHtml(t("btnExport"))}</button>
                </div>
            </div>

            <div style="padding:6px 14px;border-bottom:1px solid var(--swp-si-card-border);background:var(--swp-si-header-bg);display:flex;gap:8px;">
                <input type="text" class="swp-si-input" id="swp-stream-filter-input" placeholder="${escapeHtml(t("filterPlaceholder"))}" style="flex:1;">
            </div>

            <div class="swp-si-stats-bar">
                <div>${escapeHtml(t("statsEvents"))} <span class="swp-si-stat-val" id="swp-stream-stat-events">0</span></div>
                <div>${escapeHtml(t("statsBytes"))} <span class="swp-si-stat-val" id="swp-stream-stat-bytes">0 B</span></div>
                <div>${escapeHtml(t("statsTime"))} <span class="swp-si-stat-val" id="swp-stream-stat-time">00:00</span></div>
                <div>${escapeHtml(t("statsRate"))} <span class="swp-si-stat-val" id="swp-stream-stat-rate">0 ev/s</span></div>
            </div>

            <div class="swp-si-feed" id="swp-stream-feed">
                <div id="swp-stream-empty" style="text-align:center;padding:40px 20px;color:var(--swp-si-text-muted);">
                    <div style="display:flex;justify-content:center;margin-bottom:10px;">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--swp-si-text-muted);">
                            <rect x="2" y="5" width="20" height="14" rx="3.5"></rect>
                            <text x="12" y="15.2" text-anchor="middle" font-size="8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" fill="currentColor" stroke="none" letter-spacing="0.5">SSE</text>
                        </svg>
                    </div>
                    <strong style="font-size:13px;display:block;margin-bottom:4px;color:var(--swp-si-text);">${escapeHtml(t("emptyFeedTitle"))}</strong>
                    <div style="font-size:11px;">${escapeHtml(t("emptyFeedDesc"))}</div>
                </div>
            </div>
        `;

        document.body.appendChild(drawer);

        // Bind events
        drawer.querySelector("#swp-stream-btn-close")?.addEventListener("click", closeStreamDrawer);
        drawer.querySelector("#swp-stream-btn-connect")?.addEventListener("click", () => {
            if (streamState.url) startStream(streamState.url, streamState.method, streamState.headers, streamState.body);
        });
        drawer.querySelector("#swp-stream-btn-stop")?.addEventListener("click", stopStream);
        drawer.querySelector("#swp-stream-btn-replay")?.addEventListener("click", () => {
            if (streamState.url) startStream(streamState.url, streamState.method, streamState.headers, streamState.body);
        });
        drawer.querySelector("#swp-stream-btn-clear")?.addEventListener("click", () => {
            resetMetrics();
            renderDrawerStats();
        });
        drawer.querySelector("#swp-stream-chk-autoscroll")?.addEventListener("change", (e) => {
            streamState.autoScroll = e.target.checked;
        });
        drawer.querySelector("#swp-stream-filter-input")?.addEventListener("input", (e) => {
            streamState.filterQuery = e.target.value.toLowerCase().trim();
            applyFeedFilter();
        });
        drawer.querySelector("#swp-stream-btn-export")?.addEventListener("click", exportEventsModal);

        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && streamState.isOpen) {
                closeStreamDrawer();
            }
        });
    }

    function openStreamDrawer(options = {}) {
        createDrawerDOM();
        streamState.isOpen = true;

        if (options.url) {
            streamState.url = options.url;
            streamState.method = options.method || "GET";
            streamState.headers = options.headers || {};
            streamState.body = options.body || "";
        }

        const drawer = document.getElementById(CONFIG.ELEMENT_IDS.DRAWER);
        const backdrop = document.getElementById(CONFIG.ELEMENT_IDS.BACKDROP);
        const urlDisplay = document.getElementById("swp-stream-url-display");

        if (urlDisplay && streamState.url) {
            urlDisplay.textContent = `${streamState.method} ${streamState.url}`;
            urlDisplay.title = streamState.url;
        }

        drawer?.classList.add("is-open");
        backdrop?.classList.add("is-open");

        if (options.autoStart) {
            startStream(streamState.url, streamState.method, streamState.headers, streamState.body);
        }
    }

    function closeStreamDrawer() {
        streamState.isOpen = false;
        const drawer = document.getElementById(CONFIG.ELEMENT_IDS.DRAWER);
        const backdrop = document.getElementById(CONFIG.ELEMENT_IDS.BACKDROP);
        drawer?.classList.remove("is-open");
        backdrop?.classList.remove("is-open");
    }

    // =========================================================================
    // 5. FEED RENDERING & FILTERING
    // =========================================================================
    function clearEventFeedDOM() {
        const feed = document.getElementById("swp-stream-feed");
        if (!feed) return;
        feed.innerHTML = `
            <div id="swp-stream-empty" style="text-align:center;padding:40px 20px;color:var(--swp-si-text-muted);">
                <div style="display:flex;justify-content:center;margin-bottom:10px;">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--swp-si-text-muted);">
                        <rect x="2" y="5" width="20" height="14" rx="3.5"></rect>
                        <text x="12" y="15.2" text-anchor="middle" font-size="8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" fill="currentColor" stroke="none" letter-spacing="0.5">SSE</text>
                    </svg>
                </div>
                <strong style="font-size:13px;display:block;margin-bottom:4px;color:var(--swp-si-text);">${escapeHtml(t("emptyFeedTitle"))}</strong>
                <div style="font-size:11px;">${escapeHtml(t("emptyFeedDesc"))}</div>
            </div>
        `;
    }

    function appendEventToFeed(evt) {
        const feed = document.getElementById("swp-stream-feed");
        if (!feed) return;

        const empty = document.getElementById("swp-stream-empty");
        if (empty) empty.remove();

        const card = document.createElement("div");
        card.className = "swp-si-card";
        card.setAttribute("data-event-type", (evt.event || "").toLowerCase());
        card.setAttribute("data-raw-content", (evt.data || "").toLowerCase());

        let badgeClass = "swp-si-event-badge";
        if (evt.isComment) badgeClass += " swp-si-event-badge-comment";

        // Try formatting JSON payload
        let formattedData = evt.data;
        try {
            const parsed = JSON.parse(evt.data);
            formattedData = JSON.stringify(parsed, null, 2);
        } catch {}

        card.innerHTML = `
            <div class="swp-si-card-header">
                <div style="display:flex;align-items:center;gap:6px;">
                    <strong style="color:var(--swp-si-text-muted);font-family:monospace;">#${evt.index}</strong>
                    <span class="${badgeClass}">${escapeHtml(evt.event)}</span>
                    ${evt.id ? `<span style="font-size:10px;font-family:monospace;color:var(--swp-si-text-muted);">id: ${escapeHtml(evt.id)}</span>` : ""}
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    ${evt.deltaMs > 0 ? `<span style="color:#10b981;font-size:10px;font-weight:700;">+${evt.deltaMs}ms</span>` : ""}
                    <span style="color:var(--swp-si-text-muted);font-family:monospace;font-size:10px;">${evt.timestamp}</span>
                    <span style="color:var(--swp-si-text-muted);font-size:10px;">(${formatBytes(evt.sizeBytes)})</span>
                    <button type="button" class="swp-si-btn" style="padding:1px 6px;font-size:10px;" data-action="copy">📋</button>
                </div>
            </div>
            <pre class="swp-si-card-body">${escapeHtml(formattedData)}</pre>
        `;

        card.querySelector("[data-action='copy']")?.addEventListener("click", (e) => {
            const btn = e.currentTarget;
            navigator.clipboard.writeText(evt.data).then(() => {
                const orig = btn.textContent;
                btn.textContent = "✓";
                setTimeout(() => { btn.textContent = orig; }, 1200);
            });
        });

        // Filter visibility check
        if (streamState.filterQuery) {
            const matchEvent = (evt.event || "").toLowerCase().includes(streamState.filterQuery);
            const matchData = (evt.data || "").toLowerCase().includes(streamState.filterQuery);
            if (!matchEvent && !matchData) {
                card.style.display = "none";
            }
        }

        feed.appendChild(card);

        if (streamState.autoScroll) {
            feed.scrollTop = feed.scrollHeight;
        }
    }

    function applyFeedFilter() {
        const feed = document.getElementById("swp-stream-feed");
        if (!feed) return;
        const q = streamState.filterQuery;
        const cards = feed.querySelectorAll(".swp-si-card");

        cards.forEach(card => {
            if (!q) {
                card.style.display = "flex";
                return;
            }
            const evtType = card.getAttribute("data-event-type") || "";
            const content = card.getAttribute("data-raw-content") || "";
            if (evtType.includes(q) || content.includes(q)) {
                card.style.display = "flex";
            } else {
                card.style.display = "none";
            }
        });
    }

    function renderDrawerStats() {
        const eventsEl = document.getElementById("swp-stream-stat-events");
        const bytesEl = document.getElementById("swp-stream-stat-bytes");
        if (eventsEl) eventsEl.textContent = String(streamState.stats.totalEvents);
        if (bytesEl) bytesEl.textContent = formatBytes(streamState.stats.totalBytes);
    }

    function exportEventsModal() {
        if (streamState.events.length === 0) return;

        const jsonStr = JSON.stringify(streamState.events, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `stream_events_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // =========================================================================
    // 6. SWAGGER UI ENDPOINT AUTO-DETECTION & BUTTON INJECTION
    // =========================================================================
    /**
     * Inspects Swagger UI DOM and injects "⚡ Stream Live" buttons onto
     * operations declaring streaming response content types (e.g. text/event-stream).
     */
    function scanAndInjectStreamButtons() {
        if (!CONFIG.INJECT_BUTTON) return;

        const opblocks = document.querySelectorAll(".opblock");
        opblocks.forEach(block => {
            if (block.querySelector(".swp-si-trigger-btn")) return;

            // Check if opblock produces streaming content
            const isStream = checkIfOpblockIsStreaming(block);
            if (!isStream) return;

            const summary = block.querySelector(".opblock-summary");
            if (!summary) return;

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "swp-si-trigger-btn";
            btn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px;">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                <span>${escapeHtml(t("btnStreamLive"))}</span>
            `;

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                openFromOpblock(block);
            });

            summary.appendChild(btn);
        });
    }

    function checkIfOpblockIsStreaming(opblock) {
        // 1. Check response content-type text in DOM
        const text = opblock.textContent.toLowerCase();
        for (const mime of CONFIG.STREAM_MIME_TYPES) {
            if (text.includes(mime)) return true;
        }

        // 2. Check OpenAPI spec responses if available
        const spec = getOpenApiSpec();
        if (spec && spec.paths) {
            const methodEl = opblock.querySelector(".opblock-summary-method");
            const pathEl = opblock.querySelector(".opblock-summary-path");
            const method = methodEl?.textContent.trim().toLowerCase();
            const path = cleanZeroWidth(pathEl?.getAttribute("data-path") || pathEl?.textContent);

            if (method && path && spec.paths[path] && spec.paths[path][method]) {
                const op = spec.paths[path][method];
                const produces = op.produces || spec.produces || [];
                for (const mime of CONFIG.STREAM_MIME_TYPES) {
                    if (produces.includes(mime)) return true;
                }
                const responses = op.responses || {};
                for (const res of Object.values(responses)) {
                    if (res && res.content) {
                        for (const mime of CONFIG.STREAM_MIME_TYPES) {
                            if (res.content[mime]) return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    function getOpenApiSpec() {
        if (!window.ui || typeof window.ui.getState !== "function") return null;
        try {
            const spec = window.ui.getState().get("spec")?.get("json");
            return typeof spec?.toJS === "function" ? spec.toJS() : spec;
        } catch {
            return null;
        }
    }

    /**
     * Extracts values from the Swagger operation form and opens the stream drawer.
     */
    function openFromOpblock(opblock) {
        const methodEl = opblock.querySelector(".opblock-summary-method");
        const pathEl = opblock.querySelector(".opblock-summary-path");
        const method = methodEl?.textContent.trim().toUpperCase() || "GET";
        let rawPath = cleanZeroWidth(pathEl?.getAttribute("data-path") || pathEl?.textContent || "/");

        // Read path parameters and query parameters from inputs
        const headers = {};
        const queryParams = new URLSearchParams();

        const paramRows = opblock.querySelectorAll(".parameters tr[data-param-name]");
        paramRows.forEach(row => {
            const paramName = cleanZeroWidth(row.getAttribute("data-param-name") || "");
            const input = row.querySelector("input, select, textarea");
            const val = input?.value || "";
            if (!val || !paramName) return;

            // Check if path param
            if (rawPath.includes(`{${paramName}}`)) {
                rawPath = rawPath.replace(`{${paramName}}`, encodeURIComponent(val));
            } else {
                queryParams.append(paramName, val);
            }
        });

        // Request Body
        let body = "";
        const bodyTextarea = opblock.querySelector("textarea.body-param__text, .body-param textarea");
        if (bodyTextarea) {
            body = bodyTextarea.value || "";
        }

        // Construct full URL taking into account Swagger host/basePath or current origin
        let fullUrl = rawPath;
        if (queryParams.toString()) {
            fullUrl += (fullUrl.includes("?") ? "&" : "?") + queryParams.toString();
        }

        try {
            fullUrl = new URL(fullUrl, window.location.href).href;
        } catch {}

        openStreamDrawer({
            url: fullUrl,
            method: method,
            headers: headers,
            body: body,
            autoStart: true
        });
    }

    // =========================================================================
    // 7. ACTIVITY BAR & GUIDE REGISTRATION
    // =========================================================================
    function registerActivityBarItem() {
        if (!CONFIG.ACTIVITY_BAR.ENABLED) return;
        if (!window.SwaggerActivityBar || typeof window.SwaggerActivityBar.registerItem !== "function") return;

        window.SwaggerActivityBar.registerItem({
            id: CONFIG.PLUGIN_ID,
            title: t("activityBarTitle"),
            iconHtml: `
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
                    <rect x="2" y="5" width="20" height="14" rx="3.5"></rect>
                    <text x="12" y="15.2" text-anchor="middle" font-size="8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" fill="currentColor" stroke="none" letter-spacing="0.5">SSE</text>
                </svg>
            `,
            section: "main",
            order: CONFIG.ACTIVITY_BAR.ORDER,
            ariaLabel: t("activityBarTitle"),
            onClick: () => {
                if (streamState.isOpen) {
                    closeStreamDrawer();
                } else {
                    openStreamDrawer();
                }
            }
        });
    }

    function registerExtensionsGuide() {
        const registerGuide = window.registerPluginGuide ||
            (window.SwaggerActivityBar && window.SwaggerActivityBar.registerPluginGuide);

        if (typeof registerGuide === "function") {
            registerGuide({
                id: CONFIG.PLUGIN_ID,
                name: CONFIG.PLUGIN_NAME,
                version: CONFIG.PLUGIN_VERSION,
                description: t("guideDescription"),
                iconHtml: `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="3.5"></rect>
                        <text x="12" y="15.2" text-anchor="middle" font-size="8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" fill="currentColor" stroke="none" letter-spacing="0.5">SSE</text>
                    </svg>
                `,
                shortcuts: [
                    { key: "Esc", desc: "Close stream drawer" }
                ],
                manual: `
### ${CONFIG.PLUGIN_NAME} — Manual

1. **Auto-Detection**: Streaming endpoints (\`text/event-stream\`, \`application/x-ndjson\`) automatically display a **'Stream Live'** button.
2. **Launch Stream**: Clicking 'Stream Live' extracts current form parameters and body, opens the sliding drawer, and connects.
3. **Live Diagnostics**:
   - Event count, total bytes, stream duration, throughput, and packet latency delta.
   - Event filtering and real-time payload search.
   - Formatted JSON cards with single-click copy.
4. **Controls**:
   - **Stop / Abort**: Safely cancels the stream via \`AbortController\`.
   - **Replay**: Restarts the stream with the same parameters.
   - **Export**: Downloads the received events in JSON format.
                `.trim()
            });
        }
    }

    // =========================================================================
    // 8. INITIALIZATION
    // =========================================================================
    function init() {
        injectStyles();
        registerActivityBarItem();
        registerExtensionsGuide();
        scanAndInjectStreamButtons();

        // Observe DOM for newly rendered Swagger UI operations
        const observer = new MutationObserver(() => {
            scanAndInjectStreamButtons();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            registerActivityBarItem();
            registerExtensionsGuide();
            scanAndInjectStreamButtons();
            if (attempts > 12) clearInterval(interval);
        }, 800);
    }

    // Public programmatic API
    window.SwaggerStreamInspector = {
        openDrawer: openStreamDrawer,
        closeDrawer: closeStreamDrawer,
        startStream: startStream,
        stopStream: stopStream,
        getState: () => ({ ...streamState }),
        version: CONFIG.PLUGIN_VERSION
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
