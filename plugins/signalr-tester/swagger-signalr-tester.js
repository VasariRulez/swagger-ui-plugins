/**
 * @file swagger-signalr-tester.js
 * @summary Plugin Generico per il Test e Monitoraggio Real-Time di Hub SignalR in Swagger UI (OpenAPI / ASP.NET Core).
 *          Consente agli sviluppatori di connettersi a qualsiasi Hub SignalR (incluso l'hub unificato
 *          futuro o gli hub attuali), autenticarsi con il Bearer Token attivo, invocare metodi
 *          e ascoltare eventi broadcast in tempo reale con formattazione JSON colorata.
 *
 * --- CARATTERISTICHE PRINCIPALI & ARCHITETTURA GENERICA ---
 * 1. 100% Generico e Agnostico:
 *    - Nessun metodo o rotta hardcodata vincolante: supporta qualsiasi percorso di Hub (/hubs/...),
 *      inclusa la transizione verso il singolo Hub unificato dell'applicazione.
 *    - Permette di digitare liberamente qualsiasi rotta di Hub o selezionare dai preset configurabili.
 * 2. Autenticazione Automatica con Bearer Token:
 *    - Rileva automaticamente l'access token attivo da Swagger UI ('swagger-token-interceptor.js'
 *      o Redux store 'ui.getState().get("auth")').
 *    - Passa il token sia tramite 'accessTokenFactory' che via query parameter '?access_token=...'.
 * 3. Invocazione Metodi Flessibile (Invoke/Send):
 *    - Consente di invocare qualsiasi metodo del server specificando nome e argomenti JSON.
 *    - Calcola e mostra i tempi di risposta (ms) e il valore restituito dal server.
 * 4. Ascolto Eventi Dinamico (Event Listeners):
 *    - Permette di registrare in tempo reale qualsiasi nome di evento (es. ReceiveTestMessage,
 *      ReceiveLeadNote, Notification, o eventi custom).
 *    - Registra istantaneamente i payload ricevuti dal server con formattazione JSON.
 * 5. Console Live Interattiva:
 *    - Pannello cassetto (Drawer) a comparsa sul lato destro, collassabile, senza oscurare Swagger.
 *    - Log in tempo reale con badge colorati (Inviati, Ricevuti, Connessione, Errori).
 *    - Filtri per tipo di messaggio, pulsanti di copia e pulizia cronologia.
 * 6. Supporto Temi Completo:
 *    - Totalmente sincronizzato con il tema Chiaro e Scuro di Swagger UI.
 *
 * --- GUIDA ALLA MANUTENZIONE PER SVILUPPATORI ---
 * - Per modificare i percorsi Hub predefiniti: Aggiornare `CONFIG.DEFAULT_HUB_PRESETS`.
 * - Per modificare gli eventi predefiniti: Aggiornare `CONFIG.DEFAULT_EVENT_LISTENERS`.
 * - Per modificare le chiavi di memorizzazione: Aggiornare `CONFIG.STORAGE_KEYS`.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. CONFIGURAZIONE GENERALE (Modificabile dallo sviluppatore)
    // =========================================================================
    const CONFIG = {
        /** Elenco percorsi Hub suggeriti nel menu a tendina (l'utente può comunque inserire percorsi custom) */
        DEFAULT_HUB_PRESETS: [
            { label: "Hub Note e Conversazioni Lead", path: "/hubs/lead-notes" },
            { label: "Hub Chat Candidato", path: "/hubs/candidate-chat" },
            { label: "Hub Notifiche Generico", path: "/hubs/notifications" }
        ],

        /** Nomi di eventi broadcast suggeriti per l'ascolto */
        DEFAULT_EVENT_LISTENERS: [
            "ReceiveTestMessage",
            "ReceiveLeadNote",
            "ReceiveMessage",
            "LeadUpdated",
            "UserJoined",
            "Notification"
        ],

        /** Chiavi per la persistenza su LocalStorage */
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
    // 2. STATO RUNTIME IN-MEMORY
    // =========================================================================
    const state = {
        /** Istanza HubConnection attiva di SignalR */
        connection: null,

        /** Stato connessione: "disconnected" | "connecting" | "connected" | "reconnecting" */
        status: "disconnected",

        /** URL dell'hub attualmente configurato */
        currentHubUrl: "",

        /** Lista di eventi attualmente registrati in ascolto */
        activeListeners: new Set(),

        /** Log degli eventi e messaggi */
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
     * Recupera il Bearer Token applicativo attivo da Swagger UI o dallo storage locale.
     * @returns {string|null}
     */
    function getActiveBearerToken() {
        // Tentativo 1: SessionStorage impostato da swagger-token-interceptor.js
        const sessionToken = sessionStorage.getItem("bearer_token") || localStorage.getItem("swp_bearer_token");
        if (sessionToken && sessionToken.startsWith("eyJ")) {
            return sessionToken;
        }

        // Tentativo 2: Store Redux di Swagger UI
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
            // Ignora errori di parsing dello state
        }

        return null;
    }

    /**
     * Verifica se il tema scuro è attivo nella pagina.
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
    // 4. GESTORE DELLA CONNESSIONE SIGNALR
    // =========================================================================

    /**
     * Avvia una nuova connessione SignalR verso l'hub specificato.
     * @param {string} hubUrl - Percorso relativo o assoluto (es. "/hubs/lead-notes")
     * @param {boolean} useAuth - Se true, include il Bearer Token attivo
     * @returns {Promise<boolean>}
     */
    async function connectToHub(hubUrl, useAuth = true) {
        if (typeof window.signalR === "undefined") {
            addLog("error", "Libreria SignalR non caricata in pagina. Impossibile stabilire la connessione.");
            return false;
        }

        if (state.connection) {
            await disconnectFromHub();
        }

        const normalizedUrl = (hubUrl || "").trim();
        if (!normalizedUrl) {
            addLog("error", "Specificare un URL o percorso valido per l'Hub.");
            return false;
        }

        updateStatus("connecting");
        addLog("info", `Connessione in corso a ${normalizedUrl}...`);

        try {
            const token = useAuth ? getActiveBearerToken() : null;

            // Opzioni di connessione con supporto WebSockets e query parameter access_token
            const options = {
                transport: window.signalR.HttpTransportType.WebSockets | window.signalR.HttpTransportType.LongPolling
            };

            if (token) {
                options.accessTokenFactory = () => token;
            }

            // Costruzione URL completa (se relativo, concatena window.location.origin)
            const fullUrl = normalizedUrl.startsWith("http")
                ? normalizedUrl
                : `${window.location.origin}${normalizedUrl.startsWith("/") ? "" : "/"}${normalizedUrl}`;

            const builder = new window.signalR.HubConnectionBuilder()
                .withUrl(fullUrl, options)
                .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
                .configureLogging(window.signalR.LogLevel.Information);

            state.connection = builder.build();
            state.currentHubUrl = normalizedUrl;

            // Configura callback di ciclo di vita della connessione
            state.connection.onreconnecting((error) => {
                updateStatus("reconnecting");
                addLog("warn", `Riconnessione automatica in corso... ${error ? error.message : ""}`);
            });

            state.connection.onreconnected((newConnectionId) => {
                updateStatus("connected");
                state.connectionId = newConnectionId;
                addLog("success", `Riconnesso con successo! Nuovo ConnectionId: ${newConnectionId}`);
            });

            state.connection.onclose((error) => {
                updateStatus("disconnected");
                state.connectionId = null;
                if (error) {
                    addLog("error", `Connessione interrotta dal server: ${error.message}`);
                } else {
                    addLog("info", "Connessione chiusa regolarmente.");
                }
            });

            // Re-iscrive tutti i listener attualmente attivi sulla nuova istanza
            state.activeListeners.forEach((eventName) => {
                bindListenerToConnection(eventName);
            });

            // Avvio effettivo della connessione
            await state.connection.start();

            state.connectionId = state.connection.connectionId || "Disponibile";
            state.connectedAt = new Date();
            updateStatus("connected");
            addLog("success", `Connesso con successo all'Hub! ConnectionId: ${state.connectionId}`);

            // Salva l'ultimo hub utilizzato in localStorage e aggiorna la cronologia
            localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_HUB, normalizedUrl);
            saveRecentHub(normalizedUrl);
            populateHubDropdown();
            return true;
        } catch (error) {
            updateStatus("disconnected");
            state.connection = null;
            addLog("error", `Errore durante la connessione all'Hub: ${error.message || error}`);
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
            addLog("info", "Disconnessione in corso...");
            await state.connection.stop();
        } catch (err) {
            console.warn("[SignalR Tester] Errore in stop:", err);
        } finally {
            state.connection = null;
            state.connectionId = null;
            updateStatus("disconnected");
        }
    }

    /**
     * Invoca un metodo del server (Invoke con Promise).
     * @param {string} methodName - Nome metodo C# sull'Hub (es. "JoinLead", "SendTestMessage")
     * @param {any[]} args - Array di parametri
     * @returns {Promise<any>}
     */
    async function invokeHubMethod(methodName, args = []) {
        if (!state.connection || state.status !== "connected") {
            addLog("error", "Impossibile invocare il metodo: Connessione SignalR non attiva.");
            return;
        }

        const name = (methodName || "").trim();
        if (!name) {
            addLog("error", "Specificare il nome del metodo da invocare.");
            return;
        }

        const startTime = Date.now();
        addLog("sent", `Invio invoke '${name}' con argomenti:`, args);

        try {
            const result = await state.connection.invoke(name, ...args);
            const durationMs = Date.now() - startTime;
            addLog("success", `Risposta da '${name}' (⏱ ${durationMs}ms):`, result !== undefined ? result : "void (completato)");
            return result;
        } catch (error) {
            const durationMs = Date.now() - startTime;
            addLog("error", `Errore durante l'invocazione di '${name}' (⏱ ${durationMs}ms): ${error.message || error}`);
            throw error;
        }
    }

    /**
     * Aggancia un listener di eventi alla connessione attiva.
     * @param {string} eventName
     */
    function bindListenerToConnection(eventName) {
        if (!state.connection) return;

        // Rimuove eventuali handler precedenti per non duplicare
        state.connection.off(eventName);

        state.connection.on(eventName, (...args) => {
            const payload = args.length === 1 ? args[0] : (args.length === 0 ? null : args);
            addLog("received", `Evento ricevuto: '${eventName}'`, payload);
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
        addLog("info", `In ascolto dell'evento '${name}'.`);
    }

    /**
     * Rimuove un evento dall'ascolto.
     * @param {string} eventName
     */
    function unregisterEventListener(eventName) {
        state.activeListeners.delete(eventName);
        if (state.connection) {
            state.connection.off(eventName);
        }
        saveListenersToStorage();
        renderListenersList();
        addLog("info", `Rimosso ascolto dell'evento '${eventName}'.`);
    }

    /**
     * Salva i listener configurati nel LocalStorage.
     */
    function saveListenersToStorage() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.SAVED_LISTENERS, JSON.stringify([...state.activeListeners]));
        } catch {
            // Ignora storage pieno
        }
    }

    /**
     * Carica i listener salvati nel LocalStorage.
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
     * Carica l'elenco degli Hub recenti/personalizzati salvati in LocalStorage.
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
     * Aggiunge un URL di Hub alla cronologia degli Hub recenti (evitando duplicati).
     * @param {string} hubUrl
     */
    function saveRecentHub(hubUrl) {
        if (!hubUrl || typeof hubUrl !== "string") return;
        const normalized = hubUrl.trim();
        if (!normalized) return;

        // Se è già presente tra i preset di default, non serve salvarlo tra i custom
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
     * Popola dinamicamente il menu a tendina degli Hub (Default + Recenti dell'utente).
     */
    function populateHubDropdown() {
        const select = document.getElementById("signalr-preset-select");
        if (!select) return;

        const currentVal = select.value;
        const recentHubs = loadRecentHubs();

        let html = `<option value="">-- Seleziona un Hub suggerito o recente --</option>`;

        // Gruppo 1: Predefiniti
        html += `<optgroup label="Hub Predefiniti">`;
        CONFIG.DEFAULT_HUB_PRESETS.forEach((preset) => {
            html += `<option value="${escapeHtml(preset.path)}">${escapeHtml(preset.label)} (${escapeHtml(preset.path)})</option>`;
        });
        html += `</optgroup>`;

        // Gruppo 2: Recenti dell'utente (se presenti)
        if (recentHubs.length > 0) {
            html += `<optgroup label="I Miei Hub Recenti / Custom">`;
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
     * Aggiunge un record al log delle attività e aggiorna la visualizzazione.
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
            container.innerHTML = `<div class="signalr-log-empty">Nessun evento registrato. Connettiti all'Hub per iniziare.</div>`;
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
    // 7. RENDERING E INTERFACCIA UTENTE
    // =========================================================================

    /**
     * Registra il trigger SignalR nell'Activity Bar se disponibile,
     * altrimenti effettua il fallback posizionando il pulsante nella pagina.
     */
    function setupTrigger() {
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerItem === "function") {
            // Rimuove l'eventuale fallback precedentemente iniettato
            const fallbackBtn = document.getElementById(CONFIG.ELEMENT_IDS.TRIGGER_BTN);
            if (fallbackBtn && !fallbackBtn.closest("#swagger-activity-bar")) {
                fallbackBtn.remove();
            }

            const drawer = document.getElementById(CONFIG.ELEMENT_IDS.DRAWER);
            const isDrawerOpen = drawer?.classList.contains("is-open") || false;

            window.SwaggerActivityBar.registerItem({
                id: "signalr-tester",
                title: "SignalR Live Hub Tester (Apri / Chiudi Console)",
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
                order: 10,
                isActive: isDrawerOpen
            });
            return;
        }

        // Fallback: iniezione del pulsante standard nella pagina Swagger UI (se Activity Bar assente)
        renderFallbackTriggerButton();
    }

    /**
     * Renderizza il pulsante trigger di fallback in Swagger UI (se l'Activity Bar è assente).
     */
    function renderFallbackTriggerButton() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.TRIGGER_BTN)) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = CONFIG.ELEMENT_IDS.TRIGGER_BTN;
        btn.className = "signalr-fallback-trigger-btn";
        btn.title = "SignalR Live Hub Tester (Apri / Chiudi Console)";
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
     * Inietta il Drawer della console SignalR nel DOM.
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
                    <span>Console SignalR Hub Tester</span>
                </div>
                <button type="button" class="signalr-btn-close btn-close-drawer" title="Chiudi console (ESC)">✕</button>
            </div>

            <div class="signalr-drawer-body">
                <!-- Sezione 1: Configurazione Connessione (Collassabile) -->
                <div class="signalr-section signalr-section--collapsible" id="signalr-sec-conn">
                    <div class="signalr-section-header" data-toggle="signalr-sec-conn" title="Clicca per espandere / collassare">
                        <div class="signalr-section-title-wrap">
                            <span class="signalr-collapse-icon">▼</span>
                            <span>1. Connessione all'Hub (Generica)</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span id="signalr-hub-active-chip" class="signalr-summary-chip" style="display:none; max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
                            <span id="signalr-conn-status-badge" style="font-size:10px; font-weight:600; color:#94a3b8;">DISCONNESSO</span>
                        </div>
                    </div>

                    <div class="signalr-section-content">
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <label style="font-size:11px; font-weight:600;">Percorso Hub (URL o Preset):</label>
                            <select id="signalr-preset-select" class="signalr-select">
                                ${presetOptions}
                            </select>
                            <input id="signalr-hub-url-input" class="signalr-input" type="text" placeholder="/hubs/..." value="${escapeHtml(lastHub)}" />
                        </div>

                        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px;">
                            <label style="display:inline-flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;">
                                <input type="checkbox" id="signalr-use-auth-cb" checked />
                                <span>Invia Bearer Token applicativo attivo</span>
                            </label>
                            <span id="signalr-token-indicator" style="font-size:10px; color:#10b981; font-weight:600;">Token rilevato ✓</span>
                        </div>

                        <div style="display:flex; gap:8px; margin-top:6px;">
                            <button type="button" id="signalr-btn-connect" class="signalr-btn signalr-btn-primary" style="flex:1;">
                                ▶ Connetti
                            </button>
                            <button type="button" id="signalr-btn-disconnect" class="signalr-btn signalr-btn-danger" style="display:none; flex:1;">
                                ⏹ Disconnetti
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Sezione 2: Invocazione Metodi (Collassabile) -->
                <div class="signalr-section signalr-section--collapsible" id="signalr-sec-invoke">
                    <div class="signalr-section-header" data-toggle="signalr-sec-invoke" title="Clicca per espandere / collassare">
                        <div class="signalr-section-title-wrap">
                            <span class="signalr-collapse-icon">▼</span>
                            <span>2. Invoca Metodo (Client -> Hub)</span>
                        </div>
                        <span id="signalr-invoke-summary-badge" class="signalr-summary-chip" style="display:none;"></span>
                    </div>

                    <div class="signalr-section-content">
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <div style="display:flex; gap:6px;">
                                <input id="signalr-method-name-input" class="signalr-input" type="text" placeholder="Nome Metodo C# (es. JoinLead, SendTestMessage)" style="flex:1;" />
                                <button type="button" id="signalr-btn-invoke" class="signalr-btn signalr-btn-primary">
                                    🚀 Invoca
                                </button>
                            </div>
                            <label style="font-size:10px; color:var(--sig-text-muted);">Argomenti JSON (Array, es. ["valore"] o [{"id": "..."}]):</label>
                            <textarea id="signalr-args-input" class="signalr-textarea" placeholder='["Argomento1", 123]'></textarea>
                        </div>
                    </div>
                </div>

                <!-- Sezione 3: Event Listeners (Collassabile) -->
                <div class="signalr-section signalr-section--collapsible" id="signalr-sec-listen">
                    <div class="signalr-section-header" data-toggle="signalr-sec-listen" title="Clicca per espandere / collassare">
                        <div class="signalr-section-title-wrap">
                            <span class="signalr-collapse-icon">▼</span>
                            <span>3. Eventi in Ascolto (Broadcast Ricevuti)</span>
                        </div>
                        <span id="signalr-listeners-summary-badge" class="signalr-summary-chip">${state.activeListeners.size} attivi</span>
                    </div>

                    <div class="signalr-section-content">
                        <div style="display:flex; gap:6px;">
                            <input id="signalr-new-listener-input" class="signalr-input" type="text" placeholder="Nome evento (es. ReceiveTestMessage)" style="flex:1;" />
                            <button type="button" id="signalr-btn-add-listener" class="signalr-btn">
                                + Ascolta
                            </button>
                        </div>

                        <div id="signalr-tags-container" class="signalr-tags-container">
                            <!-- Popolato dinamicamente -->
                        </div>
                    </div>
                </div>

                <!-- Sezione 4: Log Attività in Tempo Reale (Auto-Fill dello Spazio Rimanente) -->
                <div class="signalr-section signalr-section--log">
                    <div class="signalr-section-title">
                        <span>4. Log Eventi in Tempo Reale</span>
                        <div style="display:flex; gap:6px;">
                            <button type="button" id="signalr-btn-copy-log" class="signalr-btn" style="height:22px; padding:0 6px; font-size:10px;">📋 Copia</button>
                            <button type="button" id="signalr-btn-clear-log" class="signalr-btn" style="height:22px; padding:0 6px; font-size:10px;">🗑 Pulisci</button>
                        </div>
                    </div>

                    <div id="signalr-log-stream" class="signalr-log-stream">
                        <div class="signalr-log-empty">Nessun evento registrato. Connettiti all'Hub per iniziare.</div>
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

        // Chiusura con tasto ESC quando il drawer è aperto
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

        // Pulsante Connetti
        const btnConnect = document.getElementById("signalr-btn-connect");
        btnConnect?.addEventListener("click", async () => {
            const hubUrl = urlInput.value.trim();
            const useAuth = document.getElementById("signalr-use-auth-cb")?.checked !== false;
            await connectToHub(hubUrl, useAuth);
        });

        // Pulsante Disconnetti
        const btnDisconnect = document.getElementById("signalr-btn-disconnect");
        btnDisconnect?.addEventListener("click", async () => {
            await disconnectFromHub();
        });

        // Pulsante Invoca
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
                alert("Specificare il nome del metodo.");
                return;
            }

            let args = [];
            const rawArgs = argsInput.value.trim();
            if (rawArgs) {
                try {
                    const parsed = JSON.parse(rawArgs);
                    args = Array.isArray(parsed) ? parsed : [parsed];
                } catch {
                    alert("Gli argomenti devono essere formattati come JSON valido (es. [\"valore\"] o [123]).");
                    return;
                }
            }

            try {
                await invokeHubMethod(methodName, args);
            } catch {
                // Errore già loggato in addLog
            }
        });

        // Pulsante Aggiungi Listener
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

        // Pulsante Pulisci Log
        document.getElementById("signalr-btn-clear-log")?.addEventListener("click", clearLogs);

        // Pulsante Copia Log
        document.getElementById("signalr-btn-copy-log")?.addEventListener("click", () => {
            if (state.logEntries.length === 0) return;
            const text = state.logEntries
                .map((e) => `[${e.time}] [${e.type.toUpperCase()}] ${e.message} ${e.payload ? JSON.stringify(e.payload) : ""}`)
                .join("\n");
            navigator.clipboard.writeText(text).then(() => alert("Log copiato negli appunti!"));
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
     * Aggiorna lo stato visivo della connessione (badge, bottoni, pallini).
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
            statusBadge.textContent = newStatus.toUpperCase();
            if (newStatus === "connected") {
                statusBadge.style.color = "#10b981";
                if (hubChip && state.currentHubUrl) {
                    hubChip.textContent = state.currentHubUrl;
                    hubChip.title = `Connesso a: ${state.currentHubUrl}`;
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
                indicator.textContent = "Token attivo rilevato ✓";
                indicator.style.color = "#10b981";
            } else {
                indicator.textContent = "Nessun token (Anonimo)";
                indicator.style.color = "#f59e0b";
            }
        }
    }

    /**
     * Renderizza i tag degli eventi attualmente in ascolto.
     */
    function renderListenersList() {
        const container = document.getElementById("signalr-tags-container");
        if (!container) return;

        container.innerHTML = "";

        const listenersBadge = document.getElementById("signalr-listeners-summary-badge");
        if (listenersBadge) {
            listenersBadge.textContent = `${state.activeListeners.size} attivi`;
        }

        state.activeListeners.forEach((name) => {
            const tag = document.createElement("span");
            tag.className = "signalr-tag";
            tag.innerHTML = `
                <span>${escapeHtml(name)}</span>
                <span class="signalr-tag-del" title="Rimuovi ascolto">✕</span>
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

        // Rimuove l'avviso di log vuoto se presente
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
    // 8. INIZIALIZZAZIONE PLUGIN
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

                // In caso di caricamento asincrono dell'Activity Bar
                window.addEventListener("swagger-activity-bar:ready", () => {
                    setupTrigger();
                    registerGuideDocumentation();
                });

                registerGuideDocumentation();

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
     * Pubblica i metadati e la documentazione del plugin nella guida interattiva dell'Activity Bar (ID 27).
     */
    function registerGuideDocumentation() {
        if (isGuideRegistered) return;
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerPluginGuide === "function") {
            isGuideRegistered = true;
            window.SwaggerActivityBar.registerPluginGuide({
                id: "signalr-tester",
                name: "SignalR Live Hub Tester",
                version: "1.0.0",
                description: "Console interattiva per connettersi a qualsiasi Hub SignalR, invocare metodi C# in tempo reale e monitorare gli eventi broadcast.",
                shortcuts: [
                    "Esc: Chiude il drawer laterale",
                    "Click Header Sezioni: Comprime o espande i box di configurazione",
                    "Copia Log: Esporta la cronologia degli eventi"
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
                manual: `
### Panoramica
La console SignalR consente di testare la comunicazione bidirezionale WebSocket in tempo reale direttamente in Swagger UI, senza bisogno di client esterni.

### Connessione all'Hub
- **Rotta Hub Flessibile**: connettiti a qualsiasi percorso relativo (es. \`/hubs/notifications\`, \`/hubs/chat\`) o seleziona un hub suggerito dalla cronologia.
- **Autenticazione Trasparente**: inietta il token JWT attivo sia tramite \`accessTokenFactory\` che tramite query string \`?access_token=...\` per negoziazioni WebSocket.

### Funzionalità della Console
- **Invocazione Metodi C#**: chiama metodi remoti passando argomenti JSON con tracciamento istantaneo della latenza.
- **Listener Broadcast**: ricevi e ispeziona gli eventi broadcast inviati dal server ad altri client o gruppi.
- **Affiancamento Fluido**: aprendo la console il corpo di Swagger UI si comprime (\`padding-right: 480px\`), consentendo di invocare endpoint REST e osservare simultaneamente gli eventi SignalR.
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
