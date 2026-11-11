/**
 * @file swagger-token-interceptor.js
 * @summary Automazione avanzata dell'autenticazione Swagger UI con MSAL/Entra ID
 *          e token JWT applicativo interno.
 *
 * --- FLUSSO ARCHITETTURALE GENERALE ---
 * 1. L'utente esegue il login interattivo Microsoft (MSAL) tramite lo schema OpenAPI 'MsalAuth'.
 * 2. Un observer monitora lo store Redux interno di Swagger UI; alla ricezione dell'access_token di Entra ID:
 *    - Invia una richiesta HTTP POST all'endpoint interno dell'applicativo (/api/auth/token).
 *    - Estrae il token applicativo interno (da 'data.access_token').
 *    - Autentica automaticamente lo schema HTTP 'Bearer' di Swagger UI senza ricaricare la pagina.
 * 3. GESTIONE SCADENZA TOKEN (Punto 3):
 *    - Decodifica il payload JWT (Base64Url conforme a UTF-8) per estrarre il claim standard 'exp'.
 *    - Notifica la durata residua del token in minuti all'interno del toast di successo.
 *    - Imposta un timer per inviare un toast di avviso preventivo (~2 minuti prima della scadenza).
 *    - Imposta un timer finale per segnalare visivamente la scadenza avvenuta del token.
 * 4. GESTIONE LOGOUT SINCRONIZZATO (Punto 6):
 *    - Monitora l'annullamento dello schema MSAL nello store Redux.
 *    - Alla disconnessione di MSAL, revoca automaticamente l'autorizzazione dello schema 'Bearer'.
 *    - Cancella i timer pendenti di scadenza, svuota la memoria runtime e azzera i campi auto-compilati nel DOM.
 *    - Esegue un soft-reload ritardato per azzerare l'istanza PKCE interna di Swagger UI ed evitare errori invalid_grant.
 * 5. COMPILAZIONE PARAMETRI & RETE:
 *    - Compila dinamicamente gli input dei parametri manuali nel DOM (es. 'AzureAuthorization') tramite MutationObserver debouncato.
 *    - Traccia i campi auto-compilati con attributi data per evitare di sovrascrivere valori inseriti a mano.
 *    - Intercetta le chiamate 'fetch' per iniettare gli header secondari (token MSAL puro) sugli endpoint corrispondenti.
 * 6. CONCORRENZA & RESILIENZA:
 *    - Gestisce un contatore generazionale ('authGeneration') e segnali 'AbortController' per scartare risposte di rete obsolete.
 *    - Isola le richieste sull'origine locale per prevenire leak di token verso endpoint o CDN esterni.
 *
 * --- GUIDA ALLA MANUTENZIONE PER SVILUPPATORI / AGENTI IA ---
 * - Per rinominare lo schema MSAL: Modificare la costante MSAL_SCHEME_NAME.
 * - Per rinominare lo schema Bearer applicativo: Modificare APP_SCHEME_NAME.
 * - Per cambiare la rotta dell'endpoint di scambio token: Modificare EXCHANGE_ENDPOINT_URL.
 * - Per aggiungere o rimuovere header personalizzati (es. token MSAL puro): Aggiornare TARGET_HEADER_NAMES.
 *
 * Nota:
 * Swagger UI non garantisce stabilità delle proprie API interne/store Redux tra versioni.
 * Testare lo script quando Swagger UI viene aggiornato.
 */
