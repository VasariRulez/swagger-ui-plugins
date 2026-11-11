/**
 * @file swagger-token-interceptor.js
 * @summary Automated dual-tier authentication plugin for Swagger UI (MSAL / Entra ID + App Bearer JWT).
 *
 * --- ARCHITECTURAL FLOW ---
 * 1. User performs interactive Microsoft MSAL login via OpenAPI schema ('MsalAuth').
 * 2. Redux observer detects Entra ID access_token:
 *    - Sends HTTP POST to token exchange endpoint (/api/auth/token).
 *    - Extracts application access token (from configurable tokenProperty).
 *    - Automatically authorizes Swagger UI Bearer scheme without page reload.
 *    - Optionally persists token to localStorage (storageKey).
 * 3. TOKEN LIFECYCLE & EXPIRATION:
 *    - Decodes JWT payload (UTF-8 Base64Url) to extract 'exp' claim.
 *    - Displays remaining lifetime in success toast.
 *    - Pre-warning timer (~2 minutes before expiration) and final expiration notification.
 * 4. SYNCHRONIZED LOGOUT:
 *    - Observes MSAL scheme logout in Redux store.
 *    - Revokes Bearer authorization, removes persisted token, and clears memory.
 *    - Delayed soft-reload resets Swagger UI internal PKCE state to prevent invalid_grant errors.
 * 5. PARAMETER AUTO-POPULATION & SECONDARY HEADERS:
 *    - Intercepts fetch calls to inject secondary headers on targeted endpoints.
 * 6. CONCURRENCY & RESILIENCE:
 *    - Generational counter ('authGeneration') and AbortController discard stale network responses.
 */
