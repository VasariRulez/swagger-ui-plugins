/**
 * @file swagger-signalr-tester.js
 * @summary SignalR Real-Time Hub Testing and Monitoring plugin for Swagger UI (OpenAPI / ASP.NET Core).
 *          Allows developers to connect to any SignalR Hub, authenticate with the active Bearer token,
 *          invoke remote server methods, and monitor real-time broadcast events with formatted JSON.
 *
 * --- CORE FEATURES & GENERIC ARCHITECTURE ---
 * 1. 100% Generic & Agnostic:
 *    - Configurable hub routes and event listeners without hardcoded domain bindings.
 *    - Allows typing any Hub URL or selecting from configurable host presets.
 * 2. Automatic Bearer Token Authentication:
 *    - Discovers active access token from Swagger UI Redux store or interceptor.
 *    - Passes token via both `accessTokenFactory` and query parameter `?access_token=...`.
 * 3. Flexible Remote Method Invocation:
 *    - Invokes remote methods with JSON arguments and tracks round-trip latency (ms).
 * 4. Dynamic Broadcast Event Listeners:
 *    - Dynamically registers listeners for any event name and formats incoming payloads.
 * 5. Interactive Live Drawer Console:
 *    - Right-hand slide-out drawer seamlessly coordinated with Swagger UI layout.
 *    - Color-coded log badges, filtering, and 1-click clipboard export.
 * 6. Theme Integration:
 *    - Synchronized with Swagger UI Light and Dark modes.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. GENERAL CONFIGURATION (Host Injection & Defaults)
    // =========================================================================
    const userConfig = window.SwaggerSignalRConfig || {};

    const CONFIG = {
        /** Suggested Hub presets in dropdown (users can also type custom paths directly) */
        DEFAULT_HUB_PRESETS: Array.isArray(userConfig.hubs) && userConfig.hubs.length > 0
            ? userConfig.hubs.map((h) => ({ label: h.name || h.label || h.url || h.path, path: h.url || h.path }))
            : [
                { label: "Notifications Hub", path: "/hubs/notifications" },
                { label: "Chat Hub", path: "/hubs/chat" },
                { label: "Live Telemetry Hub", path: "/hubs/telemetry" }
            ],

        /** Suggested broadcast event names for listening */
        DEFAULT_EVENT_LISTENERS: Array.isArray(userConfig.defaultListeners) && userConfig.defaultListeners.length > 0
            ? userConfig.defaultListeners
            : [
                "ReceiveMessage",
                "ReceiveNotification",
                "Heartbeat",
                "UserJoined",
                "DataUpdated"
            ],

        /** Transport protocol preference: "WebSockets" | "LongPolling" | "ServerSentEvents" */
        TRANSPORT: userConfig.transport || "WebSockets",

        /** Automatic reconnection toggle (default: true) */
        AUTO_RECONNECT: userConfig.autoReconnect !== false,

        /** Activity Bar sort order priority (lower values on top; defaults to 30) */
        ACTIVITY_BAR_ORDER: typeof userConfig.activityBarOrder === "number" ? userConfig.activityBarOrder : 30,

        /** LocalStorage persistence keys */
        STORAGE_KEYS: {
            LAST_HUB: "swp_signalr_last_hub",
            RECENT_HUBS: "swp_signalr_recent_hubs",
            SAVED_LISTENERS: "swp_signalr_listeners",
            CUSTOM_INVOKES: "swp_signalr_custom_invokes",
            DRAWER_OPEN: "swp_signalr_drawer_open"
        },

        /** ID elementi DOM */
        ELEMENT_IDS: {
            TRIGGER_BTN: "swagger-signalr-trigger-btn",
            DRAWER: "swagger-signalr-drawer",
            STYLES: "swagger-signalr-styles"
        },

        /** Massimo numero di voci mantenute nel log attività per evitare sovraccarico di memoria */
        MAX_LOG_ENTRIES: 150
    };

    // =========================================================================
    // 1.1 INTERNATIONALIZATION (i18n) ENGINE & DICTIONARIES
    // =========================================================================
    const I18N = {
        en: {
            activityBarTitle: "SignalR Live Hub Tester",
            activityBarAria: "SignalR Tester",
            fallbackTriggerTitle: "SignalR Live Hub Tester (Open / Close Console)",
            drawerTitle: "SignalR Hub Tester Console",
            closeDrawerTitle: "Close console (ESC)",
            statusDisconnected: "DISCONNECTED",
            statusConnecting: "CONNECTING...",
            statusConnected: "CONNECTED",
            statusReconnecting: "RECONNECTING...",
            connectedTo: "Connected to: {url}",
            sectionConn: "1. Hub Connection",
            sectionConnToggle: "Click to expand / collapse",
            hubPathLabel: "Hub Path (URL or Preset):",
            selectHubPlaceholder: "-- Select a suggested or recent Hub --",
            optgroupPredefined: "Predefined Hubs",
            optgroupRecent: "My Recent / Custom Hubs",
            tokenActive: "Active Token detected ✓",
            tokenAnonymous: "No token (Anonymous)",
            useAuthLabel: "Send active application Bearer Token",
            connectBtn: "▶ Connect",
            disconnectBtn: "⏹ Disconnect",
            sectionInvoke: "2. Method Invocation (Client to Server)",
            methodNamePlaceholder: "Method Name (e.g. JoinGroup, SendMessage)",
            invokeBtn: "🚀 Invoke",
            jsonArgsLabel: "JSON Arguments (Array, e.g. [\"value\"] or [{\"id\": \"...\"}]):",
            sectionListen: "3. Broadcast Event Listeners",
            activeBadge: "{count} active",
            newListenerPlaceholder: "Event name (e.g. ReceiveTestMessage)",
            addListenerBtn: "+ Listen",
            removeListenerTitle: "Remove listener",
            sectionLog: "4. Real-Time Activity Log",
            copyLogBtn: "📋 Copy",
            clearLogBtn: "🗑 Clear",
            emptyLog: "No events recorded. Connect to a Hub to begin.",
            logCopied: "✓ Copied to clipboard!",
            connectingMsg: "Connecting to {url}...",
            connectedMsg: "Connection established (ID: {id})",
            disconnectedMsg: "Disconnected from Hub",
            reconnectingMsg: "Connection lost. Attempting reconnection...",
            reconnectedMsg: "Reconnected successfully.",
            errorTitle: "SignalR Error",
            alertSpecifyMethod: "Please specify the method name.",
            alertInvalidJsonArgs: 'Arguments must be formatted as valid JSON (e.g. ["value"] or [123]).',
            logSignalRNotLoaded: "SignalR library not loaded on page. Unable to establish connection.",
            logSpecifyHubUrl: "Please specify a valid URL or path for the Hub.",
            logConnecting: "Connecting to {url}...",
            logReconnecting: "Automatic reconnection in progress... {error}",
            logReconnected: "Reconnected successfully! New ConnectionId: {id}",
            logConnectionInterrupted: "Connection interrupted by server: {error}",
            logConnectionClosed: "Connection closed normally.",
            logConnectedSuccess: "Connected successfully to Hub! ConnectionId: {id}",
            logConnectionError: "Error connecting to Hub: {error}",
            logDisconnecting: "Disconnecting...",
            logInvokeNotConnected: "Unable to invoke method: SignalR connection is not active.",
            logSpecifyMethod: "Please specify the method name to invoke.",
            logSendingInvoke: "Sending invoke '{name}' with arguments:",
            logInvokeResponse: "Response from '{name}' (⏱ {ms}ms):",
            logVoidCompleted: "void (completed)",
            logInvokeError: "Error invoking '{name}' (⏱ {ms}ms): {error}",
            logEventReceived: "Event received: '{event}'",
            logListeningEvent: "Listening to event '{event}'.",
            logRemovedEvent: "Stopped listening to event '{event}'."
        },
        it: {
            activityBarTitle: "SignalR Live Hub Tester",
            activityBarAria: "SignalR Tester",
            fallbackTriggerTitle: "SignalR Live Hub Tester (Apri / Chiudi Console)",
            drawerTitle: "Console SignalR Hub Tester",
            closeDrawerTitle: "Chiudi console (ESC)",
            statusDisconnected: "DISCONNESSO",
            statusConnecting: "CONNESSIONE...",
            statusConnected: "CONNESSO",
            statusReconnecting: "RICONNESSIONE...",
            connectedTo: "Connesso a: {url}",
            sectionConn: "1. Connessione all'Hub",
            sectionConnToggle: "Clicca per espandere / collassare",
            hubPathLabel: "Percorso Hub (URL o Preset):",
            selectHubPlaceholder: "-- Seleziona un Hub suggerito o recente --",
            optgroupPredefined: "Hub Predefiniti",
            optgroupRecent: "I Miei Hub Recenti / Custom",
            tokenActive: "Token attivo rilevato ✓",
            tokenAnonymous: "Nessun token (Anonimo)",
            useAuthLabel: "Invia Bearer Token applicativo attivo",
            connectBtn: "▶ Connetti",
            disconnectBtn: "⏹ Disconnetti",
            sectionInvoke: "2. Invocazione Metodi (Client verso Server)",
            methodNamePlaceholder: "Nome Metodo (es. JoinGroup, SendMessage)",
            invokeBtn: "🚀 Invoca",
            jsonArgsLabel: "Argomenti JSON (Array, es. [\"valore\"] o [{\"id\": \"...\"}]):",
            sectionListen: "3. Eventi in Ascolto (Broadcast Ricevuti)",
            activeBadge: "{count} attivi",
            newListenerPlaceholder: "Nome evento (es. ReceiveTestMessage)",
            addListenerBtn: "+ Ascolta",
            removeListenerTitle: "Rimuovi ascolto",
            sectionLog: "4. Log Attività in Tempo Reale",
            copyLogBtn: "📋 Copia",
            clearLogBtn: "🗑 Pulisci",
            emptyLog: "Nessun evento registrato. Connettiti a un Hub per iniziare.",
            logCopied: "✓ Copiato negli appunti!",
            connectingMsg: "Connessione in corso a {url}...",
            connectedMsg: "Connessione stabilita (ID: {id})",
            disconnectedMsg: "Disconnesso dall'Hub",
            reconnectingMsg: "Connessione interrotta. Tentativo di riconnessione...",
            reconnectedMsg: "Riconnessione completata con successo.",
            errorTitle: "Errore SignalR",
            alertSpecifyMethod: "Specificare il nome del metodo da invocare.",
            alertInvalidJsonArgs: "Gli argomenti devono essere formattati come JSON valido (es. [\"valore\"] o [123]).",
            logSignalRNotLoaded: "Libreria SignalR non caricata in pagina. Impossibile stabilire la connessione.",
            logSpecifyHubUrl: "Specificare un URL o percorso valido per l'Hub.",
            logConnecting: "Connessione in corso a {url}...",
            logReconnecting: "Riconnessione automatica in corso... {error}",
            logReconnected: "Riconnesso con successo! Nuovo ConnectionId: {id}",
            logConnectionInterrupted: "Connessione interrotta dal server: {error}",
            logConnectionClosed: "Connessione chiusa regolarmente.",
            logConnectedSuccess: "Connesso con successo all'Hub! ConnectionId: {id}",
            logConnectionError: "Errore durante la connessione all'Hub: {error}",
            logDisconnecting: "Disconnessione in corso...",
            logInvokeNotConnected: "Impossibile invocare il metodo: connessione SignalR non attiva.",
            logSpecifyMethod: "Specificare il nome del metodo da invocare.",
            logSendingInvoke: "Invio invoke '{name}' con argomenti:",
            logInvokeResponse: "Risposta da '{name}' (⏱ {ms}ms):",
            logVoidCompleted: "void (completato)",
            logInvokeError: "Errore invocazione '{name}' (⏱ {ms}ms): {error}",
            logEventReceived: "Evento ricevuto: '{event}'",
            logListeningEvent: "In ascolto dell'evento '{event}'.",
            logRemovedEvent: "Rimosso ascolto dell'evento '{event}'."
        }
    };

    /**
     * Resolves the active language code.
     * @returns {"en"|"it"}
     */
    function getActiveLocale() {
        const stored = localStorage.getItem("swp_swagger_i18n_locale");
        if (stored === "it" || stored === "en") return stored;
        if (userConfig.locale === "it" || userConfig.locale === "en") return userConfig.locale;
        if (window.SwaggerI18nConfig && (window.SwaggerI18nConfig.locale === "it" || window.SwaggerI18nConfig.locale === "en")) {
            return window.SwaggerI18nConfig.locale;
        }
        if (window.SwaggerI18nConfig && window.SwaggerI18nConfig.autoDetect && typeof document !== "undefined") {
            const docLang = (document.documentElement.lang || "").toLowerCase();
            if (docLang.startsWith("it")) return "it";
        }
        return "en";
    }

    /**
     * Translates a message key into current locale with parameter substitution and fallback.
     */
    function t(key, defaultText, params = {}) {
        const locale = getActiveLocale();
        const hostOverrides = (window.SwaggerI18nConfig && window.SwaggerI18nConfig.messages && window.SwaggerI18nConfig.messages[locale]) ||
                              (userConfig.messages && userConfig.messages[locale]);
        let str = (hostOverrides && hostOverrides[key]) ||
                  (I18N[locale] && I18N[locale][key]) ||
                  (I18N["en"] && I18N["en][key"]) ||
                  defaultText;
        if (params && typeof params === "object") {
            for (const [k, v] of Object.entries(params)) {
                str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
            }
        }
        return str;
    }

    // =========================================================================
    // 2. STATO RUNTIME IN-MEMORY
    // =========================================================================
    const state = {
        /** Active SignalR HubConnection instance */
        connection: null,

        /** Stato connessione: "disconnected" | "connecting" | "connected" | "reconnecting" */
        status: "disconnected",

        /** URL dell'hub attualmente configurato */
        currentHubUrl: "",

        /** Lista di eventi attualmente registrati in ascolto */
        activeListeners: new Set(),

        /** Event and message log history */
        logEntries: [],

        /** Timestamp di inizio dell'ultima connessione */
        connectedAt: null,

        /** ID di connessione SignalR assegnato dal server */
        connectionId: null
    };

    // =========================================================================
    // 3. UTILITÀ (Token, Temi, DOM, Formattazione)
    // =========================================================================

    /**
     * Retrieves active application Bearer token directly from Swagger UI Redux store.
     * @returns {string|null}
     */
    function getActiveBearerToken() {
        try {
            const ui = window.ui;
            if (ui && typeof ui.getState === "function") {
                const authState = ui.getState().get("auth")?.get("authorized");
                if (authState) {
                    const bearerAuth = authState.get("Bearer") || authState.get("BearerAuth") || authState.get("MsalAuth");
                    if (bearerAuth) {
                        const tokenVal = bearerAuth.get("value") || bearerAuth.get("token");
                        if (tokenVal) {
                            return typeof tokenVal === "string" ? tokenVal.replace(/^Bearer\s+/i, "") : null;
                        }
                    }
                }
            }
        } catch {
            // Ignore state parsing errors
        }

        return null;
    }

    /**
     * Checks if dark mode is active on the page.
     * @returns {boolean}
     */
    function isDarkModeActive() {
        return (
            document.documentElement.classList.contains("dark-mode") ||
            document.body.classList.contains("dark-mode") ||
            document.querySelector(".dark-mode") !== null
        );
    }

    /**
     * Sanifica una stringa per prevenire iniezioni HTML.
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

    /**
     * Formatta un orario per i log.
     * @param {Date} [date]
     * @returns {string}
     */
    function formatTime(date = new Date()) {
        return date.toTimeString().split(" ")[0] + "." + String(date.getMilliseconds()).padStart(3, "0");
    }

    // =========================================================================
    // 4. SIGNALR CONNECTION MANAGER
    // =========================================================================

    /**
     * Avvia una nuova connessione SignalR verso l'hub specificato.
     * @param {string} hubUrl - Percorso relativo o assoluto (es. "/hubs/lead-notes")
     * @param {boolean} useAuth - Se true, include il Bearer Token attivo
     * @returns {Promise<boolean>}
     */
    async function connectToHub(hubUrl, useAuth = true) {
        if (typeof window.signalR === "undefined") {
            addLog("error", t("logSignalRNotLoaded", "SignalR library not loaded on page. Unable to establish connection."));
            return false;
        }

        if (state.connection) {
            await disconnectFromHub();
        }

        const normalizedUrl = (hubUrl || "").trim();
        if (!normalizedUrl) {
            addLog("error", t("logSpecifyHubUrl", "Please specify a valid URL or path for the Hub."));
            return false;
        }

        updateStatus("connecting");
        addLog("info", t("logConnecting", `Connecting to ${normalizedUrl}...`, { url: normalizedUrl }));

        try {
            const token = useAuth ? getActiveBearerToken() : null;

            // Resolve transport based on user configuration
            let transportType = window.signalR.HttpTransportType.WebSockets | window.signalR.HttpTransportType.LongPolling;
            if (CONFIG.TRANSPORT === "WebSockets") {
                transportType = window.signalR.HttpTransportType.WebSockets;
            } else if (CONFIG.TRANSPORT === "LongPolling") {
                transportType = window.signalR.HttpTransportType.LongPolling;
            } else if (CONFIG.TRANSPORT === "ServerSentEvents") {
                transportType = window.signalR.HttpTransportType.ServerSentEvents;
            }

            const options = {
                transport: transportType
            };

            if (token) {
                options.accessTokenFactory = () => token;
            }

            // Construct full URL (if relative, prefix with window.location.origin)
            const fullUrl = normalizedUrl.startsWith("http")
                ? normalizedUrl
                : `${window.location.origin}${normalizedUrl.startsWith("/") ? "" : "/"}${normalizedUrl}`;

            let builder = new window.signalR.HubConnectionBuilder()
                .withUrl(fullUrl, options)
                .configureLogging(window.signalR.LogLevel.Information);

            if (CONFIG.AUTO_RECONNECT) {
                builder = builder.withAutomaticReconnect([0, 2000, 5000, 10000, 30000]);
            }

            state.connection = builder.build();
            state.currentHubUrl = normalizedUrl;

            // Configure connection lifecycle callbacks
            state.connection.onreconnecting((error) => {
                updateStatus("reconnecting");
                addLog("warn", t("logReconnecting", `Automatic reconnection in progress... ${error ? error.message : ""}`, { error: error ? error.message : "" }));
            });

            state.connection.onreconnected((newConnectionId) => {
                updateStatus("connected");
                state.connectionId = newConnectionId;
                addLog("success", t("logReconnected", `Reconnected successfully! New ConnectionId: ${newConnectionId}`, { id: newConnectionId }));
            });

            state.connection.onclose((error) => {
                updateStatus("disconnected");
                state.connectionId = null;
                if (error) {
                    addLog("error", t("logConnectionInterrupted", `Connection interrupted by server: ${error.message}`, { error: error.message }));
                } else {
                    addLog("info", t("logConnectionClosed", "Connection closed normally."));
                }
            });

            // Re-iscrive tutti i listener attualmente attivi sulla nuova istanza
            state.activeListeners.forEach((eventName) => {
                bindListenerToConnection(eventName);
            });

            // Start SignalR connection
            await state.connection.start();

            state.connectionId = state.connection.connectionId || "Disponibile";
            state.connectedAt = new Date();
            updateStatus("connected");
            addLog("success", t("logConnectedSuccess", `Connected successfully to Hub! ConnectionId: ${state.connectionId}`, { id: state.connectionId }));

            // Save last used Hub to localStorage and update history
            localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_HUB, normalizedUrl);
            saveRecentHub(normalizedUrl);
            populateHubDropdown();
            return true;
        } catch (error) {
            updateStatus("disconnected");
            state.connection = null;
            addLog("error", t("logConnectionError", `Error connecting to Hub: ${error.message || error}`, { error: error.message || error }));
            return false;
        }
    }

    /**
     * Disconnette l'Hub SignalR attivo.
     * @returns {Promise<void>}
     */
    async function disconnectFromHub() {
        if (!state.connection) {
            updateStatus("disconnected");
            return;
        }

        try {
            addLog("info", t("logDisconnecting", "Disconnecting..."));
            await state.connection.stop();
        } catch (err) {
            console.warn("[SignalR Tester] Error stopping connection:", err);
        } finally {
            state.connection = null;
            state.connectionId = null;
            updateStatus("disconnected");
        }
    }

    /**
     * Invokes a server method via Promise.
     * @param {string} methodName - Remote method name on the Hub
     * @param {any[]} args - Array di parametri
     * @returns {Promise<any>}
     */
    async function invokeHubMethod(methodName, args = []) {
        if (!state.connection || state.status !== "connected") {
            addLog("error", t("logInvokeNotConnected", "Unable to invoke method: SignalR connection is not active."));
            return;
        }

        const name = (methodName || "").trim();
        if (!name) {
            addLog("error", t("logSpecifyMethod", "Please specify the method name to invoke."));
            return;
        }

        const startTime = Date.now();
        addLog("sent", t("logSendingInvoke", `Sending invoke '${name}' with arguments:`, { name }), args);

        try {
            const result = await state.connection.invoke(name, ...args);
            const durationMs = Date.now() - startTime;
            addLog("success", t("logInvokeResponse", `Response from '${name}' (⏱ ${durationMs}ms):`, { name, ms: durationMs }), result !== undefined ? result : t("logVoidCompleted", "void (completed)"));
            return result;
        } catch (error) {
            const durationMs = Date.now() - startTime;
            addLog("error", t("logInvokeError", `Error invoking '${name}' (⏱ ${durationMs}ms): ${error.message || error}`, { name, ms: durationMs, error: error.message || error }));
            throw error;
        }
    }

    /**
     * Attaches an event listener to the active connection.
     * @param {string} eventName
     */
    function bindListenerToConnection(eventName) {
        if (!state.connection) return;

        // Remove any previous handler to avoid duplicates
        state.connection.off(eventName);

        state.connection.on(eventName, (...args) => {
            const payload = args.length === 1 ? args[0] : (args.length === 0 ? null : args);
            addLog("received", t("logEventReceived", `Event received: '${eventName}'`, { event: eventName }), payload);
        });
    }

    /**
     * Registra un nuovo evento da ascoltare in tempo reale.
     * @param {string} eventName
     */
    function registerEventListener(eventName) {
        const name = (eventName || "").trim();
        if (!name) return;

        state.activeListeners.add(name);
        bindListenerToConnection(name);
        saveListenersToStorage();
        renderListenersList();
        addLog("info", t("logListeningEvent", `Listening to event '${name}'.`, { event: name }));
    }

    /**
     * Unregisters an event listener.
     * @param {string} eventName
     */
    function unregisterEventListener(eventName) {
        state.activeListeners.delete(eventName);
        if (state.connection) {
            state.connection.off(eventName);
        }
        saveListenersToStorage();
        renderListenersList();
        addLog("info", t("logRemovedEvent", `Stopped listening to event '${eventName}'.`, { event: eventName }));
    }

    /**
     * Saves configured listeners to localStorage.
     */
    function saveListenersToStorage() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.SAVED_LISTENERS, JSON.stringify([...state.activeListeners]));
        } catch {
            // Ignora storage pieno
        }
    }

    /**
     * Loads persisted listeners from localStorage.
     */
    function loadListenersFromStorage() {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.SAVED_LISTENERS);
            if (raw) {
                const list = JSON.parse(raw);
                if (Array.isArray(list)) {
                    list.forEach((name) => state.activeListeners.add(name));
                    return;
                }
            }
        } catch {
            // Ignora errori di parsing
        }

        // Se vuoto, carica i default
        CONFIG.DEFAULT_EVENT_LISTENERS.forEach((name) => state.activeListeners.add(name));
    }

    /**
     * Loads recent/custom Hub URLs from localStorage.
     * @returns {string[]}
     */
    function loadRecentHubs() {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.RECENT_HUBS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch {
            // Ignora errori di parsing
        }
        return [];
    }

    /**
     * Adds Hub URL to recent history avoiding duplicates.
     * @param {string} hubUrl
     */
    function saveRecentHub(hubUrl) {
        if (!hubUrl || typeof hubUrl !== "string") return;
        const normalized = hubUrl.trim();
        if (!normalized) return;

        // If already present among default presets, skip saving to custom
        const isDefault = CONFIG.DEFAULT_HUB_PRESETS.some((p) => p.path.toLowerCase() === normalized.toLowerCase());
        if (isDefault) return;

        let recents = loadRecentHubs().filter((p) => p.toLowerCase() !== normalized.toLowerCase());
        recents.unshift(normalized);
        if (recents.length > 10) recents = recents.slice(0, 10);

        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.RECENT_HUBS, JSON.stringify(recents));
        } catch {
            // Storage pieno
        }
    }

    /**
     * Dynamically populates Hub dropdown (Defaults + User recents).
     */
    function populateHubDropdown() {
        const select = document.getElementById("signalr-preset-select");
        if (!select) return;

        const currentVal = select.value;
        const recentHubs = loadRecentHubs();

        let html = `<option value="">${t("selectHubPlaceholder", "-- Select a suggested or recent Hub --")}</option>`;

        // Gruppo 1: Predefiniti
        html += `<optgroup label="${t("optgroupPredefined", "Predefined Hubs")}">`;
        CONFIG.DEFAULT_HUB_PRESETS.forEach((preset) => {
            html += `<option value="${escapeHtml(preset.path)}">${escapeHtml(preset.label)} (${escapeHtml(preset.path)})</option>`;
        });
        html += `</optgroup>`;

        // Gruppo 2: Recenti dell'utente (se presenti)
        if (recentHubs.length > 0) {
            html += `<optgroup label="${t("optgroupRecent", "My Recent / Custom Hubs")}">`;
            recentHubs.forEach((hubPath) => {
                html += `<option value="${escapeHtml(hubPath)}">🔗 ${escapeHtml(hubPath)}</option>`;
            });
            html += `</optgroup>`;
        }

        select.innerHTML = html;
        if (currentVal) {
            select.value = currentVal;
        }
    }

    // =========================================================================
    // 5. GESTIONE DEI LOG
    // =========================================================================

    /**
     * Adds entry to activity log and updates view.
     * @param {"info"|"success"|"warn"|"error"|"sent"|"received"} type
     * @param {string} message
     * @param {any} [payload]
     */
    function addLog(type, message, payload = null) {
        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
            type: type,
            time: formatTime(),
            message: message,
            payload: payload
        };

        state.logEntries.push(entry);

        if (state.logEntries.length > CONFIG.MAX_LOG_ENTRIES) {
            state.logEntries.shift();
        }

        appendLogToDom(entry);
    }

    /**
     * Pulisce l'intero storico dei log.
     */
    function clearLogs() {
        state.logEntries = [];
        const container = document.getElementById("signalr-log-stream");
        if (container) {
            container.innerHTML = `<div class="signalr-log-empty">No events recorded. Connect to a Hub to begin.</div>`;
        }
    }

    // =========================================================================
    // 6. STILI CSS ADATTIVI (Light e Dark Mode)
    // =========================================================================

    function injectStyles() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.STYLES)) return;

        const style = document.createElement("style");
        style.id = CONFIG.ELEMENT_IDS.STYLES;
        style.textContent = `
            /* =========================================================================
               SWAGGER SIGNALR TESTER - STILI GRAFICI ADATTIVI
               ========================================================================= */

            /* --- Ridimensionamento Dinamico del Corpo di Swagger UI per il Drawer SignalR --- */
            body {
                transition: padding-right 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
            }

            body.signalr-drawer-open {
                padding-right: 480px !important;
            }

            @media (max-width: 960px) {
                body.signalr-drawer-open {
                    padding-right: 0 !important;
                }
            }

            /* --- Fallback Trigger Button (se Activity Bar assente) --- */
            .signalr-fallback-trigger-btn {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                height: 38px;
                padding: 0 14px;
                border-radius: 4px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #0f172a;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                margin-left: 10px;
                transition: all 0.15s ease;
                box-sizing: border-box;
            }

            .signalr-fallback-trigger-btn:hover {
                background: #f1f5f9;
                border-color: #0284c7;
                color: #0284c7;
            }

            .signalr-fallback-trigger-btn.is-active {
                background: #e0f2fe;
                border-color: #0284c7;
                color: #0284c7;
            }

            html.dark-mode .signalr-fallback-trigger-btn,
            body.dark-mode .signalr-fallback-trigger-btn {
                background: #202020;
                border-color: #383838;
                color: #f5f5f5;
            }

            html.dark-mode .signalr-fallback-trigger-btn:hover {
                border-color: #49cc90;
                color: #49cc90;
                background: #262626;
            }

            html.dark-mode .signalr-fallback-trigger-btn.is-active {
                border-color: #49cc90;
                color: #49cc90;
                background: #1a2e22;
            }

            /* --- Icone e Badge SignalR ad Alta Visibilità (SVG + Status LED) --- */
            .signalr-icon-wrap {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            .signalr-icon-wrap svg {
                display: block;
                stroke: currentColor;
            }

            .signalr-icon-wrap .signalr-status-dot {
                position: absolute;
                bottom: -2px;
                right: -4px;
                border: 2px solid #f8fafc;
            }

            html.dark-mode .signalr-icon-wrap .signalr-status-dot {
                border-color: #181818;
            }

            /* Badge indicatore di stato connessione */
            .signalr-status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
                transition: background-color 0.2s ease, box-shadow 0.2s ease;
            }

            .signalr-status-dot--disconnected {
                background-color: #94a3b8;
                box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.25);
            }

            .signalr-status-dot--connecting {
                background-color: #f59e0b;
                box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.35);
                animation: signalrPulse 1.2s infinite;
            }

            .signalr-status-dot--connected {
                background-color: #10b981;
                box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.4);
            }

            @keyframes signalrPulse {
                0% { opacity: 0.6; transform: scale(0.9); }
                50% { opacity: 1; transform: scale(1.15); }
                100% { opacity: 0.6; transform: scale(0.9); }
            }

            /* --- Drawer Laterale Console SignalR --- */
            #${CONFIG.ELEMENT_IDS.DRAWER} {
                --sig-bg: #ffffff;
                --sig-bg-card: #f8fafc;
                --sig-bg-input: #ffffff;
                --sig-border: #cbd5e1;
                --sig-border-light: #e2e8f0;
                --sig-text: #0f172a;
                --sig-text-muted: #64748b;
                --sig-log-bg: #0f172a;
                --sig-log-text: #f8fafc;

                position: fixed;
                top: 0;
                right: -510px;
                width: 480px;
                max-width: 95vw;
                height: 100vh;
                max-height: 100vh;
                overflow: hidden;
                background: var(--sig-bg);
                color: var(--sig-text);
                border-left: 1px solid var(--sig-border);
                box-shadow: -8px 0 25px rgba(0, 0, 0, 0.15);
                z-index: 999998;
                display: flex;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                transition: right 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                box-sizing: border-box;
            }

            #${CONFIG.ELEMENT_IDS.DRAWER}.is-open {
                right: 0;
            }

            /* Drawer in Tema Scuro */
            html.dark-mode #${CONFIG.ELEMENT_IDS.DRAWER},
            body.dark-mode #${CONFIG.ELEMENT_IDS.DRAWER} {
                --sig-bg: #181818;
                --sig-bg-card: #202020;
                --sig-bg-input: #262626;
                --sig-border: #383838;
                --sig-border-light: #2d2d2d;
                --sig-text: #f5f5f5;
                --sig-text-muted: #94a3b8;
                --sig-log-bg: #111111;
                --sig-log-text: #f1f5f9;
                box-shadow: -8px 0 30px rgba(0, 0, 0, 0.6);
            }

            /* --- Header Drawer --- */
            .signalr-drawer-header {
                padding: 12px 16px;
                border-bottom: 1px solid var(--sig-border);
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: var(--sig-bg-card);
                flex-shrink: 0;
                box-sizing: border-box;
            }

            .signalr-header-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                font-weight: 700;
            }

            .signalr-btn-close {
                background: none;
                border: none;
                color: var(--sig-text-muted);
                cursor: pointer;
                font-size: 18px;
                padding: 4px;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            .signalr-btn-close:hover {
                color: var(--sig-text);
                background: var(--sig-border-light);
            }

            /* --- Body Drawer con Sezioni (Scroll verticale garantito a qualsiasi risoluzione/zoom) --- */
            .signalr-drawer-body {
                flex: 1 1 auto;
                min-height: 0;
                max-height: calc(100vh - 52px);
                overflow-y: auto;
                overflow-x: hidden;
                box-sizing: border-box;
                padding: 12px 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .signalr-section {
                background: var(--sig-bg-card);
                border: 1px solid var(--sig-border-light);
                border-radius: 8px;
                padding: 10px 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                flex-shrink: 0;
                box-sizing: border-box;
                max-width: 100%;
                transition: background 0.15s ease, border-color 0.15s ease;
            }

            .signalr-section--log {
                flex: 1 1 auto;
                min-height: 180px;
                display: flex;
                flex-direction: column;
            }

            .signalr-section-title {
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--sig-text-muted);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            /* Intestazione Collassabile Sezioni */
            .signalr-section-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: pointer;
                user-select: none;
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--sig-text-muted);
                padding: 2px 0;
                transition: color 0.15s ease;
            }

            .signalr-section-header:hover {
                color: var(--sig-text);
            }

            .signalr-section-title-wrap {
                display: flex;
                align-items: center;
                gap: 7px;
            }

            .signalr-collapse-icon {
                display: inline-block;
                font-size: 10px;
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                width: 12px;
                text-align: center;
                color: var(--sig-text-muted);
            }

            .signalr-section.is-collapsed .signalr-collapse-icon {
                transform: rotate(-90deg);
            }

            .signalr-section.is-collapsed .signalr-section-content {
                display: none;
            }

            .signalr-section-content {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .signalr-summary-chip {
                font-size: 10px;
                font-weight: 600;
                padding: 1px 7px;
                border-radius: 10px;
                background: var(--sig-border-light);
                color: var(--sig-text-muted);
                text-transform: none;
                letter-spacing: normal;
            }

            /* Input e Controlli */
            .signalr-input, .signalr-select, .signalr-textarea {
                width: 100%;
                box-sizing: border-box;
                padding: 6px 10px;
                border-radius: 5px;
                border: 1px solid var(--sig-border);
                background: var(--sig-bg-input);
                color: var(--sig-text);
                font-size: 12px;
                font-family: inherit;
                outline: none;
                transition: border-color 0.15s ease;
            }

            .signalr-input:focus, .signalr-select:focus, .signalr-textarea:focus {
                border-color: #0284c7;
            }

            html.dark-mode .signalr-input:focus,
            html.dark-mode .signalr-select:focus,
            html.dark-mode .signalr-textarea:focus {
                border-color: #49cc90;
            }

            .signalr-textarea {
                font-family: "Cascadia Code", Consolas, "Courier New", monospace;
                font-size: 11px;
                resize: vertical;
                min-height: 56px;
            }

            /* Pulsanti Comuni */
            .signalr-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                height: 30px;
                padding: 0 12px;
                border-radius: 5px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                border: 1px solid var(--sig-border);
                background: var(--sig-bg);
                color: var(--sig-text);
                transition: all 0.15s ease;
                user-select: none;
            }

            .signalr-btn:hover {
                background: var(--sig-border-light);
            }

            .signalr-btn-primary {
                background: #0284c7;
                color: #ffffff;
                border-color: #0284c7;
            }

            .signalr-btn-primary:hover {
                background: #0369a1;
            }

            html.dark-mode .signalr-btn-primary {
                background: #49cc90;
                color: #111111;
                border-color: #49cc90;
            }

            html.dark-mode .signalr-btn-primary:hover {
                background: #3cb87e;
            }

            .signalr-btn-danger {
                background: #ef4444;
                color: #ffffff;
                border-color: #ef4444;
            }

            .signalr-btn-danger:hover {
                background: #dc2626;
            }

            /* Badge Tag Listener */
            .signalr-tags-container {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                max-height: 80px;
                overflow-y: auto;
            }

            .signalr-tag {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                background: var(--sig-border-light);
                color: var(--sig-text);
            }

            .signalr-tag-del {
                cursor: pointer;
                color: var(--sig-text-muted);
                font-weight: bold;
            }

            .signalr-tag-del:hover {
                color: #ef4444;
            }

            /* --- Sezione Log Stream --- */
            .signalr-log-stream {
                flex: 1 1 auto;
                min-height: 120px;
                max-height: none;
                background: var(--sig-log-bg);
                color: var(--sig-log-text);
                border-radius: 6px;
                padding: 10px;
                font-family: "Cascadia Code", Consolas, "Courier New", monospace;
                font-size: 11px;
                overflow-y: auto;
                overflow-x: hidden;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .signalr-log-empty {
                color: #64748b;
                text-align: center;
                padding: 20px 0;
                font-style: italic;
            }

            .signalr-log-entry {
                line-height: 1.4;
                padding: 4px 6px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.03);
                border-left: 3px solid transparent;
                word-break: break-all;
                overflow-wrap: anywhere;
                max-width: 100%;
                box-sizing: border-box;
            }

            .signalr-log-entry--info { border-left-color: #38bdf8; }
            .signalr-log-entry--success { border-left-color: #4ade80; }
            .signalr-log-entry--warn { border-left-color: #facc15; }
            .signalr-log-entry--error { border-left-color: #f87171; color: #fca5a5; }
            .signalr-log-entry--sent { border-left-color: #c084fc; }
            .signalr-log-entry--received { border-left-color: #34d399; }

            .signalr-log-time {
                color: #64748b;
                font-size: 10px;
                margin-right: 6px;
            }

            .signalr-log-payload {
                margin-top: 4px;
                padding: 6px 8px;
                background: rgba(0, 0, 0, 0.35);
                border-radius: 4px;
                overflow-x: auto;
                white-space: pre-wrap;
                word-break: break-all;
                overflow-wrap: anywhere;
                max-width: 100%;
                box-sizing: border-box;
                color: #e2e8f0;
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================================================
    // 7. UI RENDERING
    // =========================================================================

    /**
     * Registra il trigger SignalR nell'Activity Bar se disponibile,
     * otherwise falls back to standard page button.
     */
    function setupTrigger() {
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerItem === "function") {
            // Remove previously injected fallback if present
            const fallbackBtn = document.getElementById(CONFIG.ELEMENT_IDS.TRIGGER_BTN);
            if (fallbackBtn && !fallbackBtn.closest("#swagger-activity-bar")) {
                fallbackBtn.remove();
            }

            const drawer = document.getElementById(CONFIG.ELEMENT_IDS.DRAWER);
            const isDrawerOpen = drawer?.classList.contains("is-open") || false;

            window.SwaggerActivityBar.registerItem({
                id: "signalr-tester",
                title: t("activityBarTitle", "SignalR Live Hub Tester"),
                ariaLabel: t("activityBarAria", "SignalR Tester"),
                ariaLabel: "SignalR Live Hub Tester",
                iconHtml: `
                    <span class="signalr-icon-wrap">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4.93 19.07a10 10 0 0 1 0-14.14"/>
                            <path d="M7.76 16.24a6 6 0 0 1 0-8.48"/>
                            <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
                            <path d="M16.24 7.76a6 6 0 0 1 0 8.48"/>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                        </svg>
                        <span class="signalr-status-dot signalr-status-dot--${state.status}"></span>
                    </span>
                `,
                onClick: toggleDrawer,
                section: "top",
                order: CONFIG.ACTIVITY_BAR_ORDER,
                isActive: isDrawerOpen
            });
            return;
        }

        // Fallback: inject standard button into Swagger UI if Activity Bar is absent
        renderFallbackTriggerButton();
    }

    /**
     * Renders fallback trigger button in Swagger UI if Activity Bar is absent.
     */
    function renderFallbackTriggerButton() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.TRIGGER_BTN)) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = CONFIG.ELEMENT_IDS.TRIGGER_BTN;
        btn.className = "signalr-fallback-trigger-btn";
        btn.title = "SignalR Live Hub Tester (Open / Close Console)";
        btn.innerHTML = `
            <span class="signalr-status-dot signalr-status-dot--${state.status}"></span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;">
                <path d="M4.93 19.07a10 10 0 0 1 0-14.14"/>
                <path d="M7.76 16.24a6 6 0 0 1 0-8.48"/>
                <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
                <path d="M16.24 7.76a6 6 0 0 1 0 8.48"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            <span>SignalR Tester</span>
        `;

        btn.addEventListener("click", toggleDrawer);

        // Posizionamento: vicino ad Authorize (.scheme-container .schemes) o sotto info-container
        const schemesWrapper = document.querySelector(".swagger-ui .scheme-container .schemes");
        if (schemesWrapper) {
            schemesWrapper.appendChild(btn);
            return;
        }

        const topbarWrapper = document.querySelector(".swagger-ui .topbar .topbar-wrapper");
        if (topbarWrapper) {
            topbarWrapper.appendChild(btn);
            return;
        }

        const infoContainer = document.querySelector(".swagger-ui .information-container");
        if (infoContainer && infoContainer.parentNode) {
            infoContainer.parentNode.insertBefore(btn, infoContainer.nextSibling);
        }
    }

    /**
     * Injects SignalR console drawer into DOM.
     */
    function renderDrawer() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.DRAWER)) return;

        const drawer = document.createElement("div");
        drawer.id = CONFIG.ELEMENT_IDS.DRAWER;

        const lastHub = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_HUB) || CONFIG.DEFAULT_HUB_PRESETS[0].path;

        let presetOptions = `<option value="">-- Seleziona un Hub suggerito --</option>`;
        CONFIG.DEFAULT_HUB_PRESETS.forEach((preset) => {
            presetOptions += `<option value="${escapeHtml(preset.path)}">${escapeHtml(preset.label)} (${escapeHtml(preset.path)})</option>`;
        });

        drawer.innerHTML = `
                        <div class="signalr-drawer-header">
                <div class="signalr-header-title">
                    <span class="signalr-status-dot signalr-status-dot--disconnected"></span>
                    <span class="swp-sig-title">${t("drawerTitle", "SignalR Hub Tester Console")}</span>
                </div>
                <button type="button" class="signalr-btn-close btn-close-drawer" title="${t("closeDrawerTitle", "Close console (ESC)")}">✕</button>
            </div>

            <div class="signalr-drawer-body">
                <!-- Sezione 1: Configurazione Connessione (Collassabile) -->
                <div class="signalr-section signalr-section--collapsible" id="signalr-sec-conn">
                    <div class="signalr-section-header" data-toggle="signalr-sec-conn" title="${t("sectionConnToggle", "Click to expand / collapse")}">
                        <div class="signalr-section-title-wrap">
                            <span class="signalr-collapse-icon">▼</span>
                            <span class="swp-sig-sec-conn-title">${t("sectionConn", "1. Hub Connection")}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span id="signalr-hub-active-chip" class="signalr-summary-chip" style="display:none; max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
                            <span id="signalr-conn-status-badge" style="font-size:10px; font-weight:600; color:#94a3b8;">${t("statusDisconnected", "DISCONNECTED")}</span>
                        </div>
                    </div>

                    <div class="signalr-section-content">
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <label class="swp-sig-hub-label" style="font-size:11px; font-weight:600;">${t("hubPathLabel", "Hub Path (URL or Preset):")}</label>
                            <select id="signalr-preset-select" class="signalr-select">
                                ${presetOptions}
                            </select>
                            <input id="signalr-hub-url-input" class="signalr-input" type="text" placeholder="/hubs/..." value="${escapeHtml(lastHub)}" />
                        </div>

                        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px;">
                            <label style="display:inline-flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;">
                                <input type="checkbox" id="signalr-use-auth-cb" checked />
                                <span class="swp-sig-use-auth">${t("useAuthLabel", "Send active application Bearer Token")}</span>
                            </label>
                            <span id="signalr-token-indicator" style="font-size:10px; color:#10b981; font-weight:600;">${t("tokenActive", "Active Token detected ✓")}</span>
                        </div>

                        <div style="display:flex; gap:8px; margin-top:6px;">
                            <button type="button" id="signalr-btn-connect" class="signalr-btn signalr-btn-primary" style="flex:1;">
                                ${t("connectBtn", "▶ Connect")}
                            </button>
                            <button type="button" id="signalr-btn-disconnect" class="signalr-btn signalr-btn-danger" style="display:none; flex:1;">
                                ${t("disconnectBtn", "⏹ Disconnect")}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Sezione 2: Invocazione Metodi (Collassabile) -->
                <div class="signalr-section signalr-section--collapsible" id="signalr-sec-invoke">
                    <div class="signalr-section-header" data-toggle="signalr-sec-invoke" title="${t("sectionConnToggle", "Click to expand / collapse")}">
                        <div class="signalr-section-title-wrap">
                            <span class="signalr-collapse-icon">▼</span>
                            <span class="swp-sig-sec-invoke-title">${t("sectionInvoke", "2. Invoke Method (Client -> Hub)")}</span>
                        </div>
                        <span id="signalr-invoke-summary-badge" class="signalr-summary-chip" style="display:none;"></span>
                    </div>

                    <div class="signalr-section-content">
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <div style="display:flex; gap:6px;">
                                <input id="signalr-method-name-input" class="signalr-input" type="text" placeholder="${t("methodNamePlaceholder", "Method Name (e.g. JoinGroup, SendMessage)")}" style="flex:1;" />
                                <button type="button" id="signalr-btn-invoke" class="signalr-btn signalr-btn-primary">
                                    ${t("invokeBtn", "🚀 Invoke")}
                                </button>
                            </div>
                            <label class="swp-sig-json-args-label" style="font-size:10px; color:var(--sig-text-muted);">${t("jsonArgsLabel", 'JSON Arguments (Array, e.g. ["value"] or [{"id": "..."}]):')}</label>
                            <textarea id="signalr-args-input" class="signalr-textarea" placeholder='["Arg1", 123]'></textarea>
                        </div>
                    </div>
                </div>

                <!-- Sezione 3: Event Listeners (Collassabile) -->
                <div class="signalr-section signalr-section--collapsible" id="signalr-sec-listen">
                    <div class="signalr-section-header" data-toggle="signalr-sec-listen" title="${t("sectionConnToggle", "Click to expand / collapse")}">
                        <div class="signalr-section-title-wrap">
                            <span class="signalr-collapse-icon">▼</span>
                            <span class="swp-sig-sec-listen-title">${t("sectionListen", "3. Event Listeners (Broadcasts)")}</span>
                        </div>
                        <span id="signalr-listeners-summary-badge" class="signalr-summary-chip">${t("activeBadge", "{count} active", { count: state.activeListeners.size })}</span>
                    </div>

                    <div class="signalr-section-content">
                        <div style="display:flex; gap:6px;">
                            <input id="signalr-new-listener-input" class="signalr-input" type="text" placeholder="${t("newListenerPlaceholder", "Event name (e.g. ReceiveTestMessage)")}" style="flex:1;" />
                            <button type="button" id="signalr-btn-add-listener" class="signalr-btn">
                                ${t("addListenerBtn", "+ Listen")}
                            </button>
                        </div>

                        <div id="signalr-tags-container" class="signalr-tags-container">
                            <!-- Popolato dinamicamente -->
                        </div>
                    </div>
                </div>

                <!-- Section 4: Real-Time Activity Log -->
                <div class="signalr-section signalr-section--log">
                    <div class="signalr-section-title">
                        <span class="swp-sig-sec-log-title">${t("sectionLog", "4. Real-Time Activity Log")}</span>
                        <div style="display:flex; gap:6px;">
                            <button type="button" id="signalr-btn-copy-log" class="signalr-btn" style="height:22px; padding:0 6px; font-size:10px;">${t("copyLogBtn", "📋 Copy")}</button>
                            <button type="button" id="signalr-btn-clear-log" class="signalr-btn" style="height:22px; padding:0 6px; font-size:10px;">${t("clearLogBtn", "🗑 Clear")}</button>
                        </div>
                    </div>

                    <div id="signalr-log-stream" class="signalr-log-stream">
                        <div class="signalr-log-empty">${t("emptyLog", "No events recorded. Connect to a Hub to begin.")}</div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(drawer);
        populateHubDropdown();
        attachDrawerEvents();
        renderListenersList();
        updateTokenIndicator();
    }

    /**
     * Aggancia gli eventi agli elementi del Drawer.
     */
    function attachDrawerEvents() {
        const drawer = document.getElementById(CONFIG.ELEMENT_IDS.DRAWER);
        if (!drawer) return;

        // Toggle sezioni collassabili
        drawer.querySelectorAll(".signalr-section-header").forEach((header) => {
            header.addEventListener("click", () => {
                const secId = header.getAttribute("data-toggle");
                const sec = document.getElementById(secId);
                if (sec) {
                    sec.classList.toggle("is-collapsed");
                }
            });
        });

        // Chiusura drawer
        drawer.querySelector(".btn-close-drawer")?.addEventListener("click", toggleDrawer);

        // Close on ESC key when drawer is open
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && drawer.classList.contains("is-open")) {
                toggleDrawer();
            }
        });

        // Cambio preset dropdown
        const presetSelect = document.getElementById("signalr-preset-select");
        const urlInput = document.getElementById("signalr-hub-url-input");
        presetSelect?.addEventListener("change", () => {
            if (presetSelect.value) {
                urlInput.value = presetSelect.value;
            }
        });

        // Connect button
        const btnConnect = document.getElementById("signalr-btn-connect");
        btnConnect?.addEventListener("click", async () => {
            const hubUrl = urlInput.value.trim();
            const useAuth = document.getElementById("signalr-use-auth-cb")?.checked !== false;
            await connectToHub(hubUrl, useAuth);
        });

        // Disconnect button
        const btnDisconnect = document.getElementById("signalr-btn-disconnect");
        btnDisconnect?.addEventListener("click", async () => {
            await disconnectFromHub();
        });

        // Invoke button
        const btnInvoke = document.getElementById("signalr-btn-invoke");
        const methodInput = document.getElementById("signalr-method-name-input");
        const argsInput = document.getElementById("signalr-args-input");
        const invokeChip = document.getElementById("signalr-invoke-summary-badge");

        const updateInvokeChip = () => {
            const val = methodInput?.value.trim();
            if (invokeChip) {
                if (val) {
                    invokeChip.textContent = val;
                    invokeChip.style.display = "inline-block";
                } else {
                    invokeChip.style.display = "none";
                }
            }
        };
        methodInput?.addEventListener("input", updateInvokeChip);

        btnInvoke?.addEventListener("click", async () => {
            const methodName = methodInput.value.trim();
            if (!methodName) {
                alert(t("alertSpecifyMethod", "Please specify the method name."));
                return;
            }

            let args = [];
            const rawArgs = argsInput.value.trim();
            if (rawArgs) {
                try {
                    const parsed = JSON.parse(rawArgs);
                    args = Array.isArray(parsed) ? parsed : [parsed];
                } catch {
                    alert(t("alertInvalidJsonArgs", 'Arguments must be formatted as valid JSON (e.g. ["value"] or [123]).'));
                    return;
                }
            }

            try {
                await invokeHubMethod(methodName, args);
            } catch {
                // Error already logged via addLog
            }
        });

        // Add Listener button
        const btnAddListener = document.getElementById("signalr-btn-add-listener");
        const newListenerInput = document.getElementById("signalr-new-listener-input");

        const addListenerHandler = () => {
            const name = newListenerInput.value.trim();
            if (name) {
                registerEventListener(name);
                newListenerInput.value = "";
            }
        };

        btnAddListener?.addEventListener("click", addListenerHandler);
        newListenerInput?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                addListenerHandler();
            }
        });

        // Clear Logs button
        document.getElementById("signalr-btn-clear-log")?.addEventListener("click", clearLogs);

        // Copy Logs button
        document.getElementById("signalr-btn-copy-log")?.addEventListener("click", () => {
            if (state.logEntries.length === 0) return;
            const text = state.logEntries
                .map((e) => `[${e.time}] [${e.type.toUpperCase()}] ${e.message} ${e.payload ? JSON.stringify(e.payload) : ""}`)
                .join("\n");
            navigator.clipboard.writeText(text).then(() => alert("Logs copied to clipboard!"));
        });
    }

    /**
     * Rende visibile/invisibile il Drawer laterale e adatta la larghezza del body Swagger.
     * @param {boolean} [forceOpen]
     */
    function toggleDrawer(forceOpen) {
        const drawer = document.getElementById(CONFIG.ELEMENT_IDS.DRAWER);
        if (!drawer) return;

        const isOpen = typeof forceOpen === "boolean" ? forceOpen : !drawer.classList.contains("is-open");
        drawer.classList.toggle("is-open", isOpen);
        document.body.classList.toggle("signalr-drawer-open", isOpen);

        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.setItemActive === "function") {
            window.SwaggerActivityBar.setItemActive("signalr-tester", isOpen);
        }

        document.getElementById(CONFIG.ELEMENT_IDS.TRIGGER_BTN)?.classList.toggle("is-active", isOpen);
        localStorage.setItem(CONFIG.STORAGE_KEYS.DRAWER_OPEN, isOpen ? "true" : "false");

        if (isOpen) {
            updateTokenIndicator();
        }
    }

    /**
     * Updates connection visual state (badges, buttons, indicators).
     * @param {"disconnected"|"connecting"|"connected"|"reconnecting"} newStatus
     */
    function updateStatus(newStatus) {
        state.status = newStatus;

        // Aggiorna pallino nel trigger button
        const triggerDots = document.querySelectorAll(".signalr-status-dot");
        triggerDots.forEach((dot) => {
            dot.className = `signalr-status-dot signalr-status-dot--${newStatus}`;
        });

        // Aggiorna badge testuale e chip Hub attivo nel Drawer
        const statusBadge = document.getElementById("signalr-conn-status-badge");
        const hubChip = document.getElementById("signalr-hub-active-chip");
        if (statusBadge) {
            const statusKey = newStatus === "connected" ? "statusConnected" :
                              newStatus === "connecting" ? "statusConnecting" :
                              newStatus === "reconnecting" ? "statusReconnecting" : "statusDisconnected";
            statusBadge.textContent = t(statusKey, newStatus.toUpperCase());
            if (newStatus === "connected") {
                statusBadge.style.color = "#10b981";
                if (hubChip && state.currentHubUrl) {
                    hubChip.textContent = state.currentHubUrl;
                    hubChip.title = t("connectedTo", `Connected to: ${state.currentHubUrl}`, { url: state.currentHubUrl });
                    hubChip.style.display = "inline-block";
                }
            } else if (newStatus === "connecting" || newStatus === "reconnecting") {
                statusBadge.style.color = "#f59e0b";
                if (hubChip) hubChip.style.display = "none";
            } else {
                statusBadge.style.color = "#94a3b8";
                if (hubChip) hubChip.style.display = "none";
            }
        }

        // Gestione visibilità pulsanti Connetti / Disconnetti
        const btnConnect = document.getElementById("signalr-btn-connect");
        const btnDisconnect = document.getElementById("signalr-btn-disconnect");

        if (btnConnect && btnDisconnect) {
            if (newStatus === "connected" || newStatus === "reconnecting") {
                btnConnect.style.display = "none";
                btnDisconnect.style.display = "inline-flex";
            } else {
                btnConnect.style.display = "inline-flex";
                btnDisconnect.style.display = "none";
            }
        }
    }

    /**
     * Aggiorna l'indicatore di disponibilità del Bearer Token.
     */
    function updateTokenIndicator() {
        const token = getActiveBearerToken();
        const indicator = document.getElementById("signalr-token-indicator");
        if (indicator) {
            if (token) {
                indicator.textContent = t("tokenActive", "Active Token detected ✓");
                indicator.style.color = "#10b981";
            } else {
                indicator.textContent = t("tokenAnonymous", "No token (Anonymous)");
                indicator.style.color = "#f59e0b";
            }
        }
    }

    /**
     * Renders tags for currently registered event listeners.
     */
    function renderListenersList() {
        const container = document.getElementById("signalr-tags-container");
        if (!container) return;

        container.innerHTML = "";

        const listenersBadge = document.getElementById("signalr-listeners-summary-badge");
        if (listenersBadge) {
            listenersBadge.textContent = t("activeBadge", `${state.activeListeners.size} active`, { count: state.activeListeners.size });
        }

        state.activeListeners.forEach((name) => {
            const tag = document.createElement("span");
            tag.className = "signalr-tag";
            tag.innerHTML = `
                <span>${escapeHtml(name)}</span>
                <span class="signalr-tag-del" title="${t("removeListenerTitle", "Remove listener")}">✕</span>
            `;

            tag.querySelector(".signalr-tag-del")?.addEventListener("click", () => {
                unregisterEventListener(name);
            });

            container.appendChild(tag);
        });
    }

    /**
     * Appende un singolo elemento di log nel contenitore DOM con auto-scroll.
     * @param {object} entry
     */
    function appendLogToDom(entry) {
        const container = document.getElementById("signalr-log-stream");
        if (!container) return;

        // Remove empty log state if present
        const emptyMsg = container.querySelector(".signalr-log-empty");
        if (emptyMsg) emptyMsg.remove();

        const el = document.createElement("div");
        el.className = `signalr-log-entry signalr-log-entry--${entry.type}`;

        let payloadHtml = "";
        if (entry.payload !== null && entry.payload !== undefined) {
            const jsonStr = typeof entry.payload === "object" ? JSON.stringify(entry.payload, null, 2) : String(entry.payload);
            payloadHtml = `<div class="signalr-log-payload">${escapeHtml(jsonStr)}</div>`;
        }

        el.innerHTML = `
            <div>
                <span class="signalr-log-time">${escapeHtml(entry.time)}</span>
                <span>${escapeHtml(entry.message)}</span>
            </div>
            ${payloadHtml}
        `;

        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    }

    // =========================================================================
    // 8. PLUGIN INITIALIZATION
    // =========================================================================
    function initialize() {
        const startTime = Date.now();

        const checkInterval = window.setInterval(() => {
            const hasSwagger = window.ui || document.querySelector(".swagger-ui");

            if (hasSwagger) {
                window.clearInterval(checkInterval);
                injectStyles();
                loadListenersFromStorage();
                setupTrigger();
                renderDrawer();

                // Ripristina l'apertura del Drawer se era precedentemente aperto
                const isDrawerOpenSaved = localStorage.getItem(CONFIG.STORAGE_KEYS.DRAWER_OPEN) === "true";
                if (isDrawerOpenSaved) {
                    toggleDrawer(true);
                }

                // In case of asynchronous Activity Bar loading
                window.addEventListener("swagger-activity-bar:ready", () => {
                    setupTrigger();
                    registerGuideDocumentation();
                });

                registerGuideDocumentation();

        // Listen to i18n locale changes
        window.addEventListener("swagger-i18n:locale-changed", () => {
            registerGuideDocumentation(true);
            populateHubDropdown();
            updateTokenIndicator();
            renderListenersList();
            updateStatus(state.status);

            const drawer = document.getElementById(CONFIG.ELEMENT_IDS.DRAWER);
            if (drawer) {
                drawer.querySelectorAll(".signalr-section-header").forEach((h) => {
                    h.title = t("sectionConnToggle", "Click to expand / collapse");
                });
                const title = drawer.querySelector(".swp-sig-title");
                if (title) title.textContent = t("drawerTitle", "SignalR Hub Tester Console");
                const closeBtn = drawer.querySelector(".btn-close-drawer");
                if (closeBtn) closeBtn.title = t("closeDrawerTitle", "Close console (ESC)");
                const secConnTitle = drawer.querySelector(".swp-sig-sec-conn-title");
                if (secConnTitle) secConnTitle.textContent = t("sectionConn", "1. Hub Connection");
                const hubLabel = drawer.querySelector(".swp-sig-hub-label");
                if (hubLabel) hubLabel.textContent = t("hubPathLabel", "Hub Path (URL or Preset):");
                const useAuth = drawer.querySelector(".swp-sig-use-auth");
                if (useAuth) useAuth.textContent = t("useAuthLabel", "Send active application Bearer Token");
                const btnConnect = drawer.querySelector("#signalr-btn-connect");
                if (btnConnect) btnConnect.textContent = t("connectBtn", "▶ Connect");
                const btnDisconnect = drawer.querySelector("#signalr-btn-disconnect");
                if (btnDisconnect) btnDisconnect.textContent = t("disconnectBtn", "⏹ Disconnect");
                const secInvokeTitle = drawer.querySelector(".swp-sig-sec-invoke-title");
                if (secInvokeTitle) secInvokeTitle.textContent = t("sectionInvoke", "2. Invoke Method (Client -> Hub)");
                const methodInput = drawer.querySelector("#signalr-method-name-input");
                if (methodInput) methodInput.placeholder = t("methodNamePlaceholder", "Method Name (e.g. JoinGroup, SendMessage)");
                const btnInvoke = drawer.querySelector("#signalr-btn-invoke");
                if (btnInvoke) btnInvoke.textContent = t("invokeBtn", "🚀 Invoke");
                const jsonArgs = drawer.querySelector(".swp-sig-json-args-label");
                if (jsonArgs) jsonArgs.textContent = t("jsonArgsLabel", 'JSON Arguments (Array, e.g. ["value"] or [{"id": "..."}]):');
                const secListenTitle = drawer.querySelector(".swp-sig-sec-listen-title");
                if (secListenTitle) secListenTitle.textContent = t("sectionListen", "3. Event Listeners (Broadcasts)");
                const newListenerInput = drawer.querySelector("#signalr-new-listener-input");
                if (newListenerInput) newListenerInput.placeholder = t("newListenerPlaceholder", "Event name (e.g. ReceiveTestMessage)");
                const btnAddListener = drawer.querySelector("#signalr-btn-add-listener");
                if (btnAddListener) btnAddListener.textContent = t("addListenerBtn", "+ Listen");
                const secLogTitle = drawer.querySelector(".swp-sig-sec-log-title");
                if (secLogTitle) secLogTitle.textContent = t("sectionLog", "4. Real-Time Activity Log");
                const btnCopyLog = drawer.querySelector("#signalr-btn-copy-log");
                if (btnCopyLog) btnCopyLog.textContent = t("copyLogBtn", "📋 Copy");
                const btnClearLog = drawer.querySelector("#signalr-btn-clear-log");
                if (btnClearLog) btnClearLog.textContent = t("clearLogBtn", "🗑 Clear");
                const emptyLog = drawer.querySelector(".signalr-log-empty");
                if (emptyLog) emptyLog.textContent = t("emptyLog", "No events recorded. Connect to a Hub to begin.");
            }

            if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.updateItem === "function") {
                window.SwaggerActivityBar.updateItem("signalr-tester", {
                    title: t("activityBarTitle", "SignalR Live Hub Tester")
                });
            }
        });

                // Observer per mantenere il trigger (Activity Bar o Fallback) in caso di re-render
                const observer = new MutationObserver(() => {
                    const hasActivityBarItem = window.SwaggerActivityBar && window.SwaggerActivityBar.getItemElement("signalr-tester");
                    const hasFallback = document.getElementById(CONFIG.ELEMENT_IDS.TRIGGER_BTN);
                    if (!hasActivityBarItem && !hasFallback) {
                        setupTrigger();
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });

                console.info("[Swagger SignalR] Plugin Generico SignalR Live Hub Tester inizializzato con successo.");
            }

            if (Date.now() - startTime >= 30000) {
                window.clearInterval(checkInterval);
            }
        }, 250);
    }

    let isGuideRegistered = false;

    /**
     * Publishes plugin metadata and documentation to interactive Activity Bar guide.
     */
    function registerGuideDocumentation(force = false) {
        if (isGuideRegistered && !force) return;
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerPluginGuide === "function") {
            isGuideRegistered = true;
            window.SwaggerActivityBar.registerPluginGuide({
                id: "signalr-tester",
                name: "SignalR Live Hub Tester",
                version: "1.0.0",
                description: "Interactive debugging studio to connect to any SignalR Hub, invoke backend methods in real time, and monitor broadcast events.",
                shortcuts: [
                    "Esc: Close slide-out drawer",
                    "Click Section Header: Collapse or expand configuration boxes",
                    "Copy Logs: Export event log history"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4.93 19.07a10 10 0 0 1 0-14.14"/>
                        <path d="M7.76 16.24a6 6 0 0 1 0-8.48"/>
                        <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
                        <path d="M16.24 7.76a6 6 0 0 1 0 8.48"/>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                    </svg>
                `,
                i18n: {
                    en: {
                        name: "SignalR Live Hub Tester",
                        description: "Interactive debugging studio to connect to any SignalR Hub, invoke backend methods in real time, and monitor broadcast events.",
                        shortcuts: [
                            "Esc: Close slide-out drawer",
                            "Click Section Header: Collapse or expand configuration boxes",
                            "Copy Logs: Export event log history"
                        ],
                        manual: `
### Overview
The SignalR console allows testing bidirectional real-time WebSocket communication directly inside Swagger UI without external tools.

### Hub Connection
- **Flexible Hub Routes**: connect to any relative Hub endpoint (e.g., \`/hubs/notifications\`, \`/hubs/chat\`) or select from presets.
- **Transparent Authentication**: automatically supplies active Bearer token via both \`accessTokenFactory\` and \`?access_token=...\` query parameter.

### Console Capabilities
- **Invoke Server Methods**: call backend methods with JSON arguments and real-time round-trip latency tracking.
- **Broadcast Listeners**: register custom event names to inspect messages broadcasted by the server.
- **Side-by-Side Workflow**: the console drawer offsets Swagger UI content (\`padding-right: 480px\`), enabling simultaneous REST endpoint execution and SignalR event observation.
`
                    },
                    it: {
                        name: "SignalR Live Hub Tester",
                        description: "Studio interattivo di collaudo per connettersi a qualsiasi Hub SignalR, invocare metodi server in tempo reale e monitorare eventi di broadcast.",
                        shortcuts: [
                            "Esc: Chiude la console laterale",
                            "Click Intestazione Sezione: Collassa o espande i box di configurazione",
                            "Copia Log: Esporta lo storico eventi negli appunti"
                        ],
                        manual: `
### Panoramica
La console SignalR permette di testare la comunicazione bidirezionale WebSocket in tempo reale direttamente dentro Swagger UI senza l'ausilio di tool esterni.

### Connessione all'Hub
- **Rotte Hub Flessibili**: connettiti a qualsiasi endpoint Hub relativo (es. \`/hubs/notifications\`, \`/hubs/chat\`) o seleziona dai preset suggeriti.
- **Autenticazione Trasparente**: inietta automaticamente il Bearer Token attivo sia via \`accessTokenFactory\` che tramite query string \`?access_token=...\`.

### Funzionalità della Console
- **Invoca Metodi Server**: esegui chiamate verso l'Hub con argomenti JSON tracciando la latenza di andata e ritorno in millisecondi.
- **Listener di Broadcast**: sottoscrivi eventi custom per ispezionare istantaneamente i payload inviati dal server.
- **Flusso Affiancato**: il cassetto laterale ridimensiona Swagger UI (\`padding-right: 480px\`), permettendo di eseguire contemporaneamente endpoint REST e osservare eventi push SignalR.
`
                    }
                }
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
})();