(function () {
    "use strict";

    // =========================================================================
    // 1. CONFIGURAZIONE GENERALE (Parametri applicativi modificabili)
    // =========================================================================

    const userConfig = window.SwaggerAuthConfig || {};

    /** 
     * Nome identificativo dello schema OAuth2/MSAL registrato in AddSecurityDefinition in C#.
     * @type {string}
     */
    const MSAL_SCHEME_NAME = userConfig.msalSchemeName || "MsalAuth";

    /** 
     * Nome identificativo dello schema Bearer interno registrato in AddSecurityDefinition in C#.
     * @type {string}
     */
    const APP_SCHEME_NAME = userConfig.appSchemeName || "Bearer";

    /** 
     * Endpoint API del backend incaricato di scambiare il token MSAL con il token applicativo.
     * @type {string}
     */
    const EXCHANGE_ENDPOINT_URL = userConfig.exchangeEndpoint || "/api/auth/token";

    /** 
     * Lista degli header personalizzati da valorizzare con il token puro di MSAL (senza prefisso "Bearer ").
     * Usato sia per compilare i campi grafici di Swagger, sia nell'intercettore di rete fetch.
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

    /** Timeout massimo (ms) per l'attesa del caricamento dell'oggetto window.ui */
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
     * Contatore generazionale dello stato di autenticazione.
     * Consente di ignorare risposte asincrone arrivate in ritardo da sessioni precedenti.
     * @type {number}
     */
    let authGeneration = 0;

    /** Flag di blocco transitorio per evitare cicli durante la procedura di logout */
    let logoutInProgress = false;

    /** Flag di debounce per evitare scansioni DOM ridondanti ad ogni micro-mutazione */
    let autoFillScheduled = false;

    /** Flag che indica se il primo tentativo di parsing della specifica OpenAPI è stato eseguito */
    let specDetectionAttempted = false;

    /**
     * Mappatura dinamica degli endpoint e dei relativi header richiesti, popolata leggendo la specifica OpenAPI.
     * Struttura: Map<EndpointPathTemplate (es. '/api/ScheduleInterview/{id}'), ArrayOfHeaderNames>
     * @type {Map<string, string[]>}
     */
    const dynamicAzureAuthEndpoints = new Map();

    // =========================================================================
    // 3. SISTEMA DI NOTIFICA VISIVA (Toast UI)
    // =========================================================================

    /**
     * Mostra una notifica toast floating in alto a destra sullo schermo.
     * @param {string} message - Testo del messaggio da mostrare all'utente.
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
     * Calcola i minuti rimanenti prima della scadenza temporale specificata.
     * @param {number} expiresAtMs - Timestamp in millisecondi della data di scadenza.
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
            showToast(`Token applicativo applicato a "${APP_SCHEME_NAME}".`, "success");
            return;
        }

        const expiresAtMs = payload.exp * 1000;
        const remainingMs = expiresAtMs - Date.now();

        if (remainingMs <= 0) {
            showToast("Il token applicativo ricevuto risulta già scaduto.", "warning");
            return;
        }

        const totalMinutes = getRemainingMinutes(expiresAtMs);
        showToast(
            `Token applicativo applicato a "${APP_SCHEME_NAME}" (valido per circa ${totalMinutes} min).`,
            "success"
        );

        // Preavviso: 2 minuti prima della scadenza (o a metà vita se dura meno di 4 minuti)
        const warningOffsetMs = remainingMs > 240000 ? 120000 : Math.floor(remainingMs / 2);
        const timeUntilWarningMs = remainingMs - warningOffsetMs;

        if (timeUntilWarningMs > 0) {
            warningTimerId = window.setTimeout(() => {
                showToast(
                    "Il token applicativo scadrà a breve. Riesegui il login per rinnovarlo.",
                    "warning"
                );
            }, timeUntilWarningMs);
        }

        // Alert alla scadenza esatta del token
        expiredTimerId = window.setTimeout(() => {
            clearAuthorizedScheme(APP_SCHEME_NAME);
            showToast(
                "Il token applicativo è scaduto. Riesegui l'accesso per rinnovarlo.",
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
     * Estrae la mappa degli schemi attualmente autorizzati dallo stato Redux di Swagger.
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
    // 6. AUTO-POPOLAMENTO DEI PARAMETRI NEI FORM (DOM Observer)
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
     * Rimuove il valore esclusivamente dai campi che erano stati auto-popolati dallo script.
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
     * Esegue il debounce dell'auto-fill tramite requestAnimationFrame per ottimizzare le prestazioni del browser.
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
    // 7. PARSING DELLA SPECIFICA OPENAPI (Rilevamento Endpoint Dinamici)
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
     * Intercettore fetch globale: inietta il token MSAL negli header di destinazione se mancanti.
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

        // Scansione 'lazy' della specifica OpenAPI se non ancora effettuata
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
        return data?.data?.access_token || data?.access_token || null;
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
        const msalDurationText = msalExpiresAtMs && msalExpiresAtMs > Date.now()
            ? ` (valido per circa ${getRemainingMinutes(msalExpiresAtMs)} min)`
            : "";

        showToast(`Accesso Microsoft completato${msalDurationText}. Scambio token in corso...`, "info");

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
                showToast("Scambio riuscito, ma la risposta non contiene data.access_token.", "error");
                return;
            }

            const ui = getSwaggerUi();
            if (!ui?.authActions || typeof ui.authActions.authorize !== "function") {
                showToast(`Swagger UI non consente l'autorizzazione dello schema "${APP_SCHEME_NAME}".`, "error");
                return;
            }

            // Autorizzazione automatica dello schema Bearer
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

            // Pianifica il monitoraggio della scadenza del token appena applicato
            scheduleTokenExpirationAlerts(internalToken);
        } catch (error) {
            if (error?.name === "AbortError") return;

            console.error("[Swagger Auth] Errore durante lo scambio token:", error);
            if (generation === authGeneration && !logoutInProgress) {
                showToast("Errore durante lo scambio del token applicativo.", "error");
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
     * Esegue la pulizia a cascata: scollega Bearer, svuota la memoria e ricarica
     * la pagina per resettare l'istanza PKCE interna di Swagger UI ed evitare l'errore AADSTS501481.
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

        showToast("Sessione Microsoft chiusa. Ripristino sessione in corso...", "info");

        // Ricarica la pagina dopo un breve delay per azzerare lo stato PKCE corrotto in memoria
        window.setTimeout(() => {
            window.location.reload();
        }, 800);
    }

    // =========================================================================
    // 11. OBSERVER REDUX SWAGGER UI (Trigger Iniziale & Monitoraggio Sessione)
    // =========================================================================

    /**
     * Avvia il monitoraggio delle mutazioni dello store Redux di Swagger UI.
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

                        // Trigger del logout se prima esisteva una sessione MSAL attiva
                        if (lastMsalToken !== null) {
                            lastMsalToken = null;
                            handleLogout();
                        }
                    } catch (error) {
                        console.warn("[Swagger Auth] Errore nell'observer dello store:", error);
                    }
                });

                detectEndpointsFromSwaggerSpec();
                registerGuideDocumentation();
                window.addEventListener("swagger-activity-bar:ready", registerGuideDocumentation);
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
     * Pubblica i metadati e la documentazione del plugin nella guida interattiva dell'Activity Bar (ID 27).
     */
    function registerGuideDocumentation() {
        if (isGuideRegistered) return;
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerPluginGuide === "function") {
            isGuideRegistered = true;
            window.SwaggerActivityBar.registerPluginGuide({
                id: "token-interceptor",
                name: "Dual Token Interceptor (MSAL & Bearer)",
                version: "1.0.0",
                description: "Automatizza l'autenticazione a doppio livello: login Microsoft Entra ID -> token exchange interno -> Bearer applicativo dell'API.",
                shortcuts: [
                    "Authorize: Effettua il login Microsoft Entra ID nel popup standard",
                    "Auto-Exchange: Esegue lo scambio trasparente con /api/auth/token",
                    "Logout: Revoca e pulisce entrambe le sessioni contemporaneamente"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                `,
                manual: `
### Panoramica
Risolve la complessità dell'autenticazione a due fattori dell'API, che richiede sia l'identità Microsoft Entra ID che il token applicativo interno emesso dal backend.

### Flusso Automatizzato
1. Effettuando il login con il popup standard **Authorize** di Swagger, lo script cattura il token MSAL.
2. Invia in background il token all'endpoint interno di scambio (\`/api/auth/token\`).
3. Autorizza istantaneamente lo schema Bearer di Swagger con il token applicativo risultante.
4. Gestisce il logout coerente azzerando lo stato sia in Swagger UI che nello storage locale.
`
            });
        }
    }

    // =========================================================================
    // 12. AVVIO
    // =========================================================================

    initializeDomObserver();
    initializeSwaggerStoreObserver();
})();