(function () {
    "use strict";

    // =========================================================================
    // 1. GENERAL CONFIGURATION (Host Injection & Defaults)
    // =========================================================================

    const userConfig = window.SwaggerAuthConfig || {};

    /** 
     * Security scheme identifier for IDP / MSAL registered in Swagger.
     * @type {string}
     */
    // =========================================================================
    // 1.1 INTERNATIONALIZATION (i18n) ENGINE & DICTIONARIES
    // =========================================================================
    const I18N = {
        en: {
            tokenApplied: 'Application token authorized for "{scheme}".',
            tokenExpiredAlready: "The received application token is already expired.",
            tokenAppliedWithDuration: 'Application token authorized for "{scheme}" (valid for ~{minutes} min).',
            tokenExpiringSoon: "Application token will expire soon. Please re-login to renew.",
            tokenExpired: "Application token has expired. Please re-authenticate.",
            msalSuccess: "Microsoft sign-in completed{duration}. Exchanging token...",
            msalDuration: " (valid for ~{minutes} min)",
            missingAccessToken: "Exchange succeeded, but response is missing data.access_token.",
            schemeNotAllowed: 'Swagger UI does not allow authorizing scheme "{scheme}".',
            exchangeError: "Error exchanging application token.",
            logoutNotice: "Microsoft session closed. Resetting session..."
        },
        it: {
            tokenApplied: 'Token applicativo applicato a "{scheme}".',
            tokenExpiredAlready: "Il token applicativo ricevuto risulta già scaduto.",
            tokenAppliedWithDuration: 'Token applicativo applicato a "{scheme}" (valido per circa {minutes} min).',
            tokenExpiringSoon: "Il token applicativo scadrà a breve. Riesegui il login per rinnovarlo.",
            tokenExpired: "Il token applicativo è scaduto. Riesegui l'accesso per rinnovarlo.",
            msalSuccess: "Accesso Microsoft completato{duration}. Scambio token in corso...",
            msalDuration: " (valido per circa {minutes} min)",
            missingAccessToken: "Scambio riuscito, ma la risposta non contiene data.access_token.",
            schemeNotAllowed: 'Swagger UI non consente di autorizzare lo schema "{scheme}".',
            exchangeError: "Errore durante lo scambio del token applicativo.",
            logoutNotice: "Sessione Microsoft chiusa. Ripristino sessione in corso..."
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

    const MSAL_SCHEME_NAME = userConfig.msalSchemeName || "MsalAuth";

    /** 
     * Security scheme identifier for application Bearer tokens in Swagger.
     * @type {string}
     */
    const APP_SCHEME_NAME = userConfig.appSchemeName || "Bearer";

    /** 
     * Backend API endpoint responsible for exchanging IDP tokens for API Bearer tokens.
     * @type {string}
     */
    const EXCHANGE_ENDPOINT_URL = userConfig.exchangeEndpoint || "/api/auth/token";

    /** 
     * Custom property name to extract access token from exchange JSON response.
     * @type {string|null}
     */
    const TOKEN_PROPERTY = userConfig.tokenProperty || null;

    /** 
     * List of headers to populate with raw IDP tokens.
     * @type {string[]}
     */
    const TARGET_HEADER_NAMES = Array.isArray(userConfig.targetHeaders) ? userConfig.targetHeaders : [
        "AzureAuthorization"
    ];

    /**
     * Verbi HTTP validi secondo lo standard OpenAPI per escludere proprietà descrittive dei path.
     * @type {Set<string>}
     */
    const HTTP_METHODS = new Set([
        "get",
        "put",
        "post",
        "delete",
        "options",
        "head",
        "patch",
        "trace"
    ]);

    /** Intervallo di polling (ms) per verificare l'inizializzazione di Swagger UI */
    const UI_DISCOVERY_INTERVAL_MS = 200;

    /** Maximum timeout (ms) waiting for window.ui */
    const UI_DISCOVERY_TIMEOUT_MS = 30000;

    /** Durata predefinita (ms) di permanenza dei banner toast a schermo */
    const TOAST_DURATION_MS = 5000;

    // =========================================================================
    // 2. STATO RUNTIME IN-MEMORY
    // =========================================================================

    /** 
     * Memorizza il token grezzo MSAL dell'ultima autenticazione riuscita.
     * @type {string|null}
     */
    let currentMsalToken = null;

    /** ID del timer JavaScript per l'avviso di pre-scadenza del token applicativo */
    let warningTimerId = null;

    /** ID del timer JavaScript per la notifica di avvenuta scadenza del token applicativo */
    let expiredTimerId = null;

    /** Controller per annullare richieste di scambio token in corso in caso di nuovo login o logout */
    let exchangeAbortController = null;

    /**
     * Generational counter of authentication state to discard stale async responses.
     * Consente di ignorare risposte asincrone arrivate in ritardo da sessioni precedenti.
     * @type {number}
     */
    let authGeneration = 0;

    /** Flag di blocco transitorio per evitare cicli durante la procedura di logout */
    let logoutInProgress = false;

    /** Flag di debounce per evitare scansioni DOM ridondanti ad ogni micro-mutazione */
    let autoFillScheduled = false;

    /** Flag indicating whether initial parsing of OpenAPI spec has been performed */
    let specDetectionAttempted = false;

    /**
     * Dynamic mapping of endpoints and required headers populated from OpenAPI spec.
     * Struttura: Map<EndpointPathTemplate (es. '/api/ScheduleInterview/{id}'), ArrayOfHeaderNames>
     * @type {Map<string, string[]>}
     */
    const dynamicAzureAuthEndpoints = new Map();

    // =========================================================================
    // 3. SISTEMA DI NOTIFICA VISIVA (Toast UI)
    // =========================================================================

    /**
     * Displays floating toast notification at top-right of screen.
     * @param {string} message - Message text to display to user.
     * @param {"info"|"success"|"warning"|"error"} [type="info"] - Tipologia di notifica (determina i colori del box).
     */
    function showToast(message, type = "info") {
        let container = document.getElementById("swagger-toast-container");

        if (!container) {
            container = document.createElement("div");
            container.id = "swagger-toast-container";

            Object.assign(container.style, {
                position: "fixed",
                top: "20px",
                right: "20px",
                zIndex: "99999",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                pointerEvents: "none",
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            });

            document.body.appendChild(container);
        }

        const themes = {
            info: { bg: "#0284c7", border: "#0369a1" },
            success: { bg: "#16a34a", border: "#15803d" },
            warning: { bg: "#d97706", border: "#b45309" },
            error: { bg: "#dc2626", border: "#b91c1c" }
        };

        const theme = themes[type] || themes.info;

        const toast = document.createElement("div");
        Object.assign(toast.style, {
            backgroundColor: theme.bg,
            borderLeft: `5px solid ${theme.border}`,
            color: "#ffffff",
            padding: "12px 18px",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            fontSize: "14px",
            fontWeight: "500",
            maxWidth: "380px",
            wordBreak: "break-word",
            opacity: "0",
            transform: "translateX(20px)",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        });

        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateX(0)";
        });

        // Rimozione ritardata automatica con fade out e distruzione del container orfano
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(20px)";

            setTimeout(() => {
                toast.remove();
                if (container.childElementCount === 0) {
                    container.remove();
                }
            }, 300);
        }, TOAST_DURATION_MS);
    }

    // =========================================================================
    // 4. GESTIONE SCADENZA TOKEN JWT (Decodifica UTF-8, Durata & Alert Preventivi)
    // =========================================================================

    /**
     * Decodifica il payload di un JWT (secondo blocco) gestendo correttamente caratteri UTF-8.
     * Non effettua validazione di firma crittografica (utilizzato esclusivamente per estrarre la scadenza 'exp').
     * @param {string} token - Token JWT serializzato ("header.payload.signature").
     * @returns {object|null} Payload JSON decodificato o null se il token non è valido.
     */
    function parseJwtPayload(token) {
        try {
            if (typeof token !== "string") return null;

            const parts = token.split(".");
            const base64Url = parts[1];
            if (!base64Url) return null;

            const base64 = base64Url
                .replace(/-/g, "+")
                .replace(/_/g, "/")
                .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");

            const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
            const jsonPayload = new TextDecoder("utf-8").decode(bytes);

            return JSON.parse(jsonPayload);
        } catch (error) {
            console.warn("[Swagger Auth] Impossibile decodificare il payload JWT:", error);
            return null;
        }
    }

    /**
     * Annulla tutti i timer di avviso scadenza pendenti.
     */
    function clearExpirationTimers() {
        if (warningTimerId !== null) {
            clearTimeout(warningTimerId);
            warningTimerId = null;
        }
        if (expiredTimerId !== null) {
            clearTimeout(expiredTimerId);
            expiredTimerId = null;
        }
    }

    /**
     * Computes remaining minutes before expiration timestamp.
     * @param {number} expiresAtMs - Expiration date timestamp in milliseconds.
     * @returns {number} Minuti arrotondati per eccesso (minimo 1).
     */
    function getRemainingMinutes(expiresAtMs) {
        return Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 60000));
    }

    /**
     * Pianifica i toast di notifica per il token applicativo (durata, preavviso e notifica di scadenza).
     * @param {string} token - Il token JWT applicativo emesso dal backend.
     */
    function scheduleTokenExpirationAlerts(token) {
        clearExpirationTimers();

        const payload = parseJwtPayload(token);
        if (!payload || typeof payload.exp !== "number") {
            showToast(t("tokenApplied", `Application token authorized for "${APP_SCHEME_NAME}".`, { scheme: APP_SCHEME_NAME }), "success");
            return;
        }

        const expiresAtMs = payload.exp * 1000;
        const remainingMs = expiresAtMs - Date.now();

        if (remainingMs <= 0) {
            showToast(t("tokenExpiredAlready", "The received application token is already expired."), "warning");
            return;
        }

        const totalMinutes = getRemainingMinutes(expiresAtMs);
        showToast(
            t("tokenAppliedWithDuration", `Application token authorized for "${APP_SCHEME_NAME}" (valid for ~${totalMinutes} min).`, { scheme: APP_SCHEME_NAME, minutes: totalMinutes }),
            "success"
        );

        // Pre-warning: 2 minutes before expiration (or midpoint if lifetime is under 4 minutes)
        const warningOffsetMs = remainingMs > 240000 ? 120000 : Math.floor(remainingMs / 2);
        const timeUntilWarningMs = remainingMs - warningOffsetMs;

        if (timeUntilWarningMs > 0) {
            warningTimerId = window.setTimeout(() => {
                showToast(
                    t("tokenExpiringSoon", "Application token will expire soon. Please re-login to renew."),
                    "warning"
                );
            }, timeUntilWarningMs);
        }

        // Alert alla scadenza esatta del token
        expiredTimerId = window.setTimeout(() => {
            clearAuthorizedScheme(APP_SCHEME_NAME);
            showToast(
                t("tokenExpired", "Application token has expired. Please re-authenticate."),
                "error"
            );
        }, remainingMs);
    }

    // =========================================================================
    // 5. UTILITÀ DI GESTIONE SCHEMI NELLO STORE DI SWAGGER UI
    // =========================================================================

    /**
     * Recupera in sicurezza l'istanza globale di Swagger UI.
     * @returns {object|null}
     */
    function getSwaggerUi() {
        return window.ui && typeof window.ui.getState === "function" ? window.ui : null;
    }

    /**
     * Extracts map of currently authorized schemes from Swagger Redux state.
     * @returns {object|null}
     */
    function getAuthorizedSchemes() {
        const ui = getSwaggerUi();
        if (!ui) return null;

        try {
            return ui.getState()?.get("auth")?.get("authorized") || null;
        } catch (error) {
            console.warn("[Swagger Auth] Impossibile leggere auth.authorized:", error);
            return null;
        }
    }

    /**
     * Verifica se un determinato schema di sicurezza risulta autorizzato in Swagger UI.
     * @param {string} schemeName
     * @returns {boolean}
     */
    function isSchemeAuthorized(schemeName) {
        const authorized = getAuthorizedSchemes();
        return Boolean(authorized && typeof authorized.get === "function" && authorized.get(schemeName));
    }

    /**
     * Revoca lo stato di autorizzazione per un determinato schema di sicurezza.
     * @param {string} schemeName
     */
    function clearAuthorizedScheme(schemeName) {
        const ui = getSwaggerUi();
        if (!ui?.authActions || typeof ui.authActions.logout !== "function") return;
        if (!isSchemeAuthorized(schemeName)) return;

        try {
            ui.authActions.logout([schemeName]);
        } catch (error) {
            console.warn(`[Swagger Auth] Impossibile scollegare lo schema "${schemeName}":`, error);
        }
    }

    // =========================================================================
    // 6. AUTO-POPULATION OF FORM PARAMETERS (DOM Observer)
    // =========================================================================

    /**
     * Imposta il valore su un elemento HTMLInputElement notificando i dispatcher interni di React.
     * @param {HTMLInputElement} input
     * @param {string} value
     */
    function setReactInputValue(input, value) {
        const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");

        if (descriptor?.set) {
            descriptor.set.call(input, value);
        } else {
            input.value = value;
        }

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    /**
     * Scansiona il DOM e inietta il token MSAL nei campi corrispondenti agli header configurati.
     * Marca i campi con un attributo data per non cancellare eventuali valori inseriti a mano.
     */
    function autoFillInputFields() {
        if (!currentMsalToken) return;

        for (const headerName of TARGET_HEADER_NAMES) {
            const inputs = document.querySelectorAll(`input[placeholder="${CSS.escape(headerName)}"]`);
            for (const input of inputs) {
                if (!input.value) {
                    setReactInputValue(input, currentMsalToken);
                    input.dataset.swaggerAutoFilled = "true";
                }
            }
        }
    }

    /**
     * Removes values exclusively from inputs that were auto-populated by the script.
     */
    function clearAutoFilledInputFields() {
        for (const headerName of TARGET_HEADER_NAMES) {
            const inputs = document.querySelectorAll(`input[placeholder="${CSS.escape(headerName)}"]`);
            for (const input of inputs) {
                if (input.dataset.swaggerAutoFilled === "true") {
                    setReactInputValue(input, "");
                    delete input.dataset.swaggerAutoFilled;
                }
            }
        }
    }

    /**
     * Debounces auto-population via requestAnimationFrame to optimize browser performance.
     */
    function scheduleAutoFill() {
        if (autoFillScheduled) return;

        autoFillScheduled = true;
        requestAnimationFrame(() => {
            autoFillScheduled = false;
            autoFillInputFields();
        });
    }

    /**
     * Inizializza l'osservatore per intercettare l'apertura dinamica di sezioni o form di Swagger UI.
     */
    function initializeDomObserver() {
        if (!document.documentElement) return;

        const observer = new MutationObserver(scheduleAutoFill);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    // =========================================================================
    // 7. OPENAPI SPECIFICATION PARSING (Dynamic Endpoint Discovery)
    // =========================================================================

    function normalizeHeaderName(headerName) {
        return String(headerName || "").trim().toLowerCase();
    }

    function isTargetHeader(headerName) {
        const normalized = normalizeHeaderName(headerName);
        return TARGET_HEADER_NAMES.some(
            configured => normalizeHeaderName(configured) === normalized
        );
    }

    function getSwaggerSpecJson() {
        const ui = getSwaggerUi();
        if (!ui) return null;

        try {
            return ui.getState()?.getIn?.(["spec", "json"]) || null;
        } catch (error) {
            console.warn("[Swagger Auth] Impossibile leggere la specifica OpenAPI:", error);
            return null;
        }
    }

    /**
     * Risolve eventuali riferimenti OpenAPI $ref nei parametri (#/components/parameters/...).
     */
    function resolveParameterReference(parameter, specJson) {
        if (!parameter || typeof parameter.get !== "function") return parameter;

        const ref = parameter.get("$ref");
        if (!ref || typeof ref !== "string") return parameter;

        const prefix = "#/components/parameters/";
        if (!ref.startsWith(prefix)) return parameter;

        const paramName = ref.slice(prefix.length);
        return specJson?.getIn?.(["components", "parameters", paramName]) || parameter;
    }

    function getHeaderNamesFromParameters(parameters, specJson) {
        const names = new Set();
        if (!parameters || typeof parameters.forEach !== "function") return names;

        parameters.forEach(rawParam => {
            const param = resolveParameterReference(rawParam, specJson);
            if (!param || typeof param.get !== "function") return;

            const location = param.get("in");
            const name = param.get("name");

            if (location === "header" && isTargetHeader(name)) {
                names.add(
                    TARGET_HEADER_NAMES.find(
                        configured => normalizeHeaderName(configured) === normalizeHeaderName(name)
                    )
                );
            }
        });

        return names;
    }

    function combineParameters(pathParameters, operationParameters) {
        const combined = [];
        if (pathParameters && typeof pathParameters.forEach === "function") {
            pathParameters.forEach(p => combined.push(p));
        }
        if (operationParameters && typeof operationParameters.forEach === "function") {
            operationParameters.forEach(p => combined.push(p));
        }
        return combined;
    }

    /**
     * Ispeziona lo schema OpenAPI e mappa tutte le rotte che dichiarano gli header definiti in TARGET_HEADER_NAMES.
     * @returns {boolean} True se la specifica è stata letta con successo.
     */
    function detectEndpointsFromSwaggerSpec() {
        const specJson = getSwaggerSpecJson();
        if (!specJson) return false;

        const paths = specJson.get("paths");
        if (!paths || typeof paths.forEach !== "function") return false;

        dynamicAzureAuthEndpoints.clear();

        paths.forEach((pathItem, pathTemplate) => {
            if (!pathItem || typeof pathItem.get !== "function") return;

            const pathParams = pathItem.get("parameters");

            pathItem.forEach((operation, methodName) => {
                const normalizedMethod = String(methodName || "").toLowerCase();
                if (!HTTP_METHODS.has(normalizedMethod)) return;
                if (!operation || typeof operation.get !== "function") return;

                const opParams = operation.get("parameters");
                const combined = combineParameters(pathParams, opParams);
                const headers = getHeaderNamesFromParameters(combined, specJson);

                if (headers.size === 0) return;

                const existingHeaders = dynamicAzureAuthEndpoints.get(pathTemplate) || [];
                const mergedHeaders = new Set(existingHeaders);
                headers.forEach(h => mergedHeaders.add(h));

                dynamicAzureAuthEndpoints.set(pathTemplate, [...mergedHeaders]);
            });
        });

        specDetectionAttempted = true;
        console.info(`[Swagger Auth] Rilevati ${dynamicAzureAuthEndpoints.size} endpoint OpenAPI con header MSAL.`);
        return true;
    }

    function escapeRegex(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function endpointPathToRegex(pathTemplate) {
        const parts = String(pathTemplate).split(/(\{[^}]+\})/);
        const pattern = parts
            .map(part => /^\{[^}]+\}$/.test(part) ? "[^/]+" : escapeRegex(part))
            .join("");

        return new RegExp(`^${pattern}/?$`, "i");
    }

    function getHeadersForPathname(pathname) {
        const headersToInject = new Set();
        for (const [pathTemplate, headerNames] of dynamicAzureAuthEndpoints.entries()) {
            if (endpointPathToRegex(pathTemplate).test(pathname)) {
                for (const headerName of headerNames) {
                    headersToInject.add(headerName);
                }
            }
        }
        return [...headersToInject];
    }

    // =========================================================================
    // 8. INTERNET NETWORK INTERCEPTOR (Fetch wrapper)
    // =========================================================================

    const originalFetch = window.fetch.bind(window);

    function getRequestUrl(resource) {
        if (resource instanceof Request) {
            return new URL(resource.url, window.location.origin);
        }
        return new URL(String(resource), window.location.origin);
    }

    function createRequestWithInjectedHeaders(resource, options, headersToInject) {
        const request = new Request(resource, options);
        const headers = new Headers(request.headers);
        let hasChanges = false;

        for (const headerName of headersToInject) {
            if (!headers.has(headerName)) {
                headers.set(headerName, currentMsalToken);
                hasChanges = true;
            }
        }

        if (!hasChanges) return request;
        return new Request(request, { headers });
    }

    /**
     * Global fetch interceptor: injects MSAL token into targeted headers if missing.
     */
    window.fetch = async function swaggerTokenInterceptor(resource, options = {}) {
        let requestUrl;

        try {
            requestUrl = getRequestUrl(resource);
        } catch (error) {
            console.warn("[Swagger Auth] URL non interpretabile; richiesta non alterata:", error);
            return originalFetch(resource, options);
        }

        // Sicurezza: non propagare mai i token verso origini terze o endpoint esterni
        if (requestUrl.origin !== window.location.origin) {
            return originalFetch(resource, options);
        }

        // Esclude la chiamata interna di scambio token per evitare loop
        if (requestUrl.pathname === EXCHANGE_ENDPOINT_URL) {
            return originalFetch(resource, options);
        }

        if (!currentMsalToken) {
            return originalFetch(resource, options);
        }

        // Lazy scan of OpenAPI spec if not yet executed
        if (!specDetectionAttempted || dynamicAzureAuthEndpoints.size === 0) {
            detectEndpointsFromSwaggerSpec();
        }

        const headersToInject = getHeadersForPathname(requestUrl.pathname);
        if (headersToInject.length === 0) {
            return originalFetch(resource, options);
        }

        try {
            const request = createRequestWithInjectedHeaders(resource, options, headersToInject);
            console.info(`[Swagger Auth] Header iniettati su ${requestUrl.pathname}: ${headersToInject.join(", ")}`);
            return originalFetch(request);
        } catch (error) {
            console.warn("[Swagger Auth] Impossibile iniettare gli header; invio richiesta originale:", error);
            return originalFetch(resource, options);
        }
    };

    // =========================================================================
    // 9. SCAMBIO TOKEN E GESTIONE AUTORIZZAZIONE APPLICATIVA
    // =========================================================================

    function getTokenFromMsalAuthEntry(msalAuthEntry) {
        if (!msalAuthEntry || typeof msalAuthEntry.get !== "function") return null;
        const tokenObject = msalAuthEntry.get("token");
        if (!tokenObject || typeof tokenObject.get !== "function") return null;

        return tokenObject.get("access_token") || tokenObject.get("token") || null;
    }

    function getInternalTokenFromExchangeResponse(data) {
        if (TOKEN_PROPERTY && data) {
            if (data[TOKEN_PROPERTY]) return data[TOKEN_PROPERTY];
            if (data.data && data.data[TOKEN_PROPERTY]) return data.data[TOKEN_PROPERTY];
        }
        return data?.data?.access_token || data?.access_token || data?.token || null;
    }

    async function getExchangeErrorMessage(response) {
        try {
            const text = await response.text();
            return text ? `HTTP ${response.status}: ${text.slice(0, 300)}` : `HTTP ${response.status}`;
        } catch {
            return `HTTP ${response.status}`;
        }
    }

    /**
     * Invia il token MSAL all'endpoint interno e autorizza automaticamente lo schema Bearer in Swagger.
     * Gestisce race condition annullando chiamate precedenti tramite AbortController.
     * @param {string} msalToken
     */
    async function exchangeAndSetToken(msalToken) {
        if (!msalToken || logoutInProgress) return;

        currentMsalToken = msalToken;
        autoFillInputFields();

        // Incrementa la generazione per invalidare risposte asincrone obsolete
        authGeneration += 1;
        const generation = authGeneration;

        exchangeAbortController?.abort();
        exchangeAbortController = new AbortController();

        // Calcolo durata residua token MSAL per il messaggio informativo
        const msalPayload = parseJwtPayload(msalToken);
        const msalExpiresAtMs = msalPayload?.exp ? msalPayload.exp * 1000 : null;
        const msalRemainingMin = msalExpiresAtMs && msalExpiresAtMs > Date.now() ? getRemainingMinutes(msalExpiresAtMs) : null;
        const msalDurationText = msalRemainingMin
            ? t("msalDuration", ` (valid for ~${msalRemainingMin} min)`, { minutes: msalRemainingMin })
            : "";

        showToast(t("msalSuccess", `Microsoft sign-in completed${msalDurationText}. Exchanging token...`, { duration: msalDurationText }), "info");

        try {
            const response = await originalFetch(EXCHANGE_ENDPOINT_URL, {
                method: "POST",
                signal: exchangeAbortController.signal,
                headers: {
                    Authorization: `Bearer ${msalToken}`,
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) {
                throw new Error(await getExchangeErrorMessage(response));
            }

            const data = await response.json();

            // Ignora la risposta se durante il tragitto c'è stato un logout o un altro login
            if (generation !== authGeneration || logoutInProgress) return;

            const internalToken = getInternalTokenFromExchangeResponse(data);
            if (!internalToken) {
                showToast(t("missingAccessToken", "Exchange succeeded, but response is missing data.access_token."), "error");
                return;
            }

            const ui = getSwaggerUi();
            if (!ui?.authActions || typeof ui.authActions.authorize !== "function") {
                showToast(t("schemeNotAllowed", `Swagger UI does not allow authorizing scheme "${APP_SCHEME_NAME}".`, { scheme: APP_SCHEME_NAME }), "error");
                return;
            }

            // Automatically authorize Bearer scheme
            ui.authActions.authorize({
                [APP_SCHEME_NAME]: {
                    name: APP_SCHEME_NAME,
                    schema: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT"
                    },
                    value: internalToken
                }
            });

            // Schedule expiration timer for newly applied token
            scheduleTokenExpirationAlerts(internalToken);
        } catch (error) {
            if (error?.name === "AbortError") return;

            console.error("[Swagger Auth] Error during token exchange:", error);
            if (generation === authGeneration && !logoutInProgress) {
                showToast(t("exchangeError", "Error exchanging application token."), "error");
            }
        } finally {
            if (generation === authGeneration) {
                exchangeAbortController = null;
            }
        }
    }

    // =========================================================================
    // 10. GESTIONE LOGOUT SINCRONIZZATO (Reset Sessione & Fallback Reload)
    // =========================================================================

    /**
     * Cascading cleanup: revokes Bearer scheme, clears memory, and triggers reload
     * the page to reset Swagger UI internal PKCE instance and avoid AADSTS501481.
     */
    function handleLogout() {
        if (logoutInProgress) return;

        logoutInProgress = true;
        authGeneration += 1;

        exchangeAbortController?.abort();
        exchangeAbortController = null;

        currentMsalToken = null;
        clearExpirationTimers();

        clearAuthorizedScheme(APP_SCHEME_NAME);
        clearAutoFilledInputFields();

        showToast(t("logoutNotice", "Microsoft session closed. Resetting session..."), "info");

        // Ricarica la pagina dopo un breve delay per azzerare lo stato PKCE corrotto in memoria
        window.setTimeout(() => {
            window.location.reload();
        }, 800);
    }

    // =========================================================================
    // 11. SWAGGER UI REDUX OBSERVER (Initial Trigger & Session Monitor)
    // =========================================================================

    /**
     * Starts observing mutations in Swagger UI Redux store.
     */
    function initializeSwaggerStoreObserver() {
        const startedAt = Date.now();

        const checkUiInterval = window.setInterval(() => {
            const ui = getSwaggerUi();

            if (ui && typeof ui.getStore === "function") {
                window.clearInterval(checkUiInterval);

                const store = ui.getStore();
                if (!store || typeof store.subscribe !== "function") {
                    console.warn("[Swagger Auth] Store Swagger UI non disponibile.");
                    return;
                }

                let lastMsalToken = null;

                store.subscribe(() => {
                    try {
                        const state = store.getState();
                        const authorizedSchemes = state?.get("auth")?.get("authorized");

                        const msalAuthEntry = authorizedSchemes?.get(MSAL_SCHEME_NAME);
                        const currentToken = getTokenFromMsalAuthEntry(msalAuthEntry);

                        if (currentToken) {
                            if (logoutInProgress) logoutInProgress = false;

                            if (currentToken !== lastMsalToken) {
                                lastMsalToken = currentToken;
                                void exchangeAndSetToken(currentToken);
                            }
                            return;
                        }

                        // Trigger logout if an active MSAL session previously existed
                        if (lastMsalToken !== null) {
                            lastMsalToken = null;
                            handleLogout();
                        }
                    } catch (error) {
                        console.warn("[Swagger Auth] Error in store observer:", error);
                    }
                });

                detectEndpointsFromSwaggerSpec();
                registerGuideDocumentation();
                window.addEventListener("swagger-activity-bar:ready", registerGuideDocumentation);
    window.addEventListener("swagger-i18n:locale-changed", () => {
        registerGuideDocumentation(true);
    });
                console.info("[Swagger Auth] Observer autenticazione Swagger UI inizializzato.");
                return;
            }

            if (Date.now() - startedAt >= UI_DISCOVERY_TIMEOUT_MS) {
                window.clearInterval(checkUiInterval);
                registerGuideDocumentation();
                console.warn(`[Swagger Auth] Swagger UI non rilevata entro ${UI_DISCOVERY_TIMEOUT_MS / 1000} secondi.`);
            }
        }, UI_DISCOVERY_INTERVAL_MS);
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
                id: "token-interceptor",
                name: "Automated Token Exchange & Interceptor",
                version: "1.0.0",
                description: "Seamless bridge between identity providers (e.g. MSAL / Microsoft Entra ID) and backend API Bearer tokens with automated exchange and lifecycle alerts.",
                shortcuts: [
                    "Automated Exchange: Transparently requests application Bearer JWT upon MSAL sign-in",
                    "Lifetime Alerts: Shows toast countdown and pre-warning before token expires",
                    "Synchronized Logout: Revokes credentials and resets Swagger PKCE state"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                `,
                i18n: {
                    en: {
                        name: "Automated Token Exchange & Interceptor",
                        description: "Seamless bridge between identity providers (e.g. MSAL / Microsoft Entra ID) and backend API Bearer tokens with automated exchange and lifecycle alerts.",
                        shortcuts: [
                            "Automated Exchange: Transparently requests application Bearer JWT upon MSAL sign-in",
                            "Lifetime Alerts: Shows toast countdown and pre-warning before token expires",
                            "Synchronized Logout: Revokes credentials and resets Swagger PKCE state"
                        ],
                        manual: `
### Overview
Solves dual-tier enterprise authentication architecture: user logs in via corporate IDP (MSAL), and Swagger automatically exchanges the ID token for an internal application JWT Bearer token without requiring manual developer copy-paste.

### Key Capabilities
- **Zero-Click Exchange**: catches Redux store authorization and immediately calls the exchange endpoint.
- **Expiration Alerts**: floating toast notification alerts developers 2 minutes before the token expires.
- **Synchronized Logout**: logging out of MSAL cleanly revokes the Bearer scheme and resets Swagger UI state.
`
                    },
                    it: {
                        name: "Intercettatore & Scambio Token Automatico",
                        description: "Ponte automatizzato tra provider di identità aziendali (MSAL / Entra ID) e token Bearer applicativi con notifiche sul ciclo di vita.",
                        shortcuts: [
                            "Scambio Automatico: Richiede il token applicativo subito dopo il login MSAL",
                            "Avvisi Scadenza: Notifiche toast con durata residua e preavviso",
                            "Logout Sincronizzato: Revoca le credenziali e azzera lo stato PKCE di Swagger"
                        ],
                        manual: `
### Panoramica
Risolve l'architettura a doppio livello tipica delle applicazioni aziendali: l'utente si autentica tramite IDP (MSAL / Entra ID) e Swagger UI scambia istantaneamente il token ID con il JWT applicativo interno, eliminando copia-incolla manuali.

### Funzionalità Principali
- **Scambio Trasparente**: intercetta l'evento di login nello store Redux e chiama l'endpoint di backend dedicato (\`/api/auth/token\`).
- **Avvisi di Scadenza**: notifiche toast fluttuanti avvisano con 2 minuti di anticipo prima che il token scada.
- **Logout Sincronizzato**: alla disconnessione da MSAL, revoca automaticamente anche lo schema Bearer e ricarica pulitamente lo stato interno.
`
                    }
                }
            });
        }
    }

    // =========================================================================
    // 12. INITIALIZATION
    // =========================================================================

    initializeDomObserver();
    initializeSwaggerStoreObserver();
})();