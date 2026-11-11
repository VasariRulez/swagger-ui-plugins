/**
 * @file swagger-jwt-inspector.js
 * @summary JWT Claims & Token Inspector plugin for Swagger UI.
 *          Visualizes active JWT token status with real-time countdown, roles, and provides
 *          deep claims inspection for application Bearer tokens and Microsoft Entra ID (MSAL).
 *
 * --- ARCHITECTURAL FLOW ---
 * 1. Observes Swagger UI Redux store and optional local storage fallback keys.
 * 2. Injects a status bar into Swagger UI top navigation.
 * 3. When an authentication scheme is authorized:
 *    - Decodes JWT payload (UTF-8 Base64Url).
 *    - Displays username, roles, and expiration countdown.
 * 4. Clicking the badge opens an interactive modal with:
 *    - Scheme switching between App Bearer and MSAL tokens.
 *    - Summary table of primary claims (Subject, Issuer, Audience, Roles, Expiration).
 *    - Formatted JSON payload view.
 *    - 1-click external debugger button (jwt.ms / jwt.io).
 *    - Copy raw token and payload actions.
 * 5. On logout, resets status bar and removes modals.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. GENERAL CONFIGURATION (Host Injection & Defaults)
    // =========================================================================
    const userConfig = window.SwaggerJwtConfig || {};

    const CONFIG = {
        /** Security scheme identifier for application Bearer tokens */
        APP_BEARER_SCHEME: userConfig.appSchemeName || "Bearer",

        /** Security scheme identifier for IDP / MSAL tokens */
        MSAL_SCHEME: userConfig.msalSchemeName || "MsalAuth",

        /** UI countdown refresh interval in milliseconds */
        COUNTDOWN_TICK_INTERVAL_MS: 1000,

        /** Warning threshold in seconds before expiration when badge turns amber */
        WARNING_THRESHOLD_SECONDS: typeof userConfig.expiringThresholdMinutes === "number"
            ? Math.max(10, Math.round(userConfig.expiringThresholdMinutes * 60))
            : 120,

        /** Preferred external JWT debugger link: "jwt.ms" | "jwt.io" */
        EXTERNAL_DEBUGGER: userConfig.externalDebugger === "jwt.io" ? "jwt.io" : "jwt.ms",

        /** Fallback localStorage keys to inspect for tokens */
        FALLBACK_STORAGE_KEYS: Array.isArray(userConfig.tokenStorageKeys) ? userConfig.tokenStorageKeys : [],

        /** Polling discovery interval for Swagger UI mounting */
        UI_DISCOVERY_INTERVAL_MS: 200,

        /** Maximum timeout for discovering window.ui */
        UI_DISCOVERY_TIMEOUT_MS: 30000,

        /** DOM element ID for the status bar container */
        STATUS_BAR_ELEMENT_ID: "swagger-jwt-status-bar",

        /** DOM element ID for the inspector modal */
        MODAL_ELEMENT_ID: "swagger-jwt-inspector-modal",

        /** Injected style element ID */
        STYLE_ELEMENT_ID: "swagger-jwt-inspector-styles"
    };

    /**
     * Standard and custom claims mapping highlighted in the modal summary table.
     * Struttura: { label: string, extract: (payload) => string[] | string | null }
     */
    // =========================================================================
    // 1.1 INTERNATIONALIZATION (i18n) ENGINE & DICTIONARIES
    // =========================================================================
    const I18N = {
        en: {
            statusBarTitle: "Click to open JWT Claims Inspector",
            unauthenticated: "🔒 JWT: Not authenticated",
            inspectPill: "🔍 Inspect",
            modalTitle: "JWT Claims Inspector",
            closeModal: "Close",
            tabBearer: "Application Bearer Token",
            tabMsal: "Microsoft Entra ID (MSAL)",
            tabEmpty: "(Empty)",
            summaryTitle: "Key Parameters Summary",
            payloadTitle: "Full Decoded JSON Payload",
            noTokenNotice: "No token present for this session.",
            copyTokenBtn: "📋 Copy JWT Token (Raw)",
            copyPayloadBtn: "📄 Copy Payload JSON",
            openDebuggerBtn: "🔗 Open in {debugger}",
            copiedFeedback: "✓ Copied!",
            claimUser: "User / Name",
            claimEmail: "Email",
            claimRoles: "Assigned Roles",
            claimUserId: "User ID (nameidentifier / sub)",
            claimIssuer: "Issuer (iss)",
            claimAudience: "Audience (aud)",
            claimExpiration: "Expiration (exp)",
            claimIssuedAt: "Issued At (iat)",
            claimTenant: "Tenant ID (tid / tenant)",
            noSpecificRole: "No specific role",
            expired: "Expired",
            expiresIn: "Expires in {time}"
        },
        it: {
            statusBarTitle: "Clicca per aprire il JWT Claims Inspector dettagliato",
            unauthenticated: "🔒 JWT: Non autenticato",
            inspectPill: "🔍 Ispeziona",
            modalTitle: "JWT Claims Inspector",
            closeModal: "Chiudi",
            tabBearer: "Bearer Token Applicativo",
            tabMsal: "Microsoft Entra ID (MSAL)",
            tabEmpty: "(Vuoto)",
            summaryTitle: "Riepilogo Parametri Chiave",
            payloadTitle: "Payload JSON Completo",
            noTokenNotice: "Nessun token presente per questa sessione.",
            copyTokenBtn: "📋 Copia JWT Token (Raw)",
            copyPayloadBtn: "📄 Copia Payload JSON",
            openDebuggerBtn: "🔗 Apri in {debugger}",
            copiedFeedback: "✓ Copiato!",
            claimUser: "Utente / Nome",
            claimEmail: "Email",
            claimRoles: "Ruoli Assegnati",
            claimUserId: "User ID (nameidentifier / sub)",
            claimIssuer: "Issuer (iss)",
            claimAudience: "Audience (aud)",
            claimExpiration: "Scadenza (exp)",
            claimIssuedAt: "Emesso il (iat)",
            claimTenant: "Tenant ID (tid / tenant)",
            noSpecificRole: "Nessun ruolo specifico",
            expired: "Scaduto",
            expiresIn: "Scade tra {time}"
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
                  (I18N["en"] && I18N["en"][key]) ||
                  defaultText;
        if (params && typeof params === "object") {
            for (const [k, v] of Object.entries(params)) {
                str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
            }
        }
        return str;
    }

    const SUMMARY_CLAIMS_MAPPING = [
        {
            claimKey: "claimUser", label: "User / Name",
            extract: (p) => extractUserName(p)
        },
        {
            claimKey: "claimEmail", label: "Email",
            extract: (p) => extractUserEmail(p)
        },
        {
            claimKey: "claimRoles", label: "Assigned Roles",
            extract: (p) => {
                const roles = extractUserRoles(p);
                if (Array.isArray(roles)) return roles.join(", ");
                if (typeof roles === "string") return roles;
                return t("noSpecificRole", "No specific role");
            }
        },
        {
            claimKey: "claimUserId", label: "User ID (nameidentifier / sub)",
            extract: (p) =>
                p["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ||
                p.sub ||
                p.oid ||
                null
        },
        {
            claimKey: "claimAudience", label: "Audience (aud)",
            extract: (p) => (Array.isArray(p.aud) ? p.aud.join(", ") : p.aud) || null
        },
        {
            claimKey: "claimIssuer", label: "Issuer (iss)",
            extract: (p) => p.iss || null
        },
        {
            label: "Permissions Mask",
            extract: (p) => p.permissions_mask || null
        },
        {
            claimKey: "claimIssuedAt", label: "Issued At (iat)",
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
            console.warn("[Swagger JWT Inspector] JWT decoding error:", error);
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
     * Computes time difference until expiration timestamp and returns formatted text and visual status.
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
     * Copies text to system clipboard and displays visual feedback on button.
     * @param {string} text - Text to copy.
     * @param {HTMLElement} buttonElement - Button element to display feedback on.
     * @param {string} defaultLabel - Default button label.
     */
    function copyToClipboard(text, buttonElement, defaultLabel) {
        if (!text) return;

        navigator.clipboard.writeText(text).then(() => {
            buttonElement.textContent = t("copiedFeedback", "✓ Copied!");
            buttonElement.classList.add("jwt-btn--copied");

            setTimeout(() => {
                buttonElement.textContent = defaultLabel;
                buttonElement.classList.remove("jwt-btn--copied");
            }, 1800);
        }).catch((err) => {
            console.error("[Swagger JWT Inspector] Clipboard copy error:", err);
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
     * Detects if dark mode is active by checking 'dark-mode' class on <html> or <body>.
     * @returns {boolean} True if dark-mode is active, false otherwise.
     */
    function isDarkModeActive() {
        return Boolean(
            document.documentElement.classList.contains("dark-mode") ||
            (document.body && document.body.classList.contains("dark-mode"))
        );
    }

    /**
     * Synchronizes '--dark' class on modal if open.
     */
    function applyTheme() {
        const dark = isDarkModeActive();
        const modal = document.getElementById(CONFIG.MODAL_ELEMENT_ID);
        if (modal) {
            modal.classList.toggle("jwt-modal-overlay--dark", dark);
        }
    }

    /**
     * Observes class mutations on <html> and <body> to update modal theme in real time.
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

            /* --- Status Bar in Swagger Navbar --- */
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

            /* --- Inspection Modal (Default: High-contrast light theme) --- */
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

            /* --- Modal Dark Theme --- */
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

            /* --- Primary Claims Summary Table --- */
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
    // 5. STATUS BAR RENDERING IN NAVBAR
    // =========================================================================

    /**
     * Inserts or updates the Status Bar inside Swagger UI navigation bar.
     */
    function renderStatusBar() {
        let statusBar = document.getElementById(CONFIG.STATUS_BAR_ELEMENT_ID);

        // Se non esiste ancora, cerchiamo il container target (.topbar-wrapper)
        if (!statusBar) {
            const topbarWrapper = document.querySelector(".swagger-ui .topbar .topbar-wrapper");
            if (!topbarWrapper) return; // Navbar non ancora renderizzata

            statusBar = document.createElement("div");
            statusBar.id = CONFIG.STATUS_BAR_ELEMENT_ID;
            statusBar.title = t("statusBarTitle", "Click to open JWT Claims Inspector");
            statusBar.addEventListener("click", openInspectorModal);

            topbarWrapper.appendChild(statusBar);
        }

        const currentPayload = activePayloads.bearer || activePayloads.msal;

        // Case 1: Unauthenticated
        if (!currentPayload) {
            statusBar.innerHTML = `
                <span class="jwt-status-indicator jwt-indicator--unauth"></span>
                <span class="jwt-status-badge">${t("unauthenticated", "🔒 JWT: Not authenticated")}</span>
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
            <span style="opacity: 0.7; font-size: 11px;">${t("inspectPill", "🔍 Inspect")}</span>
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
    // 6. MODAL RENDERING & LIFECYCLE (JWT Inspector Modal)
    // =========================================================================

    /**
     * Opens inspector modal window to examine token details.
     */
    function openInspectorModal() {
        closeInspectorModal(); // Close any orphaned instances

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
     * Dynamically updates modal content (used also on tab switch).
     * @param {HTMLElement} cardElement
     */
    function updateModalContent(cardElement) {
        const hasBearer = Boolean(activeTokens.bearer);
        const hasMsal = Boolean(activeTokens.msal);

        const currentToken = selectedInspectorTab === "bearer" ? activeTokens.bearer : activeTokens.msal;
        const currentPayload = selectedInspectorTab === "bearer" ? activePayloads.bearer : activePayloads.msal;

        // Generate summary table rows
        let tableRowsHtml = "";
        if (currentPayload) {
            SUMMARY_CLAIMS_MAPPING.forEach((claimDef) => {
                const val = claimDef.extract(currentPayload);
                if (val !== null && val !== undefined) {
                    tableRowsHtml += `
                        <tr>
                            <td class="jwt-claim-label">${escapeHtml(claimDef.claimKey ? t(claimDef.claimKey, claimDef.label) : claimDef.label)}</td>
                            <td class="jwt-claim-value">${escapeHtml(String(val))}</td>
                        </tr>
                    `;
                }
            });
        } else {
            tableRowsHtml = `
                <tr>
                    <td colspan="2" class="jwt-empty-notice">
                        ${t("noTokenNotice", "No token present for this session.")}
                    </td>
                </tr>
            `;
        }

        const formattedJson = currentPayload ? JSON.stringify(currentPayload, null, 2) : "No decodable data";

        cardElement.innerHTML = `
            <div class="jwt-modal-header">
                <h3 class="jwt-modal-title">
                    <span>🪪</span> ${t("modalTitle", "JWT Claims Inspector")}
                </h3>
                <button type="button" class="jwt-modal-close-btn" id="jwt-modal-btn-close" title="${t("closeModal", "Close")}">✕</button>
            </div>

            <div class="jwt-modal-tabs">
                <button type="button" class="jwt-tab-btn ${selectedInspectorTab === "bearer" ? "jwt-tab-btn--active" : ""}" id="jwt-tab-bearer">
                    ${t("tabBearer", "Application Bearer Token")} ${hasBearer ? "✓" : t("tabEmpty", "(Empty)")}
                </button>
                <button type="button" class="jwt-tab-btn ${selectedInspectorTab === "msal" ? "jwt-tab-btn--active" : ""}" id="jwt-tab-msal">
                    ${t("tabMsal", "Microsoft Entra ID (MSAL)")} ${hasMsal ? "✓" : t("tabEmpty", "(Empty)")}
                </button>
            </div>

            <div class="jwt-modal-body">
                <div>
                    <h4 class="jwt-section-title">
                        ${t("summaryTitle", "Key Parameters Summary")}
                    </h4>
                    <table class="jwt-summary-table">
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                </div>

                <div>
                    <h4 class="jwt-section-title">
                        ${t("payloadTitle", "Full Decoded JSON Payload")}
                    </h4>
                    <pre class="jwt-payload-viewer">${escapeHtml(formattedJson)}</pre>
                </div>
            </div>

            <div class="jwt-modal-footer">
                <button type="button" class="jwt-action-btn" id="jwt-btn-copy-token" ${!currentToken ? "disabled" : ""}>
                    ${t("copyTokenBtn", "📋 Copy JWT Token (Raw)")}
                </button>
                <button type="button" class="jwt-action-btn" id="jwt-btn-copy-payload" ${!currentPayload ? "disabled" : ""}>
                    ${t("copyPayloadBtn", "📄 Copy Payload JSON")}
                </button>
                ${currentToken ? `
                    <a href="${CONFIG.EXTERNAL_DEBUGGER === 'jwt.io' ? `https://jwt.io/?token=${encodeURIComponent(currentToken)}` : `https://jwt.ms/#access_token=${encodeURIComponent(currentToken)}`}" target="_blank" rel="noopener noreferrer" class="jwt-action-btn jwt-action-btn-debugger" style="text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                        ${t("openDebuggerBtn", `🔗 Open in ${CONFIG.EXTERNAL_DEBUGGER}`, { debugger: CONFIG.EXTERNAL_DEBUGGER })}
                    </a>
                ` : ""}
            </div>
        `;

        // Register modal button listeners
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
                copyToClipboard(currentToken, copyTokenBtn, "📋 Copy JWT Token (Raw)");
            });
        }

        const copyPayloadBtn = cardElement.querySelector("#jwt-btn-copy-payload");
        if (copyPayloadBtn && currentPayload) {
            copyPayloadBtn.addEventListener("click", () => {
                copyToClipboard(formattedJson, copyPayloadBtn, "📄 Copy Payload JSON");
            });
        }
    }

    /**
     * Closes and removes open modal window.
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
        if (authorizedSchemes && typeof authorizedSchemes.get === "function") {
            const entry = authorizedSchemes.get(CONFIG.APP_BEARER_SCHEME);
            if (entry) {
                if (typeof entry.get === "function") {
                    const val = entry.get("value");
                    if (val) return val;
                } else if (entry.value) {
                    return entry.value;
                }
            }
        }

        // Fallback to configured localStorage keys
        if (Array.isArray(CONFIG.FALLBACK_STORAGE_KEYS)) {
            for (const key of CONFIG.FALLBACK_STORAGE_KEYS) {
                try {
                    const stored = localStorage.getItem(key);
                    if (stored && typeof stored === "string" && stored.split(".").length === 3) {
                        return stored;
                    }
                } catch {}
            }
        }

        return null;
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

            // If modal is currently open, refresh its content
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
                            console.warn("[Swagger JWT Inspector] Error reading auth state:", err);
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
                    window.addEventListener("swagger-i18n:locale-changed", () => {
                        registerGuideDocumentation(true);
                        renderStatusBar();
                        const modal = document.getElementById(CONFIG.MODAL_ELEMENT_ID);
                        if (modal) {
                            const card = modal.querySelector(".jwt-modal-card");
                            if (card) updateModalContent(card);
                        }
                    });

                    console.info("[Swagger JWT Inspector] Inizializzato con successo.");
                    return;
                }
            }

            if (Date.now() - startTime >= CONFIG.UI_DISCOVERY_TIMEOUT_MS) {
                window.clearInterval(checkInterval);
                registerGuideDocumentation();
                console.warn("[Swagger JWT Inspector] Discovery timeout waiting for Swagger UI.");
            }
        }, CONFIG.UI_DISCOVERY_INTERVAL_MS);
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
                id: "jwt-inspector",
                name: "JWT Claims & Token Inspector",
                version: "1.0.0",
                description: "Decodes active JWT tokens (Bearer and MSAL) in real time with expiration countdown, roles, and claims inspection.",
                shortcuts: [
                    "Status Bar: Displays user, roles, and remaining token lifetime",
                    "Inspect Claims: Opens detailed modal with claims breakdown",
                    "Copy Token: Copies raw Bearer token string to clipboard"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                `,
                i18n: {
                    en: {
                        name: "JWT Claims & Token Inspector",
                        description: "Decodes active JWT tokens (Bearer and MSAL) in real time with expiration countdown, roles, and claims inspection.",
                        shortcuts: [
                            "Status Bar: Displays user, roles, and remaining token lifetime",
                            "Inspect Claims: Opens detailed modal with claims breakdown",
                            "Copy Token: Copies raw Bearer token string to clipboard"
                        ],
                        manual: `
### Overview
Provides complete transparency into authenticated user identity and token lifecycle in Swagger UI (supporting both Microsoft Entra ID and application Bearer tokens).

### Status Bar
Automatically displayed in the header upon authentication:
- **Identity & Roles**: shows principal username and RBAC roles.
- **Expiration Countdown**: real-time timer with color-coded warning as expiration approaches.

### Claims Inspection Modal
Clicking **"Inspect Claims"** opens the inspector modal:
- **Claims Table**: decodes standard and proprietary claims (\`sub\`, \`iss\`, \`aud\`, \`exp\`, \`roles\`, \`tenant\`).
- **Formatted JSON View**: inspect full decoded payload.
- **External Debugger**: 1-click launch in jwt.ms or jwt.io.
`
                    },
                    it: {
                        name: "JWT Claims & Token Inspector",
                        description: "Decodifica i token JWT attivi (Bearer e MSAL) in tempo reale con countdown di scadenza, ruoli e ispezione claims.",
                        shortcuts: [
                            "Status Bar: Mostra utente, ruoli e durata residua del token",
                            "Ispeziona Claims: Apre la modale dettagliata con la suddivisione dei parametri",
                            "Copia Token: Copia il token Bearer raw negli appunti"
                        ],
                        manual: `
### Panoramica
Offre totale trasparenza sull'identità dell'utente autenticato e sul ciclo di vita dei token in Swagger UI (supportando sia Microsoft Entra ID che token Bearer applicativi).

### Status Bar
Compare automaticamente nell'header alla presenza di un token valido:
- **Identità & Ruoli**: visualizza nome utente e ruoli RBAC principali.
- **Countdown Scadenza**: timer in tempo reale con warning visivo colorato all'approssimarsi della scadenza.

### Modale Ispezione Claims
Cliccando **"Ispeziona"** si apre la modale di dettaglio:
- **Tabella Parametri**: decodifica le claim standard e proprietarie (\`sub\`, \`iss\`, \`aud\`, \`exp\`, \`roles\`, \`tenant\`).
- **Visualizzatore JSON Formattato**: permette di visualizzare il payload grezzo decodificato con sintassi chiara.
- **Debugger Esterno**: pulsante con link diretto per aprire il token in jwt.ms o jwt.io.
`
                    }
                }
            });
        }
    }

    // =========================================================================
    // 8. PLUGIN BOOTSTRAP
    // =========================================================================
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeObserver);
    } else {
        initializeObserver();
    }
})();
