/**
 * @file swagger-jwt-inspector.js
 * @summary Plugin per Swagger UI che visualizza lo stato del token JWT in tempo reale
 *          (status bar con countdown) e permette l'ispezione approfondita di claims, ruoli
 *          e scadenze sia del token applicativo (Bearer) sia di Microsoft Entra ID (MSAL).
 *
 * --- FLUSSO ARCHITETTURALE ---
 * 1. Attende l'inizializzazione di Swagger UI (window.ui) e dello store Redux sottostante.
 * 2. Inietta una Status Bar elegante all'interno della barra superiore di Swagger UI (.topbar-wrapper).
 * 3. Monitora lo store Redux: non appena lo schema 'Bearer' o 'MsalAuth' viene autorizzato:
 *    - Estrae il token JWT attivo.
 *    - Decodifica il payload JSON (Base64Url conforme a caratteri UTF-8).
 *    - Aggiorna il badge con: Nome utente, Ruoli principali e Countdown alla scadenza in tempo reale.
 * 4. Al click sul badge, apre una finestra modale interattiva (JWT Inspector) che offre:
 *    - Switch rapido tra Token Applicativo (Bearer) e Token Microsoft (MSAL).
 *    - Tabella riassuntiva dei claim chiave (Nome, Email, Ruoli, Tenant, Scadenza, Emissione).
 *    - Visualizzazione JSON formattata dell'intero payload con syntax highlighting.
 *    - Pulsanti rapidi "Copia Token JWT grezzo" e "Copia Payload JSON".
 * 5. Alla disconnessione (logout), la status bar torna allo stato "Non autenticato" e chiude eventuali modali aperti.
 *
 * --- GUIDA ALLA MANUTENZIONE PER SVILUPPATORI ---
 * - Per modificare i colori, font o stili grafici: Aggiornare le variabili CSS in `STYLE_CONFIG`.
 * - Per modificare le soglie di warning del countdown: Modificare `CONFIG.WARNING_THRESHOLD_SECONDS`.
 * - Per aggiungere o personalizzare i claim evidenziati nella tabella: Modificare `SUMMARY_CLAIMS_MAPPING`.
 * - Per cambiare i nomi degli schemi OpenAPI monitorati: Modificare `CONFIG.APP_BEARER_SCHEME` o `CONFIG.MSAL_SCHEME`.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. CONFIGURAZIONE GENERALE (Modificabile dallo sviluppatore)
    // =========================================================================
    const CONFIG = {
        /** Nome identificativo dello schema Bearer registrato in AddSecurityDefinition in C# */
        APP_BEARER_SCHEME: "Bearer",

        /** Nome identificativo dello schema MSAL registrato in AddSecurityDefinition in C# */
        MSAL_SCHEME: "MsalAuth",

        /** Frequenza in millisecondi per l'aggiornamento del countdown a video */
        COUNTDOWN_TICK_INTERVAL_MS: 1000,

        /** Soglia in secondi sotto la quale il badge diventa arancione (avviso pre-scadenza) */
        WARNING_THRESHOLD_SECONDS: 120,

        /** Intervallo di polling per attendere il caricamento di Swagger UI */
        UI_DISCOVERY_INTERVAL_MS: 200,

        /** Timeout massimo di attesa caricamento di window.ui */
        UI_DISCOVERY_TIMEOUT_MS: 30000,

        /** ID elemento DOM per il contenitore della barra di stato */
        STATUS_BAR_ELEMENT_ID: "swagger-jwt-status-bar",

        /** ID elemento DOM per il modale dell'inspector */
        MODAL_ELEMENT_ID: "swagger-jwt-inspector-modal",

        /** ID dell'elemento style iniettato */
        STYLE_ELEMENT_ID: "swagger-jwt-inspector-styles"
    };

    /**
     * Mappatura dei claim standard e proprietari da evidenziare nella tabella di sintesi del modale.
     * Struttura: { label: string, extract: (payload) => string[] | string | null }
     */
    const SUMMARY_CLAIMS_MAPPING = [
        {
            label: "Utente / Nome",
            extract: (p) => extractUserName(p)
        },
        {
            label: "Email",
            extract: (p) => extractUserEmail(p)
        },
        {
            label: "Ruoli Assegnati",
            extract: (p) => {
                const roles = extractUserRoles(p);
                if (Array.isArray(roles)) return roles.join(", ");
                if (typeof roles === "string") return roles;
                return "Nessun ruolo specifico";
            }
        },
        {
            label: "User ID (nameidentifier / sub)",
            extract: (p) =>
                p["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ||
                p.sub ||
                p.oid ||
                null
        },
        {
            label: "Audience (aud)",
            extract: (p) => (Array.isArray(p.aud) ? p.aud.join(", ") : p.aud) || null
        },
        {
            label: "Issuer (iss)",
            extract: (p) => p.iss || null
        },
        {
            label: "Permissions Mask",
            extract: (p) => p.permissions_mask || null
        },
        {
            label: "Emesso il (iat)",
            extract: (p) => (p.iat ? formatTimestamp(p.iat * 1000) : null)
        },
        {
            label: "Scade il (exp)",
            extract: (p) => (p.exp ? formatTimestamp(p.exp * 1000) : null)
        }
    ];

    // =========================================================================
    // 2. STATO RUNTIME IN-MEMORY
    // =========================================================================
    let activeTokens = {
        bearer: null,
        msal: null
    };

    let activePayloads = {
        bearer: null,
        msal: null
    };

    let countdownIntervalId = null;
    let selectedInspectorTab = "bearer"; // "bearer" oppure "msal"

    // =========================================================================
    // 3. FUNZIONI DI UTILITÀ (Decodifica JWT, Data/Ora, Formattazione)
    // =========================================================================

    /**
     * Decodifica il payload Base64Url di un token JWT garantendo il supporto a caratteri UTF-8.
     * @param {string} token - Token JWT grezzo ("header.payload.signature")
     * @returns {object|null} Oggetto JSON decodificato o null se token non valido.
     */
    function parseJwtPayload(token) {
        if (!token || typeof token !== "string") return null;

        try {
            const parts = token.split(".");
            if (parts.length < 2) return null;

            const base64Url = parts[1];
            const base64 = base64Url
                .replace(/-/g, "+")
                .replace(/_/g, "/")
                .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");

            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const decodedString = new TextDecoder("utf-8").decode(bytes);
            return JSON.parse(decodedString);
        } catch (error) {
            console.warn("[Swagger JWT Inspector] Errore di decodifica JWT:", error);
            return null;
        }
    }

    /**
     * Formatta un timestamp in millisecondi in una stringa leggibile in formato locale italiano.
     * @param {number} timestampMs
     * @returns {string} Es: "09/11/2026, 10:30:15"
     */
    function formatTimestamp(timestampMs) {
        try {
            return new Date(timestampMs).toLocaleString("it-IT", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            });
        } catch {
            return new Date(timestampMs).toISOString();
        }
    }

    /**
     * Calcola la differenza temporale tra adesso e la data di scadenza e restituisce testo e stato visivo.
     * @param {number|null} expSeconds - Claim 'exp' in secondi Unix.
     * @returns {{ text: string, status: "ok"|"warning"|"expired"|"none" }}
     */
    function calculateTimeRemaining(expSeconds) {
        if (!expSeconds) {
            return { text: "Nessuna scadenza", status: "none" };
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const diffSeconds = expSeconds - nowSeconds;

        if (diffSeconds <= 0) {
            return { text: "Scaduto", status: "expired" };
        }

        const hours = Math.floor(diffSeconds / 3600);
        const minutes = Math.floor((diffSeconds % 3600) / 60);
        const seconds = diffSeconds % 60;

        let formattedTime = "";
        if (hours > 0) {
            formattedTime = `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            formattedTime = `${minutes}m ${seconds}s`;
        } else {
            formattedTime = `${seconds}s`;
        }

        const status = diffSeconds <= CONFIG.WARNING_THRESHOLD_SECONDS ? "warning" : "ok";
        return { text: formattedTime, status };
    }

    /**
     * Copia una stringa di testo negli appunti di sistema mostrando un feedback visivo sul pulsante.
     * @param {string} text - Testo da copiare.
     * @param {HTMLElement} buttonElement - Pulsante su cui mostrare il feedback.
     * @param {string} defaultLabel - Testo originario del pulsante.
     */
    function copyToClipboard(text, buttonElement, defaultLabel) {
        if (!text) return;

        navigator.clipboard.writeText(text).then(() => {
            buttonElement.textContent = "✓ Copiato!";
            buttonElement.classList.add("jwt-btn--copied");

            setTimeout(() => {
                buttonElement.textContent = defaultLabel;
                buttonElement.classList.remove("jwt-btn--copied");
            }, 1800);
        }).catch((err) => {
            console.error("[Swagger JWT Inspector] Errore copia appunti:", err);
        });
    }

    /**
     * Estrae il nome dell'utente supportando sia lo standard OpenID Connect / OAuth2 (name, preferred_username)
     * sia le convenzioni Microsoft Identity / WS-Federation (schemas.xmlsoap.org/.../name, givenname, surname).
     * @param {object|null} payload
     * @returns {string}
     */
    function extractUserName(payload) {
        if (!payload) return "Utente";

        // 1. Prova combinazione Nome + Cognome da claims Microsoft Identity
        const givenName = payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"] || payload.given_name;
        const surname = payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"] || payload.family_name;
        if (givenName && surname) {
            return `${givenName} ${surname}`.trim();
        }
        if (givenName) return String(givenName).trim();

        // 2. Prova claim 'name' (sia standard che URI WS-Federation)
        const fullName = payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] || payload.name;
        if (fullName) return String(fullName).trim();

        // 3. Prova claim alternativi (username, email, unique_name, upn)
        const altName = payload.preferred_username || payload.unique_name || payload.email || payload.upn;
        if (altName) return String(altName).trim();

        // 4. Fallback al subject / nameidentifier
        const sub = payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] || payload.sub;
        if (sub) return String(sub).trim();

        return "Utente";
    }

    /**
     * Estrae l'indirizzo email dell'utente da claim standard o Microsoft Identity.
     * @param {object|null} payload
     * @returns {string|null}
     */
    function extractUserEmail(payload) {
        if (!payload) return null;

        const email =
            payload.email ||
            payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] ||
            payload.preferred_username ||
            payload.upn;

        if (email) return String(email).trim();

        // Se 'name' ha forma di indirizzo email (es. andrea.montanaro@aesys.tech)
        const nameClaim = payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] || payload.name;
        if (typeof nameClaim === "string" && nameClaim.includes("@")) {
            return nameClaim.trim();
        }

        return null;
    }

    /**
     * Estrae i ruoli associati all'utente gestendo array o stringhe singole.
     * @param {object|null} payload
     * @returns {string[]|string|null}
     */
    function extractUserRoles(payload) {
        if (!payload) return null;

        const roles =
            payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ||
            payload.role ||
            payload.roles;

        if (Array.isArray(roles)) return roles.length > 0 ? roles : null;
        if (typeof roles === "string" && roles.trim().length > 0) return roles.trim();
        return null;
    }

    // =========================================================================
    // 4. GESTIONE TEMI (LIGHT / DARK THEME) ED INIEZIONE STILI CSS
    // =========================================================================

    /**
     * Rileva se la pagina Swagger UI è in modalità scura controllando la presenza della classe 'dark-mode'
     * su <html> o <body>, esattamente nello stesso modo di swagger-pretty-json-view.js.
     * @returns {boolean} true se è attiva la classe 'dark-mode', altrimenti false.
     */
    function isDarkModeActive() {
        return Boolean(
            document.documentElement.classList.contains("dark-mode") ||
            (document.body && document.body.classList.contains("dark-mode"))
        );
    }

    /**
     * Sincronizza la classe '--dark' sul modale se attualmente aperto.
     */
    function applyTheme() {
        const dark = isDarkModeActive();
        const modal = document.getElementById(CONFIG.MODAL_ELEMENT_ID);
        if (modal) {
            modal.classList.toggle("jwt-modal-overlay--dark", dark);
        }
    }

    /**
     * Monitora le mutazioni della classe su <html> e <body> per aggiornare istantaneamente
     * il tema del modale quando l'utente attiva o disattiva la dark-mode.
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
               SWAGGER JWT INSPECTOR - STILI GRAFICI ADATTIVI (LIGHT & DARK THEME)
               ========================================================================= */

            /* --- Status Bar nella Navbar di Swagger --- */
            #${CONFIG.STATUS_BAR_ELEMENT_ID} {
                display: inline-flex;
                align-items: center;
                gap: 10px;
                padding: 4px 12px;
                margin-left: auto;
                border-radius: 6px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                cursor: pointer;
                user-select: none;
                transition: all 0.2s ease-in-out;
                border: 1px solid rgba(255, 255, 255, 0.2);
                background: rgba(255, 255, 255, 0.1);
                color: #ffffff;
            }

            #${CONFIG.STATUS_BAR_ELEMENT_ID}:hover {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(255, 255, 255, 0.45);
                transform: translateY(-1px);
            }

            .jwt-status-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-weight: 500;
            }

            .jwt-status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
            }

            .jwt-indicator--unauth { background: #94a3b8; }
            .jwt-indicator--ok { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
            .jwt-indicator--warning { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; }
            .jwt-indicator--expired { background: #ef4444; box-shadow: 0 0 6px #ef4444; }

            .jwt-status-pill {
                padding: 2px 7px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.3px;
                text-transform: uppercase;
            }

            .jwt-pill--ok { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); }
            .jwt-pill--warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
            .jwt-pill--expired { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }

            /* --- Modale di Ispezione Completa (Default: Tema Chiaro ad Alto Contrasto) --- */
            .jwt-modal-overlay {
                --jwt-overlay-bg: rgba(0, 0, 0, 0.55);
                --jwt-bg-card: #ffffff;
                --jwt-bg-header: #f1f5f9;
                --jwt-bg-body: #ffffff;
                --jwt-bg-table: #f8fafc;
                --jwt-bg-viewer: #f8fafc;
                --jwt-bg-footer: #f1f5f9;
                --jwt-border-main: #94a3b8;
                --jwt-border-subtle: #cbd5e1;
                --jwt-border-row: #e2e8f0;
                --jwt-text-title: #0f172a;
                --jwt-text-body: #0f172a;
                --jwt-text-muted: #334155;
                --jwt-tab-active: #047857;
                --jwt-btn-bg: #ffffff;
                --jwt-btn-border: #94a3b8;
                --jwt-btn-text: #0f172a;
                --jwt-btn-hover: #e2e8f0;
                --jwt-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3);
                color-scheme: light;

                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: var(--jwt-overlay-bg);
                backdrop-filter: blur(4px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: jwtFadeIn 0.2s ease-out;
            }

            /* --- Modale Tema Scuro (Allineato a swagger-pretty-json-view.js) --- */
            html.dark-mode .jwt-modal-overlay,
            body.dark-mode .jwt-modal-overlay,
            .jwt-modal-overlay--dark {
                --jwt-overlay-bg: rgba(0, 0, 0, 0.75);
                --jwt-bg-card: #1e1e1e;
                --jwt-bg-header: #141414;
                --jwt-bg-body: #1a1a1a;
                --jwt-bg-table: #141414;
                --jwt-bg-viewer: #0f0f0f;
                --jwt-bg-footer: #141414;
                --jwt-border-main: #333333;
                --jwt-border-subtle: #262626;
                --jwt-border-row: #222222;
                --jwt-text-title: #f5f5f5;
                --jwt-text-body: #e0e0e0;
                --jwt-text-muted: #94a3b8;
                --jwt-tab-active: #49cc90; /* Iconico verde di Swagger UI */
                --jwt-btn-bg: #252525;
                --jwt-btn-border: #383838;
                --jwt-btn-text: #f0f0f0;
                --jwt-btn-hover: #333333;
                --jwt-shadow: 0 20px 45px rgba(0, 0, 0, 0.65);
                color-scheme: dark;
            }

            @keyframes jwtFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .jwt-modal-card {
                background: var(--jwt-bg-card);
                color: var(--jwt-text-body);
                border: 1px solid var(--jwt-border-main);
                border-radius: 12px;
                width: 90%;
                max-width: 780px;
                max-height: 85vh;
                display: flex;
                flex-direction: column;
                box-shadow: var(--jwt-shadow);
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            .jwt-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                border-bottom: 1px solid var(--jwt-border-subtle);
                background: var(--jwt-bg-header);
            }

            .jwt-modal-title {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 0;
                font-size: 17px;
                font-weight: 600;
                color: var(--jwt-text-title);
            }

            .jwt-modal-close-btn {
                background: transparent;
                border: none;
                color: var(--jwt-text-muted);
                font-size: 20px;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
                transition: color 0.15s, background 0.15s;
            }

            .jwt-modal-close-btn:hover {
                color: var(--jwt-text-title);
                background: var(--jwt-btn-hover);
            }

            /* --- Schede di Selezione Token (Tabs) --- */
            .jwt-modal-tabs {
                display: flex;
                padding: 0 20px;
                background: var(--jwt-bg-header);
                border-bottom: 1px solid var(--jwt-border-subtle);
                gap: 8px;
            }

            .jwt-tab-btn {
                padding: 10px 16px;
                background: transparent;
                border: none;
                border-bottom: 2px solid transparent;
                color: var(--jwt-text-muted);
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .jwt-tab-btn:hover {
                color: var(--jwt-text-body);
            }

            .jwt-tab-btn--active {
                color: var(--jwt-tab-active);
                border-bottom-color: var(--jwt-tab-active);
            }

            .jwt-modal-body {
                padding: 20px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 18px;
                background: var(--jwt-bg-body);
            }

            .jwt-section-title {
                margin: 0 0 8px 0;
                font-size: 13px;
                font-weight: 700;
                color: var(--jwt-text-muted);
                text-transform: uppercase;
                letter-spacing: 0.6px;
            }

            /* --- Tabella Riepilogo Claims Chiave --- */
            .jwt-summary-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
                background: var(--jwt-bg-table);
                border-radius: 8px;
                overflow: hidden;
                border: 1px solid var(--jwt-border-subtle);
            }

            .jwt-summary-table td {
                padding: 9px 14px;
                border-bottom: 1px solid var(--jwt-border-row);
            }

            .jwt-summary-table tr:last-child td {
                border-bottom: none;
            }

            .jwt-claim-label {
                color: var(--jwt-text-muted);
                font-weight: 600;
                width: 32%;
            }

            .jwt-claim-value {
                color: var(--jwt-text-body);
                font-family: Consolas, Monaco, "Courier New", monospace;
                word-break: break-all;
            }

            .jwt-empty-notice {
                text-align: center;
                color: var(--jwt-text-muted);
                padding: 20px;
            }

            /* --- Sezione JSON Payload Completo --- */
            .jwt-payload-viewer {
                background: var(--jwt-bg-viewer);
                border: 1px solid var(--jwt-border-subtle);
                border-radius: 8px;
                padding: 14px;
                font-family: Consolas, Monaco, "Courier New", monospace;
                font-size: 12px;
                color: var(--jwt-text-body);
                overflow-x: auto;
                max-height: 250px;
                white-space: pre;
                margin: 0;
            }

            /* --- Footer e Azioni --- */
            .jwt-modal-footer {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 10px;
                padding: 14px 20px;
                border-top: 1px solid var(--jwt-border-subtle);
                background: var(--jwt-bg-footer);
            }

            .jwt-action-btn {
                padding: 7px 14px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                border: 1px solid var(--jwt-btn-border);
                background: var(--jwt-btn-bg);
                color: var(--jwt-btn-text);
                transition: all 0.15s ease;
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }

            .jwt-action-btn:hover {
                background: var(--jwt-btn-hover);
            }

            .jwt-btn--copied {
                background: #15803d !important;
                border-color: #22c55e !important;
                color: #ffffff !important;
            }
        `;

        document.head.appendChild(style);
    }

    // =========================================================================
    // 5. RENDERING DELLA STATUS BAR (Barra di stato in Navbar)
    // =========================================================================

    /**
     * Inserisce o aggiorna la Status Bar all'interno della barra superiore di Swagger.
     */
    function renderStatusBar() {
        let statusBar = document.getElementById(CONFIG.STATUS_BAR_ELEMENT_ID);

        // Se non esiste ancora, cerchiamo il container target (.topbar-wrapper)
        if (!statusBar) {
            const topbarWrapper = document.querySelector(".swagger-ui .topbar .topbar-wrapper");
            if (!topbarWrapper) return; // Navbar non ancora renderizzata

            statusBar = document.createElement("div");
            statusBar.id = CONFIG.STATUS_BAR_ELEMENT_ID;
            statusBar.title = "Clicca per aprire il JWT Claims Inspector dettagliato";
            statusBar.addEventListener("click", openInspectorModal);

            topbarWrapper.appendChild(statusBar);
        }

        const currentPayload = activePayloads.bearer || activePayloads.msal;

        // Caso 1: Nessun utente autenticato
        if (!currentPayload) {
            statusBar.innerHTML = `
                <span class="jwt-status-indicator jwt-indicator--unauth"></span>
                <span class="jwt-status-badge">🔒 JWT: Non autenticato</span>
            `;
            return;
        }

        // Caso 2: Utente autenticato (mostriamo Nome, Ruolo e Countdown)
        const userName = extractUserName(currentPayload);
        const roles = extractUserRoles(currentPayload);
        const roleLabel = Array.isArray(roles) ? roles[0] : (typeof roles === "string" ? roles : null);

        const expCountdown = calculateTimeRemaining(currentPayload.exp);

        const pillClass = `jwt-pill--${expCountdown.status}`;
        const indicatorClass = `jwt-indicator--${expCountdown.status}`;

        statusBar.innerHTML = `
            <span class="jwt-status-indicator ${indicatorClass}"></span>
            <span class="jwt-status-badge">👤 ${escapeHtml(userName)}${roleLabel ? ` [${escapeHtml(roleLabel)}]` : ""}</span>
            <span class="jwt-status-pill ${pillClass}">⏳ ${expCountdown.text}</span>
            <span style="opacity: 0.7; font-size: 11px;">🔍 Ispeziona</span>
        `;
    }

    /**
     * Sanifica una stringa per prevenire iniezioni HTML all'interno dei template literal.
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
    // 6. RENDERING E GESTIONE MODALE (JWT Inspector Modal)
    // =========================================================================

    /**
     * Apre la finestra modale dell'inspector per esaminare in dettaglio i token.
     */
    function openInspectorModal() {
        closeInspectorModal(); // Chiude eventuali istanze orfane

        // Determina la scheda iniziale
        if (!activeTokens.bearer && activeTokens.msal) {
            selectedInspectorTab = "msal";
        } else {
            selectedInspectorTab = "bearer";
        }

        const overlay = document.createElement("div");
        overlay.id = CONFIG.MODAL_ELEMENT_ID;
        overlay.className = "jwt-modal-overlay";
        if (isDarkModeActive()) {
            overlay.classList.add("jwt-modal-overlay--dark");
        }

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) closeInspectorModal();
        });

        // Ascolto ESC per chiudere
        const escListener = (event) => {
            if (event.key === "Escape") {
                closeInspectorModal();
                window.removeEventListener("keydown", escListener);
            }
        };
        window.addEventListener("keydown", escListener);

        const card = document.createElement("div");
        card.className = "jwt-modal-card";

        updateModalContent(card);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
    }

    /**
     * Aggiorna dinamicamente i contenuti interni del modale (utilizzato anche al cambio di tab).
     * @param {HTMLElement} cardElement
     */
    function updateModalContent(cardElement) {
        const hasBearer = Boolean(activeTokens.bearer);
        const hasMsal = Boolean(activeTokens.msal);

        const currentToken = selectedInspectorTab === "bearer" ? activeTokens.bearer : activeTokens.msal;
        const currentPayload = selectedInspectorTab === "bearer" ? activePayloads.bearer : activePayloads.msal;

        // Generazione righe tabella
        let tableRowsHtml = "";
        if (currentPayload) {
            SUMMARY_CLAIMS_MAPPING.forEach((claimDef) => {
                const val = claimDef.extract(currentPayload);
                if (val !== null && val !== undefined) {
                    tableRowsHtml += `
                        <tr>
                            <td class="jwt-claim-label">${escapeHtml(claimDef.label)}</td>
                            <td class="jwt-claim-value">${escapeHtml(String(val))}</td>
                        </tr>
                    `;
                }
            });
        } else {
            tableRowsHtml = `
                <tr>
                    <td colspan="2" class="jwt-empty-notice">
                        Nessun token presente per questa sessione.
                    </td>
                </tr>
            `;
        }

        const formattedJson = currentPayload ? JSON.stringify(currentPayload, null, 2) : "Nessun dato decodificabile";

        cardElement.innerHTML = `
            <div class="jwt-modal-header">
                <h3 class="jwt-modal-title">
                    <span>🪪</span> JWT Claims Inspector
                </h3>
                <button type="button" class="jwt-modal-close-btn" id="jwt-modal-btn-close" title="Chiudi">✕</button>
            </div>

            <div class="jwt-modal-tabs">
                <button type="button" class="jwt-tab-btn ${selectedInspectorTab === "bearer" ? "jwt-tab-btn--active" : ""}" id="jwt-tab-bearer">
                    Bearer Token Applicativo ${hasBearer ? "✓" : "(Vuoto)"}
                </button>
                <button type="button" class="jwt-tab-btn ${selectedInspectorTab === "msal" ? "jwt-tab-btn--active" : ""}" id="jwt-tab-msal">
                    Microsoft Entra ID (MSAL) ${hasMsal ? "✓" : "(Vuoto)"}
                </button>
            </div>

            <div class="jwt-modal-body">
                <div>
                    <h4 class="jwt-section-title">
                        Riepilogo Parametri Chiave
                    </h4>
                    <table class="jwt-summary-table">
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                </div>

                <div>
                    <h4 class="jwt-section-title">
                        Payload JSON Completo
                    </h4>
                    <pre class="jwt-payload-viewer">${escapeHtml(formattedJson)}</pre>
                </div>
            </div>

            <div class="jwt-modal-footer">
                <button type="button" class="jwt-action-btn" id="jwt-btn-copy-token" ${!currentToken ? "disabled" : ""}>
                    📋 Copia Token JWT (Raw)
                </button>
                <button type="button" class="jwt-action-btn" id="jwt-btn-copy-payload" ${!currentPayload ? "disabled" : ""}>
                    📄 Copia Payload JSON
                </button>
            </div>
        `;

        // Registrazione listener pulsanti modale
        cardElement.querySelector("#jwt-modal-btn-close").addEventListener("click", closeInspectorModal);

        const tabBearer = cardElement.querySelector("#jwt-tab-bearer");
        const tabMsal = cardElement.querySelector("#jwt-tab-msal");

        tabBearer.addEventListener("click", () => {
            selectedInspectorTab = "bearer";
            updateModalContent(cardElement);
        });

        tabMsal.addEventListener("click", () => {
            selectedInspectorTab = "msal";
            updateModalContent(cardElement);
        });

        const copyTokenBtn = cardElement.querySelector("#jwt-btn-copy-token");
        if (copyTokenBtn && currentToken) {
            copyTokenBtn.addEventListener("click", () => {
                copyToClipboard(currentToken, copyTokenBtn, "📋 Copia Token JWT (Raw)");
            });
        }

        const copyPayloadBtn = cardElement.querySelector("#jwt-btn-copy-payload");
        if (copyPayloadBtn && currentPayload) {
            copyPayloadBtn.addEventListener("click", () => {
                copyToClipboard(formattedJson, copyPayloadBtn, "📄 Copia Payload JSON");
            });
        }
    }

    /**
     * Chiude e distrugge l'eventuale finestra modale aperta.
     */
    function closeInspectorModal() {
        const modal = document.getElementById(CONFIG.MODAL_ELEMENT_ID);
        if (modal) modal.remove();
    }

    // =========================================================================
    // 7. SINCRONIZZAZIONE STATO SWAGGER (Redux Store Observer)
    // =========================================================================

    /**
     * Estrae la stringa del token Bearer applicativo dallo store Redux di Swagger.
     * @param {object} authorizedSchemes
     * @returns {string|null}
     */
    function extractBearerToken(authorizedSchemes) {
        if (!authorizedSchemes || typeof authorizedSchemes.get !== "function") return null;

        const entry = authorizedSchemes.get(CONFIG.APP_BEARER_SCHEME);
        if (!entry) return null;

        if (typeof entry.get === "function") {
            return entry.get("value") || null;
        }

        return entry.value || null;
    }

    /**
     * Estrae la stringa del token MSAL dallo store Redux di Swagger.
     * @param {object} authorizedSchemes
     * @returns {string|null}
     */
    function extractMsalToken(authorizedSchemes) {
        if (!authorizedSchemes || typeof authorizedSchemes.get !== "function") return null;

        const entry = authorizedSchemes.get(CONFIG.MSAL_SCHEME);
        if (!entry) return null;

        const tokenObj = typeof entry.get === "function" ? entry.get("token") : entry.token;
        if (!tokenObj) return null;

        if (typeof tokenObj.get === "function") {
            return tokenObj.get("access_token") || tokenObj.get("token") || null;
        }

        return tokenObj.access_token || tokenObj.token || null;
    }

    /**
     * Aggiorna lo stato runtime dei token e rinfresca la UI.
     * @param {string|null} bearerToken
     * @param {string|null} msalToken
     */
    function updateTokensState(bearerToken, msalToken) {
        let changed = false;

        if (activeTokens.bearer !== bearerToken) {
            activeTokens.bearer = bearerToken;
            activePayloads.bearer = bearerToken ? parseJwtPayload(bearerToken) : null;
            changed = true;
        }

        if (activeTokens.msal !== msalToken) {
            activeTokens.msal = msalToken;
            activePayloads.msal = msalToken ? parseJwtPayload(msalToken) : null;
            changed = true;
        }

        if (changed) {
            renderStatusBar();

            // Se il modale è attualmente aperto, rinfreschiamo anche la sua card
            const openModalCard = document.querySelector(`#${CONFIG.MODAL_ELEMENT_ID} .jwt-modal-card`);
            if (openModalCard) {
                updateModalContent(openModalCard);
            }
        }
    }

    /**
     * Inizializza l'observer sottoscritto allo store Redux di Swagger UI.
     */
    function initializeObserver() {
        const startTime = Date.now();

        const checkInterval = window.setInterval(() => {
            const ui = window.ui;

            if (ui && typeof ui.getStore === "function") {
                const store = ui.getStore();
                if (store && typeof store.subscribe === "function") {
                    window.clearInterval(checkInterval);

                    injectStyles();
                    observeThemeChanges();
                    renderStatusBar();

                    // Sottoscrizione allo store per rilevare login e logout istantaneamente
                    store.subscribe(() => {
                        try {
                            const state = store.getState();
                            const authorizedSchemes = state?.get("auth")?.get("authorized");

                            const bearer = extractBearerToken(authorizedSchemes);
                            const msal = extractMsalToken(authorizedSchemes);

                            updateTokensState(bearer, msal);
                        } catch (err) {
                            console.warn("[Swagger JWT Inspector] Errore lettura stato auth:", err);
                        }
                    });

                    // Avvio del ticker del countdown periodico (ogni 1s)
                    if (countdownIntervalId === null) {
                        countdownIntervalId = window.setInterval(() => {
                            renderStatusBar();
                        }, CONFIG.COUNTDOWN_TICK_INTERVAL_MS);
                    }

                    registerGuideDocumentation();
                    window.addEventListener("swagger-activity-bar:ready", registerGuideDocumentation);

                    console.info("[Swagger JWT Inspector] Inizializzato con successo.");
                    return;
                }
            }

            if (Date.now() - startTime >= CONFIG.UI_DISCOVERY_TIMEOUT_MS) {
                window.clearInterval(checkInterval);
                registerGuideDocumentation();
                console.warn("[Swagger JWT Inspector] Timeout attesa caricamento Swagger UI.");
            }
        }, CONFIG.UI_DISCOVERY_INTERVAL_MS);
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
                id: "jwt-inspector",
                name: "JWT Claims & Token Inspector",
                version: "1.0.0",
                description: "Decodifica in tempo reale i token JWT attivi (MSAL ed Exchange Bearer) con countdown di scadenza, ruoli e ispezione claims.",
                shortcuts: [
                    "Status Bar: Mostra utente, ruoli e minuti residui alla scadenza",
                    "Ispeziona Claims: Apre la modale dettagliata con tabella claims",
                    "Copia Token: Copia la stringa Bearer token negli appunti"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                `,
                manual: `
### Panoramica
Fornisce piena trasparenza sull'identità dell'utente autenticato e sul ciclo di vita dei token in Swagger UI (sia token Entra ID Microsoft che Bearer applicativo dell'API).

### Barra di Stato
Appare automaticamente sotto la sezione Authorize dopo il login:
- **Identità & Ruoli**: mostra il nome dell'utente e i ruoli RBAC (es. \`Admin\`, \`Recruiter\`).
- **Countdown Scadenza**: timer in tempo reale con avviso a 5 minuti dalla scadenza.

### Modale Ispezione Claims
Cliccando su **"Ispeziona Claims"** si apre la finestra con:
- **Tabella Claims**: decodifica di tutti i claim (\`sub\`, \`iss\`, \`aud\`, \`exp\`, \`roles\`, \`tenant\`).
- **Vista JSON**: payload completo con pulsanti per copiare il token o scaricarlo.
`
            });
        }
    }

    // =========================================================================
    // 8. AVVIO PLUGIN
    // =========================================================================
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeObserver);
    } else {
        initializeObserver();
    }
})();
