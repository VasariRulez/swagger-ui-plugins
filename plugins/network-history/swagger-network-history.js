/**
 * @file swagger-network-history.js
 * @summary Plugin Swagger UI per la cronologia delle chiamate di rete, metriche di performance e replay automatico (ID 11 & ID 10).
 *
 * DESCRIZIONE:
 * Intercetta in modo non distruttivo tutte le richieste HTTP (fetch) effettuate tramite Swagger UI.
 * Per ogni chiamata eseguita:
 *  1. Misura la latenza effettiva in millisecondi (⏱ ms) e la dimensione del payload (📦 KB / B).
 *  2. Inietta badge di performance inline accanto al codice HTTP di risposta nel DOM di Swagger UI (ID 10).
 *  3. Memorizza la cronologia completa in un buffer circolare persistente in localStorage (ID 11).
 *  4. Fornisce un Drawer laterale destro da 480px perfettamente integrato con l'Activity Bar (o fallback),
 *     con ricerca testuale, chip di filtro per status code (2xx, 4xx, 5xx) e schede dettagliate Request/Response.
 *  5. Funzionalità [🔄 Replay]: scorrimento fluido fino all'endpoint, apertura accordion, evidenziazione glow,
 *     auto-compilazione di parametri/body e trigger automatico del pulsante Execute.
 *  6. Funzionalità [↺ Ripristina]: compila tutti i parametri consentendo modifiche manuali prima dell'invio.
 *
 * GUIDA ALLA MANUTENZIONE PER SVILUPPATORI:
 * - Per modificare il numero massimo di chiamate memorizzate: aggiornare CONFIG.MAX_HISTORY_ENTRIES.
 * - Per modificare le soglie di latenza dei badge colorati: aggiornare CONFIG.LATENCY_THRESHOLDS.
 * - Per modificare i percorsi URL ignorati dall'intercettore: aggiornare CONFIG.IGNORED_URL_PATTERNS.
 * - Per modificare la larghezza del Drawer o le chiavi localStorage: verificare CONFIG.
 */

(() => {
    "use strict";

    // =========================================================================
    // 1. CONFIGURAZIONE GENERALE (Modificabile dallo sviluppatore)
    // =========================================================================

    const CONFIG = {
        /** Chiave utilizzata in localStorage per persistere la cronologia */
        STORAGE_KEY: "swp_swagger_network_history",

        /** Numero massimo di richieste memorizzate nel buffer circolare */
        MAX_HISTORY_ENTRIES: 50,

        /** Larghezza in pixel del Drawer laterale destro */
        DRAWER_WIDTH_PX: 480,

        /** Soglie per la colorazione della latenza (in millisecondi) */
        LATENCY_THRESHOLDS: {
            FAST: 500,     // < 500ms verde
            MEDIUM: 1500   // 500-1500ms giallo/arancio, > 1500ms rosso
        },

        /** ID degli elementi DOM principali generati dallo script */
        ELEMENT_IDS: {
            DRAWER: "swp-network-history-drawer",
            STYLES: "swp-network-history-styles",
            TRIGGER_FALLBACK: "swp-network-history-trigger-btn",
            SEARCH_INPUT: "swp-nh-search-input",
            LIST_CONTAINER: "swp-nh-list-container",
            COUNT_BADGE: "swp-nh-count-badge",
            CLEAR_BTN: "swp-nh-clear-btn"
        },

        /** Pattern URL e asset da ignorare nell'intercettore di rete */
        IGNORED_URL_PATTERNS: [
            /\.js(\?.*)?$/i,
            /\.css(\?.*)?$/i,
            /\/swagger\/v1\/swagger\.json/i,
            /\/favicon\.ico/i,
            /\/_framework\//i,
            /\/oauth2-redirect\.html/i
        ]
    };

    // =========================================================================
    // 2. STATO APPLICATIVO INTERNO
    // =========================================================================

    const state = {
        /** Elenco ordinato degli elementi della cronologia (il più recente per primo) */
        history: [],

        /** Filtro testuale attivo (percorso, metodo, query) */
        searchFilter: "",

        /** Filtro per categoria di status code ("all", "2xx", "4xx", "5xx") */
        statusFilter: "all",

        /** ID dell'elemento correntemente espanso nella vista dettagli */
        expandedItemId: null,

        /** Scheda attiva nel dettaglio dell'elemento ("request" | "response") */
        activeDetailTab: "request",

        /** Flag che indica se il Drawer è attualmente aperto */
        isDrawerOpen: false,

        /** Mappa dell'ultima risposta per associazione rapida con le sezioni Swagger */
        lastResponsesByRoute: new Map()
    };

    // =========================================================================
    // 3. FUNZIONI DI UTILITÀ (Stringhe, Formattazione, Temi, React Setter)
    // =========================================================================

    /**
     * Genera un identificativo univoco per ogni voce della cronologia.
     * @returns {string}
     */
    function generateId() {
        return "nh_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    }

    /**
     * Rimuove eventuali caratteri zero-width (\u200B) iniettati da Swagger UI nei percorsi e nei tag.
     * @param {string} str
     * @returns {string}
     */
    function cleanZeroWidth(str) {
        if (!str || typeof str !== "string") return "";
        return str.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    }

    /**
     * Sanifica una stringa per prevenire vulnerabilità XSS nel DOM.
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
     * Formatta un orario nel formato leggibile "HH:mm:ss".
     * @param {Date} date
     * @returns {string}
     */
    function formatTime(date) {
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    /**
     * Formatta una dimensione in byte in stringa Human-Readable (B, KB, MB).
     * @param {number} bytes
     * @returns {string}
     */
    function formatBytes(bytes) {
        if (typeof bytes !== "number" || isNaN(bytes) || bytes <= 0) return "0 B";
        if (bytes < 1024) return `${bytes} B`;
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        const mb = kb / 1024;
        return `${mb.toFixed(2)} MB`;
    }

    /**
     * Estrae il path relativo senza query string da un URL assoluto o relativo.
     * @param {string} urlString
     * @returns {string}
     */
    function extractPath(urlString) {
        try {
            const urlObj = new URL(urlString, window.location.origin);
            return urlObj.pathname;
        } catch {
            const noQuery = urlString.split("?")[0];
            return noQuery;
        }
    }

    /**
     * Estrae i parametri di query string come dizionario chiave/valore.
     * @param {string} urlString
     * @returns {Record<string, string>}
     */
    function extractQueryParams(urlString) {
        const params = {};
        try {
            const urlObj = new URL(urlString, window.location.origin);
            urlObj.searchParams.forEach((val, key) => {
                params[key] = val;
            });
        } catch {
            // Fallback parsing manuale
            const queryIdx = urlString.indexOf("?");
            if (queryIdx !== -1) {
                const search = urlString.substring(queryIdx + 1);
                search.split("&").forEach((pair) => {
                    const [k, v] = pair.split("=");
                    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
                });
            }
        }
        return params;
    }

    /**
     * Verifica se il tema scuro è attualmente attivo nella pagina.
     * @returns {boolean}
     */
    function isDarkMode() {
        return (
            document.documentElement.classList.contains("dark-mode") ||
            document.body.classList.contains("dark-mode") ||
            document.querySelector(".dark-mode") !== null
        );
    }

    /**
     * Copia un testo negli appunti con feedback visivo sul pulsante trigger.
     * @param {string} text
     * @param {HTMLElement} buttonElement
     * @param {string} [successText="Copiato!"]
     */
    function copyToClipboard(text, buttonElement, successText = "Copiato!") {
        if (!text) return;
        const originalText = buttonElement.innerHTML;

        const setFeedback = (msg) => {
            buttonElement.textContent = msg;
            setTimeout(() => {
                buttonElement.innerHTML = originalText;
            }, 1400);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
                .then(() => setFeedback(successText))
                .catch(() => fallbackCopy(text, setFeedback, successText));
        } else {
            fallbackCopy(text, setFeedback, successText);
        }
    }

    /**
     * Fallback di copia tramite textarea invisibile.
     */
    function fallbackCopy(text, callback, successText) {
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            callback(ok ? successText : "Errore");
        } catch {
            callback("Errore");
        }
    }

    /**
     * Aggiorna il valore di un input controllato da React scatenando gli eventi sintetici.
     * @param {HTMLInputElement} input
     * @param {string} value
     */
    function setReactInputValue(input, value) {
        if (!input) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (nativeSetter) {
            nativeSetter.call(input, value);
        } else {
            input.value = value;
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    /**
     * Aggiorna il valore di una textarea controllata da React scatenando gli eventi sintetici.
     * @param {HTMLTextAreaElement} textarea
     * @param {string} value
     */
    function setReactTextareaValue(textarea, value) {
        if (!textarea) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
        if (nativeSetter) {
            nativeSetter.call(textarea, value);
        } else {
            textarea.value = value;
        }
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        textarea.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    /**
     * Tenta di formattare una stringa come JSON indentato se valida, altrimenti la restituisce tal quale.
     * @param {string} str
     * @returns {string}
     */
    function tryFormatJson(str) {
        if (!str || typeof str !== "string") return str || "";
        try {
            const parsed = JSON.parse(str);
            return JSON.stringify(parsed, null, 2);
        } catch {
            return str;
        }
    }

    // =========================================================================
    // 4. PERSISTENZA LOCAL STORAGE (Buffer Circolare)
    // =========================================================================

    /**
     * Carica lo storico delle chiamate memorizzate dal localStorage.
     */
    function loadHistoryFromStorage() {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (!raw) {
                state.history = [];
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                state.history = parsed.slice(0, CONFIG.MAX_HISTORY_ENTRIES);
            }
        } catch (error) {
            console.warn("[Network History] Errore nel caricamento della cronologia:", error);
            state.history = [];
        }
    }

    /**
     * Salva l'attuale cronologia in localStorage applicando il limite circolare.
     */
    function saveHistoryToStorage() {
        try {
            // Limita a MAX_HISTORY_ENTRIES elementi
            if (state.history.length > CONFIG.MAX_HISTORY_ENTRIES) {
                state.history = state.history.slice(0, CONFIG.MAX_HISTORY_ENTRIES);
            }
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.history));
        } catch (error) {
            console.warn("[Network History] Quota storage superata o errore di scrittura:", error);
        }
    }

    /**
     * Svuota completamente la cronologia con conferma dell'utente.
     */
    function clearHistory() {
        if (state.history.length === 0) return;
        const confirmed = window.confirm("Sei sicuro di voler svuotare tutta la cronologia delle chiamate di rete?");
        if (!confirmed) return;

        state.history = [];
        state.expandedItemId = null;
        saveHistoryToStorage();
        renderHistoryList();
        updateHeaderBadge();
    }

    // =========================================================================
    // 5. INTERCETTORE DI RETE (Patched window.fetch)
    // =========================================================================

    /**
     * Determina se una richiesta HTTP verso un URL debba essere intercettata o ignorata.
     * @param {string} url
     * @returns {boolean}
     */
    function shouldInterceptRequest(url) {
        if (!url || typeof url !== "string") return false;
        for (const pattern of CONFIG.IGNORED_URL_PATTERNS) {
            if (pattern.test(url)) return false;
        }
        return true;
    }

    /**
     * Estrae gli header di richiesta convertendoli in un oggetto semplice chiave/valore.
     * @param {RequestInfo|RequestInit} options
     * @returns {Record<string, string>}
     */
    function extractRequestHeaders(options) {
        const result = {};
        if (!options || !options.headers) return result;

        try {
            if (options.headers instanceof Headers) {
                options.headers.forEach((val, key) => {
                    result[key] = val;
                });
            } else if (Array.isArray(options.headers)) {
                options.headers.forEach(([k, v]) => {
                    result[k] = v;
                });
            } else if (typeof options.headers === "object") {
                Object.assign(result, options.headers);
            }
        } catch {
            // Ignora errori di parsing header
        }

        return result;
    }

    /**
     * Estrae il body di richiesta convertendolo in stringa testuale.
     * @param {any} body
     * @returns {string}
     */
    function extractRequestBodyString(body) {
        if (!body) return "";
        if (typeof body === "string") return body;
        try {
            if (body instanceof FormData) {
                const obj = {};
                body.forEach((val, key) => {
                    obj[key] = typeof val === "string" ? val : `[File: ${val.name} (${val.size} bytes)]`;
                });
                return JSON.stringify(obj, null, 2);
            }
            if (body instanceof URLSearchParams) {
                return body.toString();
            }
            return JSON.stringify(body);
        } catch {
            return "[Payload non serializzabile]";
        }
    }

    /**
     * Installa l'intercettore fetch globale non distruttivo.
     */
    function installFetchInterceptor() {
        const originalFetch = window.fetch;
        if (!originalFetch) return;

        window.fetch = async function (...args) {
            const requestInput = args[0];
            const requestInit = args[1] || {};

            let requestUrl = "";
            let requestMethod = (requestInit.method || "GET").toUpperCase();

            if (typeof requestInput === "string") {
                requestUrl = requestInput;
            } else if (requestInput instanceof Request) {
                requestUrl = requestInput.url;
                requestMethod = (requestInput.method || requestMethod).toUpperCase();
            }

            // Se la richiesta non deve essere tracciata, esegui il fetch originale trasparente
            if (!shouldInterceptRequest(requestUrl)) {
                return originalFetch.apply(this, args);
            }

            const startTime = performance.now();
            const requestDate = new Date();
            const requestHeaders = extractRequestHeaders(requestInit);
            const requestBodyText = extractRequestBodyString(requestInit.body);

            try {
                const response = await originalFetch.apply(this, args);
                const durationMs = Math.round(performance.now() - startTime);

                // Clone non distruttivo della response per leggere il body senza consumare lo stream
                const responseClone = response.clone();
                let responseBodyText = "";
                let sizeBytes = 0;

                try {
                    responseBodyText = await responseClone.text();
                    // Calcolo dimensione effettiva del payload
                    sizeBytes = new Blob([responseBodyText]).size;
                } catch {
                    // Risposta non leggibile come testo (es. stream binario)
                    responseBodyText = "[Contenuto binario o non testuale]";
                }

                // Estrazione header di risposta
                const responseHeaders = {};
                response.headers.forEach((val, key) => {
                    responseHeaders[key] = val;
                });

                // Creazione elemento della cronologia
                const historyItem = {
                    id: generateId(),
                    timestamp: requestDate.toISOString(),
                    timeFormatted: formatTime(requestDate),
                    method: requestMethod,
                    url: requestUrl,
                    path: extractPath(requestUrl),
                    queryParams: extractQueryParams(requestUrl),
                    status: response.status,
                    statusText: response.statusText || getStatusTextFallback(response.status),
                    durationMs: durationMs,
                    sizeBytes: sizeBytes,
                    sizeFormatted: formatBytes(sizeBytes),
                    request: {
                        headers: requestHeaders,
                        body: requestBodyText
                    },
                    response: {
                        headers: responseHeaders,
                        body: responseBodyText
                    }
                };

                // Aggiunge in cima alla cronologia
                state.history.unshift(historyItem);
                saveHistoryToStorage();

                // Aggiorna la mappa dell'ultima risposta per la rotta
                state.lastResponsesByRoute.set(historyItem.path, historyItem);

                // Iniezione badge metriche inline nel DOM di Swagger UI (ID 10)
                injectInlineMetricsBadge(historyItem);

                // Aggiornamento dell'interfaccia Drawer
                renderHistoryList();
                updateHeaderBadge();

                return response;
            } catch (networkError) {
                const durationMs = Math.round(performance.now() - startTime);

                // Registra la chiamata fallita a livello di rete
                const failedItem = {
                    id: generateId(),
                    timestamp: requestDate.toISOString(),
                    timeFormatted: formatTime(requestDate),
                    method: requestMethod,
                    url: requestUrl,
                    path: extractPath(requestUrl),
                    queryParams: extractQueryParams(requestUrl),
                    status: 0,
                    statusText: networkError.message || "Network Error / Connection Refused",
                    durationMs: durationMs,
                    sizeBytes: 0,
                    sizeFormatted: "0 B",
                    request: {
                        headers: requestHeaders,
                        body: requestBodyText
                    },
                    response: {
                        headers: {},
                        body: String(networkError)
                    }
                };

                state.history.unshift(failedItem);
                saveHistoryToStorage();
                renderHistoryList();
                updateHeaderBadge();

                throw networkError;
            }
        };
    }

    /**
     * Fallback testuale per codici HTTP comuni se statusText è vuoto.
     * @param {number} status
     * @returns {string}
     */
    function getStatusTextFallback(status) {
        const map = {
            200: "OK", 201: "Created", 204: "No Content",
            400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
            409: "Conflict", 422: "Unprocessable Entity",
            500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable"
        };
        return map[status] || "";
    }

    // =========================================================================
    // 6. METRICHE INLINE (ID 10: Iniezione badge ⏱ ms e 📦 KB in Swagger UI)
    // =========================================================================

    /**
     * Determina la classe CSS per la latenza in base alle soglie configurate.
     * @param {number} ms
     * @returns {"fast"|"medium"|"slow"}
     */
    function getLatencyClass(ms) {
        if (ms < CONFIG.LATENCY_THRESHOLDS.FAST) return "fast";
        if (ms < CONFIG.LATENCY_THRESHOLDS.MEDIUM) return "medium";
        return "slow";
    }

    /**
     * Inietta il badge con metriche di latenza e dimensione accanto all'intestazione "Server response" in Swagger UI.
     * Mantiene la tabella sottostante (Code e Details) pulita e allineata.
     * Include tentativi scaglionati nel tempo per attendere il completamento del rendering React di Swagger.
     * @param {object} item
     */
    function injectInlineMetricsBadge(item) {
        let attempts = 0;
        const maxAttempts = 7;

        function tryInject() {
            attempts++;
            const opblocks = document.querySelectorAll(".swagger-ui .opblock");
            let injected = false;

            for (const opblock of opblocks) {
                const pathEl = opblock.querySelector(".opblock-summary-path a, .opblock-summary-path span");
                const methodEl = opblock.querySelector(".opblock-summary-method");

                if (!pathEl || !methodEl) continue;

                const opMethod = methodEl.textContent.trim().toUpperCase();
                const opPath = pathEl.textContent.trim();

                // Verifica se questo opblock corrisponde alla chiamata effettuata
                if (opMethod === item.method && isPathMatchingTemplate(item.path, opPath)) {
                    // Cerca l'intestazione "Server response" (h4 o h5)
                    let headerEl = null;
                    const headers = opblock.querySelectorAll(".responses-wrapper h4, .responses-inner h4, h4");
                    for (const h of headers) {
                        if (h.textContent.toLowerCase().includes("server response")) {
                            headerEl = h;
                            break;
                        }
                    }

                    if (headerEl) {
                        let badgeWrap = headerEl.querySelector(".swp-metrics-badge-wrap");
                        if (!badgeWrap) {
                            badgeWrap = document.createElement("span");
                            badgeWrap.className = "swp-metrics-badge-wrap";
                            headerEl.appendChild(badgeWrap);
                        }

                        const latClass = getLatencyClass(item.durationMs);
                        badgeWrap.innerHTML = `
                            <span class="swp-metric-badge swp-metric-badge--latency swp-metric-badge--${latClass}" title="Tempo di risposta del server">
                                ⏱ ${item.durationMs} ms
                            </span>
                            <span class="swp-metric-badge swp-metric-badge--size" title="Dimensione del payload restituito">
                                📦 ${item.sizeFormatted}
                            </span>
                        `;

                        // Rimuovi eventuali badge rimasti accidentalmente nella tabella di risposta
                        opblock.querySelectorAll(".response-col_status .swp-metrics-badge-wrap, thead .swp-metrics-badge-wrap").forEach((el) => {
                            el.remove();
                        });

                        injected = true;
                    }
                }
            }

            if (!injected && attempts < maxAttempts) {
                setTimeout(tryInject, 180);
            }
        }

        tryInject();
    }

    /**
     * Verifica se una route effettiva (es. /api/Candidate/123) corrisponde a un template Swagger (es. /api/Candidate/{id}).
     * @param {string} actualPath
     * @param {string} templatePath
     * @returns {boolean}
     */
    function isPathMatchingTemplate(actualPath, templatePath) {
        if (!actualPath || !templatePath) return false;
        if (actualPath === templatePath) return true;

        // Normalizza rimuovendo slash finale
        const cleanActual = actualPath.replace(/\/$/, "");
        const cleanTemplate = templatePath.replace(/\/$/, "");

        const actualSegments = cleanActual.split("/").filter(Boolean);
        const templateSegments = cleanTemplate.split("/").filter(Boolean);

        if (actualSegments.length !== templateSegments.length) return false;

        for (let i = 0; i < templateSegments.length; i++) {
            const tSeg = templateSegments[i];
            const aSeg = actualSegments[i];
            // Se il segmento del template è un parametro {param}, accetta qualsiasi valore
            if (tSeg.startsWith("{") && tSeg.endsWith("}")) continue;
            if (tSeg.toLowerCase() !== aSeg.toLowerCase()) return false;
        }

        return true;
    }

    // =========================================================================
    // 7. ENGINE DI REPLAY & RIPRISTINO CAMPI (ID 11)
    // =========================================================================

    /**
     * Risolve il tag (controller) associato a un endpoint tramite la specifica OpenAPI o tramite euristica sul percorso.
     * @param {string} method
     * @param {string} path
     * @returns {string|null}
     */
    function resolveTagForRoute(method, path) {
        // 1. Dallo store Redux / spec OpenAPI di Swagger UI
        try {
            const ui = window.ui;
            if (ui && typeof ui.getState === "function") {
                const spec = ui.getState().get("spec")?.get("json");
                const specObj = spec && typeof spec.toJS === "function" ? spec.toJS() : spec;
                if (specObj && specObj.paths) {
                    for (const [specPath, pathItem] of Object.entries(specObj.paths)) {
                        if (isPathMatchingTemplate(path, specPath)) {
                            const op = pathItem[method.toLowerCase()];
                            if (op && Array.isArray(op.tags) && op.tags.length > 0) {
                                return op.tags[0];
                            }
                        }
                    }
                }
            }
        } catch {
            // Ignora errori di parsing dello state
        }

        // 2. Euristica dai segmenti del percorso (es. /api/Candidate/Grid -> Candidate)
        const clean = path.replace(/^\/?(api\/)?/i, "");
        const firstSegment = clean.split("/")[0];
        if (firstSegment) return firstSegment;

        return null;
    }

    /**
     * Trova la sezione DOM del controller genitore (.opblock-tag-section) in Swagger UI.
     * @param {string} tag
     * @returns {HTMLElement|null}
     */
    function findTagSection(tag) {
        if (!tag) return null;
        const normalizedTargetTag = cleanZeroWidth(tag).toLowerCase();

        // 1. Ricerca per ID convenzionale generato da Swagger UI
        const sanitizedId = tag.replace(/\s+/g, "_");
        const byId = document.getElementById(`operations-tag-${tag}`)
                  || document.getElementById(`operations-tag-${sanitizedId}`);
        if (byId) return byId.closest(".opblock-tag-section") || byId;

        // 2. Ricerca per attributo data-tag
        try {
            const byData = document.querySelector(`.swagger-ui [data-tag="${CSS.escape(tag)}"]`);
            if (byData) return byData.closest(".opblock-tag-section") || byData;
        } catch { }

        // 3. Scansione esaustiva di tutte le sezioni tag nel DOM
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
     * Assicura che la sezione del controller/tag genitore sia aperta.
     * @param {HTMLElement} tagSection
     * @returns {boolean} True se ha cliccato per aprirla, False se era già aperta
     */
    function ensureTagSectionOpen(tagSection) {
        if (!tagSection) return false;
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
     * Assicura che l'operazione (.opblock) sia espansa cliccando il controllo designato.
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
     * Trova l'elemento .opblock corrispondente al metodo e al percorso specificati.
     * @param {string} method
     * @param {string} path
     * @returns {HTMLElement|null}
     */
    function findOpblockForRoute(method, path) {
        const normalizedMethod = (method || "").toUpperCase().trim();
        const opblocks = document.querySelectorAll(".swagger-ui .opblock");
        for (const opblock of opblocks) {
            const pathEl = opblock.querySelector(".opblock-summary-path a, .opblock-summary-path span");
            const methodEl = opblock.querySelector(".opblock-summary-method");
            if (!pathEl || !methodEl) continue;

            const opMethod = methodEl.textContent.trim().toUpperCase();
            const opPath = cleanZeroWidth(pathEl.textContent.trim());

            if (opMethod === normalizedMethod && isPathMatchingTemplate(path, opPath)) {
                return opblock;
            }
        }
        return null;
    }

    /**
     * Esegue il Replay di una chiamata precedente, compilando i parametri e premendo Execute.
     * Gestisce l'apertura asincrona del tag controller se collassato e centra la testa dell'endpoint.
     * @param {string} itemId
     * @param {boolean} [autoExecute=true] Se false, compila i campi senza premere Execute.
     */
    async function replayRequest(itemId, autoExecute = true) {
        const item = state.history.find((x) => x.id === itemId);
        if (!item) return;

        // 1. Cerca l'opblock nel DOM corrente
        let opblock = findOpblockForRoute(item.method, item.path);

        // Se l'opblock non è presente nel DOM, il controller genitore potrebbe essere collassato
        if (!opblock) {
            const tag = resolveTagForRoute(item.method, item.path);
            const tagSection = findTagSection(tag);

            if (tagSection) {
                ensureTagSectionOpen(tagSection);

                // Swagger UI (React) monta gli opblock in modo asincrono; attesa con polling
                let attempts = 0;
                const maxAttempts = 25; // 25 * 30ms = 750ms max
                await new Promise((resolve) => {
                    const poll = setInterval(() => {
                        attempts++;
                        opblock = findOpblockForRoute(item.method, item.path);
                        if (opblock || attempts >= maxAttempts) {
                            clearInterval(poll);
                            resolve();
                        }
                    }, 30);
                });
            }
        } else {
            // Se l'opblock è già nel DOM, assicurati comunque che il controller sia espanso
            const tagSection = opblock.closest(".opblock-tag-section");
            if (tagSection) ensureTagSectionOpen(tagSection);
        }

        if (!opblock) {
            alert(`Impossibile trovare l'endpoint [${item.method}] ${item.path} nella documentazione Swagger corrente.`);
            return;
        }

        // 2. Espandi l'operazione (.opblock) se chiusa
        ensureOpblockOpen(opblock);

        // 3. Centra la TESTA dell'endpoint (.opblock-summary) a video (NON il centro della card gigante!)
        await sleep(60);
        const headerElement = opblock.querySelector(".opblock-summary") || opblock;
        headerElement.scrollIntoView({ behavior: "smooth", block: "center" });

        // 4. Evidenziazione visiva Glow per focalizzare l'attenzione
        highlightOpblockGlow(opblock);

        // 5. Attiva "Try it out" se non ancora premuto
        await sleep(100);
        const tryOutBtn = opblock.querySelector(".btn.try-out__btn");
        if (tryOutBtn && !tryOutBtn.classList.contains("cancel")) {
            tryOutBtn.click();
            await sleep(150);
        }

        // 6. Popola i parametri query e path
        populateOpblockParameters(opblock, item);

        // 7. Popola il Request Body
        if (item.request && item.request.body && !["GET", "HEAD"].includes(item.method)) {
            populateOpblockBody(opblock, item.request.body);
        }

        await sleep(150);

        // 8. Se richiesto l'autoExecute, preme il pulsante Execute di Swagger UI
        if (autoExecute) {
            const executeBtn = opblock.querySelector(".btn.execute, .btn.execute.opblock-control__btn");
            if (executeBtn) {
                executeBtn.click();
                showReplayFeedback(opblock, "Richiesta rieseguita con successo!");
            }
        } else {
            showReplayFeedback(opblock, "Campi ripristinati. Pronto per l'invio manuale.");
        }
    }

    /**
     * Applica un effetto visivo temporaneo di glow per guidare lo sguardo dell'utente.
     * @param {HTMLElement} opblock
     */
    function highlightOpblockGlow(opblock) {
        opblock.classList.add("swp-replay-glow");
        setTimeout(() => {
            opblock.classList.remove("swp-replay-glow");
        }, 2200);
    }

    /**
     * Compila i parametri di query e path nell'interfaccia dell'operazione.
     * @param {HTMLElement} opblock
     * @param {object} item
     */
    function populateOpblockParameters(opblock, item) {
        const queryParams = item.queryParams || {};

        // Itera le righe di parametri nella tabella parametri di Swagger
        const paramRows = opblock.querySelectorAll("tr.parameters[data-param-name], .parameters-col_name");

        paramRows.forEach((row) => {
            const nameEl = row.querySelector(".parameter__name") || row;
            const paramName = nameEl?.textContent?.trim().replace(/\*$/, "");
            if (!paramName) return;

            // Se il parametro è presente nei queryParams della chiamata
            if (queryParams[paramName] !== undefined) {
                const input = row.closest("tr")?.querySelector("input, select") || row.querySelector("input, select");
                if (input instanceof HTMLInputElement) {
                    setReactInputValue(input, queryParams[paramName]);
                }
            }
        });
    }

    /**
     * Inserisce il payload nel campo Request Body dell'operazione Swagger UI.
     * @param {HTMLElement} opblock
     * @param {string} bodyText
     */
    function populateOpblockBody(opblock, bodyText) {
        const bodyTextarea = opblock.querySelector(".body-param__text, textarea.body-param__text, .parameters textarea");
        if (bodyTextarea) {
            setReactTextareaValue(bodyTextarea, bodyText);
        }
    }

    /**
     * Mostra un piccolo avviso fluttuante accanto all'endpoint con l'esito del replay.
     * @param {HTMLElement} opblock
     * @param {string} message
     */
    function showReplayFeedback(opblock, message) {
        const existing = opblock.querySelector(".swp-replay-feedback-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.className = "swp-replay-feedback-toast";
        toast.textContent = message;
        opblock.appendChild(toast);

        setTimeout(() => {
            toast.classList.add("is-fading");
            setTimeout(() => toast.remove(), 400);
        }, 2200);
    }

    /**
     * Attesa asincrona in millisecondi.
     * @param {number} ms
     * @returns {Promise<void>}
     */
    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Genera il comando cURL formattato a partire da un elemento di cronologia.
     * @param {object} item
     * @returns {string}
     */
    function buildCurlCommand(item) {
        const lines = [`curl -X ${item.method} "${item.url}"`];

        if (item.request && item.request.headers) {
            for (const [key, val] of Object.entries(item.request.headers)) {
                const kLower = key.toLowerCase();
                // Omette header di controllo del browser
                if (kLower.startsWith("sec-") || ["host", "connection", "content-length"].includes(kLower)) {
                    continue;
                }
                lines.push(`  -H "${key}: ${val}"`);
            }
        }

        if (item.request && item.request.body && !["GET", "HEAD"].includes(item.method)) {
            const escaped = item.request.body.replace(/"/g, '\\"');
            lines.push(`  -d "${escaped}"`);
        }

        return lines.join(" \\\n");
    }

    // =========================================================================
    // 8. DRAWER UI & ACTIVITY BAR INTEGRATION
    // =========================================================================

    /**
     * Inietta il Drawer nel DOM e registra l'icona nell'Activity Bar.
     */
    function initDrawer() {
        injectStyles();
        renderDrawerDom();
        registerWithActivityBar();
    }

    /**
     * Registra l'icona del plugin nell'Activity Bar globale (se presente), altrimenti genera il trigger fallback.
     * Include polling di sicurezza per rilevare l'Activity Bar anche in caso di caricamento asincrono.
     */
    function registerWithActivityBar() {
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerItem === "function") {
            window.SwaggerActivityBar.registerItem({
                id: "network-history",
                title: "Cronologia Richieste & Performance (Network History)",
                iconHtml: `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                `,
                onClick: () => toggleDrawer(),
                section: "top",
                order: 25,
                isActive: false
            });

            // Se era stato precedentemente renderizzato il trigger di fallback, rimuovilo
            document.getElementById(CONFIG.ELEMENT_IDS.TRIGGER_FALLBACK)?.remove();
            return;
        }

        // Fallback: inietta il pulsante standard nella pagina Swagger UI (se Activity Bar assente)
        renderFallbackTrigger();

        // Controllo asincrono: se l'Activity Bar viene registrata poco dopo, esegui la migrazione automatica
        let attempts = 0;
        const checkInterval = setInterval(() => {
            attempts++;
            if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerItem === "function") {
                clearInterval(checkInterval);
                registerWithActivityBar();
            } else if (attempts >= 15) {
                clearInterval(checkInterval);
            }
        }, 200);
    }

    /**
     * Inietta il pulsante trigger di fallback in Swagger UI (se l'Activity Bar è assente).
     * Cerca sequenzialmente .scheme-container .schemes, .topbar-wrapper o .information-container.
     */
    function renderFallbackTrigger() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.TRIGGER_FALLBACK)) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = CONFIG.ELEMENT_IDS.TRIGGER_FALLBACK;
        btn.className = "swp-nh-fallback-btn";
        btn.title = "Apri / Chiudi Cronologia Chiamate (Network History)";
        btn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Network History</span>
        `;
        btn.addEventListener("click", () => toggleDrawer());

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
            return;
        }

        // Se Swagger non ha ancora renderizzato la testata, riprova tra breve
        setTimeout(renderFallbackTrigger, 300);
    }

    /**
     * Crea e appende la struttura HTML del Drawer nel body.
     */
    function renderDrawerDom() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.DRAWER)) return;

        const drawer = document.createElement("aside");
        drawer.id = CONFIG.ELEMENT_IDS.DRAWER;
        drawer.setAttribute("aria-label", "Cronologia chiamate di rete");

        drawer.innerHTML = `
            <!-- Header Drawer -->
            <div class="swp-nh-header">
                <div class="swp-nh-header-left">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span class="swp-nh-title">Network History</span>
                    <span id="${CONFIG.ELEMENT_IDS.COUNT_BADGE}" class="swp-nh-count-badge">0</span>
                </div>
                <div class="swp-nh-header-right">
                    <button type="button" id="${CONFIG.ELEMENT_IDS.CLEAR_BTN}" class="swp-nh-btn-icon" title="Svuota tutta la cronologia">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span>Svuota</span>
                    </button>
                    <button type="button" class="swp-nh-btn-icon swp-nh-btn-close" title="Chiudi pannello (Esc)">
                        ✕
                    </button>
                </div>
            </div>

            <!-- Toolbar di Ricerca & Filtri -->
            <div class="swp-nh-toolbar">
                <div class="swp-nh-search-wrap">
                    <svg class="swp-nh-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" id="${CONFIG.ELEMENT_IDS.SEARCH_INPUT}" class="swp-nh-search-input" placeholder="Filtra per URL, rotta o metodo..." />
                    <button type="button" class="swp-nh-search-clear" title="Cancella ricerca" style="display:none;">✕</button>
                </div>

                <div class="swp-nh-filter-chips">
                    <button type="button" class="swp-nh-chip is-active" data-status-filter="all">Tutti</button>
                    <button type="button" class="swp-nh-chip swp-nh-chip--2xx" data-status-filter="2xx">🟢 2xx</button>
                    <button type="button" class="swp-nh-chip swp-nh-chip--4xx" data-status-filter="4xx">🟡 4xx</button>
                    <button type="button" class="swp-nh-chip swp-nh-chip--5xx" data-status-filter="5xx">🔴 5xx</button>
                </div>
            </div>

            <!-- Lista Cronologia Chiamate -->
            <div id="${CONFIG.ELEMENT_IDS.LIST_CONTAINER}" class="swp-nh-list">
                <!-- Voci iniettate dinamicamente -->
            </div>
        `;

        document.body.appendChild(drawer);
        attachDrawerDomEvents(drawer);
        renderHistoryList();
        updateHeaderBadge();
    }

    /**
     * Aggancia i listener di evento per ricerca, filtri e chiusura del Drawer.
     * @param {HTMLElement} drawer
     */
    function attachDrawerDomEvents(drawer) {
        // Chiusura drawer
        drawer.querySelector(".swp-nh-btn-close")?.addEventListener("click", () => toggleDrawer(false));
        drawer.querySelector(`#${CONFIG.ELEMENT_IDS.CLEAR_BTN}`)?.addEventListener("click", clearHistory);

        // Chiusura tramite tasto ESC
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && state.isDrawerOpen) {
                toggleDrawer(false);
            }
        });

        // Ricerca testuale
        const searchInput = drawer.querySelector(`#${CONFIG.ELEMENT_IDS.SEARCH_INPUT}`);
        const searchClear = drawer.querySelector(".swp-nh-search-clear");

        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                state.searchFilter = e.target.value.trim().toLowerCase();
                if (searchClear) searchClear.style.display = state.searchFilter ? "block" : "none";
                renderHistoryList();
            });
        }

        if (searchClear && searchInput) {
            searchClear.addEventListener("click", () => {
                searchInput.value = "";
                state.searchFilter = "";
                searchClear.style.display = "none";
                renderHistoryList();
            });
        }

        // Chip per stato HTTP
        const chips = drawer.querySelectorAll(".swp-nh-chip");
        chips.forEach((chip) => {
            chip.addEventListener("click", () => {
                chips.forEach((c) => c.classList.remove("is-active"));
                chip.classList.add("is-active");
                state.statusFilter = chip.getAttribute("data-status-filter") || "all";
                renderHistoryList();
            });
        });
    }

    /**
     * Mostra o nasconde il Drawer laterale adattando il padding di Swagger UI.
     * @param {boolean} [forceState]
     */
    function toggleDrawer(forceState) {
        const drawer = document.getElementById(CONFIG.ELEMENT_IDS.DRAWER);
        if (!drawer) return;

        const nextOpen = typeof forceState === "boolean" ? forceState : !state.isDrawerOpen;
        state.isDrawerOpen = nextOpen;

        drawer.classList.toggle("is-open", nextOpen);
        document.body.classList.toggle("network-history-drawer-open", nextOpen);

        // Se l'Activity Bar è presente, aggiorna lo stato attivo dell'icona
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.setItemActive === "function") {
            window.SwaggerActivityBar.setItemActive("network-history", nextOpen);
        }

        // Aggiorna lo stato visivo del pulsante di fallback se presente
        document.getElementById(CONFIG.ELEMENT_IDS.TRIGGER_FALLBACK)?.classList.toggle("is-active", nextOpen);

        if (nextOpen) {
            renderHistoryList();
            updateHeaderBadge();
        }
    }

    /**
     * Aggiorna il contatore numerico di chiamate nell'header del Drawer.
     */
    function updateHeaderBadge() {
        const badge = document.getElementById(CONFIG.ELEMENT_IDS.COUNT_BADGE);
        if (badge) {
            badge.textContent = String(state.history.length);
        }
    }

    /**
     * Renderizza l'elenco delle chiamate nel Drawer applicando i filtri attivi.
     */
    function renderHistoryList() {
        const listContainer = document.getElementById(CONFIG.ELEMENT_IDS.LIST_CONTAINER);
        if (!listContainer) return;

        // Filtro combinato (testo + categoria status code)
        const filtered = state.history.filter((item) => {
            // Filtro status
            if (state.statusFilter === "2xx" && !(item.status >= 200 && item.status < 300)) return false;
            if (state.statusFilter === "4xx" && !(item.status >= 400 && item.status < 500)) return false;
            if (state.statusFilter === "5xx" && !(item.status >= 500 && item.status < 600)) return false;

            // Filtro testuale
            if (state.searchFilter) {
                const targetText = `${item.method} ${item.path} ${item.url} ${item.status}`.toLowerCase();
                if (!targetText.includes(state.searchFilter)) return false;
            }

            return true;
        });

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="swp-nh-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p>Nessuna chiamata registrata${state.searchFilter ? " corrispondente ai filtri" : ""}.</p>
                    <span>Esegui una richiesta su Swagger UI per visualizzarla qui in tempo reale.</span>
                </div>
            `;
            return;
        }

        let html = "";
        filtered.forEach((item) => {
            const isExpanded = state.expandedItemId === item.id;
            const statusType = getStatusCategoryClass(item.status);
            const latencyClass = getLatencyClass(item.durationMs);

            html += `
                <div class="swp-nh-card ${isExpanded ? "is-expanded" : ""}" data-item-id="${item.id}">
                    <!-- Card Header Compatto -->
                    <div class="swp-nh-card-header">
                        <div class="swp-nh-card-top-row">
                            <span class="swp-nh-method swp-nh-method--${item.method.toLowerCase()}">${item.method}</span>
                            <span class="swp-nh-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</span>
                            <span class="swp-nh-status swp-nh-status--${statusType}" title="${item.status} ${escapeHtml(item.statusText)}">
                                ${item.status || "ERR"}
                            </span>
                        </div>

                        <div class="swp-nh-card-meta-row">
                            <div class="swp-nh-meta-badges">
                                <span class="swp-nh-badge swp-nh-badge--time" title="Orario">${item.timeFormatted}</span>
                                <span class="swp-nh-badge swp-nh-badge--latency swp-nh-badge--${latencyClass}" title="Latenza">⏱ ${item.durationMs} ms</span>
                                <span class="swp-nh-badge swp-nh-badge--size" title="Dimensione">📦 ${item.sizeFormatted}</span>
                            </div>

                            <div class="swp-nh-card-actions">
                                <button type="button" class="swp-nh-btn-replay" data-action="replay" data-item-id="${item.id}" title="Riesegui chiamata immediatamente con scrolling e auto-execute">
                                    🔄 Replay
                                </button>
                                <button type="button" class="swp-nh-btn-restore" data-action="restore" data-item-id="${item.id}" title="Compila i campi senza eseguire la chiamata">
                                    ↺ Ripristina
                                </button>
                                <button type="button" class="swp-nh-btn-toggle" data-action="toggle" data-item-id="${item.id}" title="Dettagli payload">
                                    ${isExpanded ? "▲" : "▼"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Pannello Dettagli Espandibile -->
                    ${isExpanded ? renderCardDetails(item) : ""}
                </div>
            `;
        });

        listContainer.innerHTML = html;
        attachCardListEvents(listContainer);
    }

    /**
     * Restituisce la classe identificativa per il tipo di status HTTP.
     * @param {number} status
     * @returns {"2xx"|"4xx"|"5xx"|"err"}
     */
    function getStatusCategoryClass(status) {
        if (status >= 200 && status < 300) return "2xx";
        if (status >= 400 && status < 500) return "4xx";
        if (status >= 500 && status < 600) return "5xx";
        return "err";
    }

    /**
     * Renderizza il blocco a schede con i dettagli di Request e Response.
     * @param {object} item
     * @returns {string}
     */
    function renderCardDetails(item) {
        const isRequestTab = state.activeDetailTab === "request";
        const formattedReqBody = tryFormatJson(item.request.body);
        const formattedResBody = tryFormatJson(item.response.body);

        let queryParamsHtml = "";
        const queryKeys = Object.keys(item.queryParams || {});
        if (queryKeys.length > 0) {
            queryParamsHtml = `
                <div class="swp-nh-detail-section">
                    <span class="swp-nh-detail-label">Parametri Query:</span>
                    <div class="swp-nh-kv-table">
                        ${queryKeys.map((k) => `<div><strong>${escapeHtml(k)}:</strong> <span>${escapeHtml(item.queryParams[k])}</span></div>`).join("")}
                    </div>
                </div>
            `;
        }

        return `
            <div class="swp-nh-card-details">
                <!-- Tab Selector -->
                <div class="swp-nh-tabs">
                    <button type="button" class="swp-nh-tab ${isRequestTab ? "is-active" : ""}" data-tab="request" data-item-id="${item.id}">
                        Richiesta (Request)
                    </button>
                    <button type="button" class="swp-nh-tab ${!isRequestTab ? "is-active" : ""}" data-tab="response" data-item-id="${item.id}">
                        Risposta (Response)
                    </button>
                </div>

                <!-- Tab Content: Richiesta -->
                <div class="swp-nh-tab-content" style="display: ${isRequestTab ? "block" : "none"};">
                    <div class="swp-nh-detail-actions">
                        <button type="button" class="swp-nh-btn-copy" data-action="copy-curl" data-item-id="${item.id}">
                            📋 Copia cURL
                        </button>
                        <button type="button" class="swp-nh-btn-copy" data-action="copy-url" data-item-id="${item.id}">
                            🔗 Copia URL
                        </button>
                    </div>

                    ${queryParamsHtml}

                    <div class="swp-nh-detail-section">
                        <span class="swp-nh-detail-label">Payload Inviato (Body):</span>
                        <pre class="swp-nh-code-block">${escapeHtml(formattedReqBody || "(Nessun body inviato)")}</pre>
                    </div>
                </div>

                <!-- Tab Content: Risposta -->
                <div class="swp-nh-tab-content" style="display: ${!isRequestTab ? "block" : "none"};">
                    <div class="swp-nh-detail-actions">
                        <button type="button" class="swp-nh-btn-copy" data-action="copy-response" data-item-id="${item.id}">
                            📋 Copia JSON Risposta
                        </button>
                    </div>

                    <div class="swp-nh-detail-section">
                        <span class="swp-nh-detail-label">Stato: ${item.status} ${escapeHtml(item.statusText)} (${item.durationMs} ms, ${item.sizeFormatted})</span>
                        <pre class="swp-nh-code-block">${escapeHtml(formattedResBody || "(Risposta vuota)")}</pre>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Aggancia i listener di evento alle schede e ai pulsanti di azione della lista.
     * @param {HTMLElement} listContainer
     */
    function attachCardListEvents(listContainer) {
        // Toggle espansione card cliccando in qualsiasi punto dell'header della card
        listContainer.querySelectorAll(".swp-nh-card-header").forEach((header) => {
            header.addEventListener("click", (e) => {
                // Se il click è avvenuto su un pulsante (Replay, Ripristina, Toggle freccia), lascia gestire al pulsante
                if (e.target.closest("button, a, input, select, textarea")) {
                    return;
                }
                const card = header.closest(".swp-nh-card");
                const itemId = card?.getAttribute("data-item-id");
                if (itemId) {
                    state.expandedItemId = state.expandedItemId === itemId ? null : itemId;
                    renderHistoryList();
                }
            });
        });

        // Toggle espansione card tramite freccetta esplicita
        listContainer.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const itemId = btn.getAttribute("data-item-id");
                state.expandedItemId = state.expandedItemId === itemId ? null : itemId;
                renderHistoryList();
            });
        });

        // Pulsante Replay (Auto-execute)
        listContainer.querySelectorAll('[data-action="replay"]').forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const itemId = btn.getAttribute("data-item-id");
                replayRequest(itemId, true);
            });
        });

        // Pulsante Ripristina (Solo compilazione campi)
        listContainer.querySelectorAll('[data-action="restore"]').forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const itemId = btn.getAttribute("data-item-id");
                replayRequest(itemId, false);
            });
        });

        // Cambio tab Request / Response
        listContainer.querySelectorAll(".swp-nh-tab").forEach((tab) => {
            tab.addEventListener("click", (e) => {
                e.stopPropagation();
                state.activeDetailTab = tab.getAttribute("data-tab") || "request";
                renderHistoryList();
            });
        });

        // Copia cURL
        listContainer.querySelectorAll('[data-action="copy-curl"]').forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const itemId = btn.getAttribute("data-item-id");
                const item = state.history.find((x) => x.id === itemId);
                if (item) copyToClipboard(buildCurlCommand(item), btn, "cURL Copiato!");
            });
        });

        // Copia URL
        listContainer.querySelectorAll('[data-action="copy-url"]').forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const itemId = btn.getAttribute("data-item-id");
                const item = state.history.find((x) => x.id === itemId);
                if (item) copyToClipboard(item.url, btn, "URL Copiato!");
            });
        });

        // Copia JSON Risposta
        listContainer.querySelectorAll('[data-action="copy-response"]').forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const itemId = btn.getAttribute("data-item-id");
                const item = state.history.find((x) => x.id === itemId);
                if (item) copyToClipboard(item.response.body, btn, "JSON Copiato!");
            });
        });
    }

    // =========================================================================
    // 9. STILI CSS ADATTIVI (Light Mode & Dark Mode)
    // =========================================================================

    function injectStyles() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.STYLES)) return;

        const style = document.createElement("style");
        style.id = CONFIG.ELEMENT_IDS.STYLES;

        style.textContent = `
            /* =========================================================================
               SWAGGER NETWORK HISTORY & REPLAY - STILI GRAFICI ADATTIVI
               ========================================================================= */

            /* --- Ridimensionamento Dinamico del Corpo di Swagger UI --- */
            body {
                transition: padding-right 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
            }

            body.network-history-drawer-open {
                padding-right: ${CONFIG.DRAWER_WIDTH_PX}px !important;
            }

            @media (max-width: 960px) {
                body.network-history-drawer-open {
                    padding-right: 0 !important;
                }
            }

            /* --- Drawer Laterale Destro --- */
            #${CONFIG.ELEMENT_IDS.DRAWER} {
                --nh-bg: #ffffff;
                --nh-bg-card: #f8fafc;
                --nh-bg-card-hover: #f1f5f9;
                --nh-border: #cbd5e1;
                --nh-border-light: #e2e8f0;
                --nh-text: #0f172a;
                --nh-text-muted: #64748b;
                --nh-code-bg: #0f172a;
                --nh-code-text: #f8fafc;

                position: fixed;
                top: 0;
                right: -${CONFIG.DRAWER_WIDTH_PX + 30}px;
                width: ${CONFIG.DRAWER_WIDTH_PX}px;
                max-width: 95vw;
                height: 100vh;
                max-height: 100vh;
                overflow: hidden;
                background: var(--nh-bg);
                color: var(--nh-text);
                border-left: 1px solid var(--nh-border);
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

            /* Dark Mode per il Drawer */
            html.dark-mode #${CONFIG.ELEMENT_IDS.DRAWER},
            body.dark-mode #${CONFIG.ELEMENT_IDS.DRAWER} {
                --nh-bg: #181818;
                --nh-bg-card: #202020;
                --nh-bg-card-hover: #262626;
                --nh-border: #383838;
                --nh-border-light: #2d2d2d;
                --nh-text: #f5f5f5;
                --nh-text-muted: #94a3b8;
                --nh-code-bg: #111111;
                --nh-code-text: #f1f5f9;
                box-shadow: -8px 0 30px rgba(0, 0, 0, 0.6);
            }

            /* --- Header Drawer --- */
            .swp-nh-header {
                padding: 12px 16px;
                border-bottom: 1px solid var(--nh-border);
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: var(--nh-bg-card);
                flex-shrink: 0;
                box-sizing: border-box;
            }

            .swp-nh-header-left {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                font-weight: 700;
            }

            .swp-nh-count-badge {
                font-size: 11px;
                font-weight: 600;
                padding: 1px 7px;
                border-radius: 10px;
                background: #0284c7;
                color: #ffffff;
            }

            .swp-nh-header-right {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .swp-nh-btn-icon {
                background: none;
                border: 1px solid transparent;
                color: var(--nh-text-muted);
                cursor: pointer;
                font-size: 12px;
                padding: 4px 8px;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s ease;
            }

            .swp-nh-btn-icon:hover {
                color: var(--nh-text);
                background: var(--nh-border-light);
            }

            .swp-nh-btn-close {
                font-size: 16px;
                padding: 4px 8px;
            }

            /* --- Toolbar: Ricerca & Chip Filtri --- */
            .swp-nh-toolbar {
                padding: 10px 14px;
                border-bottom: 1px solid var(--nh-border-light);
                display: flex;
                flex-direction: column;
                gap: 8px;
                flex-shrink: 0;
                background: var(--nh-bg);
            }

            .swp-nh-search-wrap {
                position: relative;
                display: flex;
                align-items: center;
            }

            .swp-nh-search-icon {
                position: absolute;
                left: 10px;
                color: var(--nh-text-muted);
                pointer-events: none;
            }

            .swp-nh-search-input {
                width: 100%;
                height: 32px;
                padding: 0 28px 0 32px;
                border-radius: 4px;
                border: 1px solid var(--nh-border);
                background: var(--nh-bg-card);
                color: var(--nh-text);
                font-size: 12px;
                outline: none;
                box-sizing: border-box;
                transition: border-color 0.15s ease;
            }

            .swp-nh-search-input:focus {
                border-color: #0284c7;
            }

            .swp-nh-search-clear {
                position: absolute;
                right: 8px;
                background: none;
                border: none;
                color: var(--nh-text-muted);
                cursor: pointer;
                font-size: 12px;
                padding: 2px;
            }

            .swp-nh-filter-chips {
                display: flex;
                gap: 6px;
                align-items: center;
            }

            .swp-nh-chip {
                background: var(--nh-bg-card);
                border: 1px solid var(--nh-border);
                color: var(--nh-text-muted);
                padding: 3px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
            }

            .swp-nh-chip:hover {
                border-color: var(--nh-text);
                color: var(--nh-text);
            }

            .swp-nh-chip.is-active {
                background: #0284c7;
                border-color: #0284c7;
                color: #ffffff;
            }

            /* --- Lista Chiamate & Card --- */
            .swp-nh-list {
                flex: 1 1 auto;
                min-height: 0;
                height: 100%;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                padding: 10px 14px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                box-sizing: border-box;
            }

            .swp-nh-list::-webkit-scrollbar {
                width: 6px;
            }

            .swp-nh-list::-webkit-scrollbar-track {
                background: transparent;
            }

            .swp-nh-list::-webkit-scrollbar-thumb {
                background: var(--nh-border);
                border-radius: 3px;
            }

            .swp-nh-list::-webkit-scrollbar-thumb:hover {
                background: var(--nh-text-muted);
            }

            .swp-nh-empty {
                padding: 40px 16px;
                text-align: center;
                color: var(--nh-text-muted);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }

            .swp-nh-empty p {
                margin: 0;
                font-weight: 600;
                font-size: 13px;
                color: var(--nh-text);
            }

            .swp-nh-empty span {
                font-size: 11px;
                max-width: 300px;
                line-height: 1.4;
            }

            .swp-nh-card {
                flex-shrink: 0 !important;
                background: var(--nh-bg-card);
                border: 1px solid var(--nh-border-light);
                border-radius: 6px;
                overflow: hidden;
                transition: border-color 0.15s ease, background 0.15s ease;
                box-sizing: border-box;
            }

            .swp-nh-card:hover {
                border-color: var(--nh-border);
                background: var(--nh-bg-card-hover);
            }

            .swp-nh-card.is-expanded {
                border-color: #0284c7;
            }

            .swp-nh-card-header {
                padding: 8px 10px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                cursor: pointer;
                user-select: none;
            }

            .swp-nh-card-top-row {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
            }

            .swp-nh-method {
                font-size: 10px;
                font-weight: 700;
                padding: 1px 6px;
                border-radius: 3px;
                text-transform: uppercase;
                color: #ffffff;
                flex-shrink: 0;
            }

            .swp-nh-method--get { background: #61affe; }
            .swp-nh-method--post { background: #49cc90; }
            .swp-nh-method--put { background: #fca130; }
            .swp-nh-method--delete { background: #f93e3e; }
            .swp-nh-method--patch { background: #50e3c2; }

            .swp-nh-path {
                font-family: Consolas, Monaco, monospace;
                font-size: 12px;
                font-weight: 600;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                flex: 1;
            }

            .swp-nh-status {
                font-size: 11px;
                font-weight: 700;
                padding: 1px 6px;
                border-radius: 4px;
                flex-shrink: 0;
            }

            .swp-nh-status--2xx { background: #dcfce7; color: #166534; }
            .swp-nh-status--4xx { background: #fef9c3; color: #854d0e; }
            .swp-nh-status--5xx { background: #fee2e2; color: #991b1b; }
            .swp-nh-status--err { background: #fee2e2; color: #991b1b; }

            html.dark-mode .swp-nh-status--2xx { background: #14532d; color: #86efac; }
            html.dark-mode .swp-nh-status--4xx { background: #713f12; color: #fde047; }
            html.dark-mode .swp-nh-status--5xx { background: #7f1d1d; color: #fca5a5; }
            html.dark-mode .swp-nh-status--err { background: #7f1d1d; color: #fca5a5; }

            .swp-nh-card-meta-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 11px;
                gap: 6px;
            }

            .swp-nh-meta-badges {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .swp-nh-badge {
                font-size: 10px;
                color: var(--nh-text-muted);
            }

            .swp-nh-badge--latency.swp-nh-badge--fast { color: #16a34a; font-weight: 600; }
            .swp-nh-badge--latency.swp-nh-badge--medium { color: #d97706; font-weight: 600; }
            .swp-nh-badge--latency.swp-nh-badge--slow { color: #dc2626; font-weight: 600; }

            html.dark-mode .swp-nh-badge--latency.swp-nh-badge--fast { color: #4ade80; }
            html.dark-mode .swp-nh-badge--latency.swp-nh-badge--medium { color: #fbbf24; }
            html.dark-mode .swp-nh-badge--latency.swp-nh-badge--slow { color: #f87171; }

            .swp-nh-card-actions {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .swp-nh-btn-replay,
            .swp-nh-btn-restore,
            .swp-nh-btn-toggle {
                background: var(--nh-bg);
                border: 1px solid var(--nh-border);
                color: var(--nh-text);
                padding: 2px 7px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
            }

            .swp-nh-btn-replay {
                background: #0284c7;
                border-color: #0284c7;
                color: #ffffff;
            }

            .swp-nh-btn-replay:hover {
                background: #0369a1;
            }

            .swp-nh-btn-restore:hover,
            .swp-nh-btn-toggle:hover {
                background: var(--nh-border-light);
            }

            /* --- Card Details & Tabs --- */
            .swp-nh-card-details {
                border-top: 1px solid var(--nh-border-light);
                padding: 10px;
                background: var(--nh-bg);
            }

            .swp-nh-tabs {
                display: flex;
                border-bottom: 1px solid var(--nh-border-light);
                margin-bottom: 8px;
            }

            .swp-nh-tab {
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                color: var(--nh-text-muted);
                padding: 4px 10px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
            }

            .swp-nh-tab.is-active {
                border-bottom-color: #0284c7;
                color: #0284c7;
            }

            .swp-nh-detail-actions {
                display: flex;
                gap: 6px;
                margin-bottom: 8px;
            }

            .swp-nh-btn-copy {
                background: var(--nh-bg-card);
                border: 1px solid var(--nh-border);
                color: var(--nh-text);
                padding: 3px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            .swp-nh-btn-copy:hover {
                background: var(--nh-border-light);
            }

            .swp-nh-detail-section {
                margin-bottom: 6px;
            }

            .swp-nh-detail-label {
                display: block;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                color: var(--nh-text-muted);
                margin-bottom: 4px;
            }

            .swp-nh-kv-table {
                font-size: 11px;
                font-family: Consolas, monospace;
                background: var(--nh-bg-card);
                padding: 6px 8px;
                border-radius: 4px;
                border: 1px solid var(--nh-border-light);
                margin-bottom: 6px;
            }

            .swp-nh-code-block {
                margin: 0;
                padding: 8px;
                background: var(--nh-code-bg);
                color: var(--nh-code-text);
                font-family: Consolas, Monaco, monospace;
                font-size: 11px;
                line-height: 1.4;
                border-radius: 4px;
                max-height: 220px;
                overflow-y: auto;
                white-space: pre-wrap;
                word-break: break-all;
            }

            /* --- Badge Inline di Metriche (ID 10) accanto a Server response --- */
            .swagger-ui .responses-wrapper h4,
            .swagger-ui .responses-inner h4 {
                display: flex !important;
                align-items: center !important;
                flex-wrap: wrap !important;
                gap: 8px !important;
            }

            .swp-metrics-badge-wrap {
                display: inline-flex !important;
                align-items: center !important;
                gap: 6px !important;
                margin-left: 6px !important;
                vertical-align: middle !important;
                font-weight: normal !important;
            }

            .swp-metric-badge {
                font-size: 11px !important;
                font-weight: 600 !important;
                line-height: 1.2 !important;
                padding: 3px 8px !important;
                border-radius: 4px !important;
                display: inline-flex !important;
                align-items: center !important;
                gap: 5px !important;
                white-space: nowrap !important;
                box-sizing: border-box !important;
                text-transform: none !important;
                letter-spacing: normal !important;
            }

            .swp-metric-badge--latency {
                background: #f1f5f9;
                color: #0f172a;
                border: 1px solid #cbd5e1;
            }

            .swp-metric-badge--latency.swp-metric-badge--fast {
                background: #dcfce7;
                color: #166534;
                border-color: #86efac;
            }

            .swp-metric-badge--latency.swp-metric-badge--medium {
                background: #fef9c3;
                color: #854d0e;
                border-color: #fde047;
            }

            .swp-metric-badge--latency.swp-metric-badge--slow {
                background: #fee2e2;
                color: #991b1b;
                border-color: #fca5a5;
            }

            .swp-metric-badge--size {
                background: #f1f5f9;
                color: #475569;
                border: 1px solid #cbd5e1;
            }

            html.dark-mode .swp-metric-badge--latency.swp-metric-badge--fast {
                background: #14532d;
                color: #86efac;
                border-color: #22c55e;
            }

            html.dark-mode .swp-metric-badge--latency.swp-metric-badge--medium {
                background: #713f12;
                color: #fde047;
                border-color: #eab308;
            }

            html.dark-mode .swp-metric-badge--latency.swp-metric-badge--slow {
                background: #7f1d1d;
                color: #fca5a5;
                border-color: #ef4444;
            }

            html.dark-mode .swp-metric-badge--size {
                background: #262626;
                color: #94a3b8;
                border-color: #404040;
            }

            /* --- Animazione Glow per [🔄 Replay] --- */
            @keyframes swpReplayGlowAnim {
                0% { box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.7); }
                50% { box-shadow: 0 0 0 8px rgba(2, 132, 199, 0.4); }
                100% { box-shadow: 0 0 0 0 rgba(2, 132, 199, 0); }
            }

            .swp-replay-glow {
                animation: swpReplayGlowAnim 1.8s ease-in-out !important;
                border-color: #0284c7 !important;
            }

            /* --- Toast Feedback Replay --- */
            .swp-replay-feedback-toast {
                position: absolute;
                top: 8px;
                right: 8px;
                background: #0284c7;
                color: #ffffff;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                z-index: 99;
                opacity: 1;
                transition: opacity 0.4s ease;
            }

            .swp-replay-feedback-toast.is-fading {
                opacity: 0;
            }

            /* --- Fallback Trigger Button --- */
            .swp-nh-fallback-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                height: 38px;
                padding: 0 12px;
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

            .swp-nh-fallback-btn:hover,
            .swp-nh-fallback-btn.is-active {
                background: #e0f2fe;
                border-color: #0284c7;
                color: #0284c7;
            }

            html.dark-mode .swp-nh-fallback-btn {
                background: #202020;
                border-color: #383838;
                color: #f5f5f5;
            }

            html.dark-mode .swp-nh-fallback-btn:hover,
            html.dark-mode .swp-nh-fallback-btn.is-active {
                background: #0c4a6e;
                border-color: #0284c7;
                color: #38bdf8;
            }
        `;

        document.head.appendChild(style);
    }

    // =========================================================================
    // 10. INIZIALIZZAZIONE & CICLO DI VITA
    // =========================================================================

    /**
     * Inizializzazione principale del plugin Network History & Replay.
     */
    function start() {
        loadHistoryFromStorage();
        installFetchInterceptor();

        // Inizializza l'interfaccia appena Swagger UI o il DOM è pronto
        const interval = setInterval(() => {
            const swaggerContainer = document.querySelector(".swagger-ui");
            if (swaggerContainer || document.body) {
                clearInterval(interval);
                initDrawer();
                registerGuideDocumentation();
            }
        }, 150);

        window.addEventListener("swagger-activity-bar:ready", registerGuideDocumentation);
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
                id: "network-history",
                name: "Network History, Metrics & Replay",
                version: "1.0.0",
                description: "Traccia le chiamate di rete con metriche di latenza e payload inline, cronologia persistente e riesecuzione istantanea in 1-click.",
                shortcuts: [
                    "Esc: Chiude il drawer laterale",
                    "Click Card: Espande i dettagli di Request e Response",
                    "Replay: Scorre, compila ed esegue la chiamata",
                    "Ripristina: Compila i campi senza inviare"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                `,
                manual: `
### Panoramica
Il plugin intercetta in modo trasparente tutte le richieste HTTP eseguite da Swagger UI. Per ogni chiamata completata misura la latenza reale in millisecondi (\`⏱ ms\`) e la dimensione del payload (\`📦 KB\`).

### Metriche Inline (ID 10)
Accanto all'intestazione **Server response** di ogni endpoint compare un badge con feedback a colori:
- 🟢 **Verde (< 500 ms)**: risposta rapida.
- 🟡 **Giallo (500 - 1500 ms)**: latenza intermedia.
- 🔴 **Rosso (> 1500 ms)**: query complessa o lenta.

### Drawer Cronologia (ID 11)
Cliccando l'icona dell'orologio nell'Activity Bar si apre il cassetto laterale destro:
- **Buffer circolare**: memorizza fino a 50 chiamate in \`localStorage\` per preservare lo storico tra ricaricamenti della pagina (\`F5\`).
- **Filtri rapidi**: ricerca per percorso/metodo e chip per status code (\`2xx\`, \`4xx\`, \`5xx\`).
- **Dettagli completi**: visualizza parametri di query, payload inviato, header e risposta con pulsanti \`Copia cURL\` e \`Copia JSON\`.

### Motore Replay & Ripristino
- **[🔄 Replay]**: espande automaticamente il controller se collassato, centra la barra dell'endpoint con effetto luminoso Glow, compila parametri e body e preme \`Execute\`.
- **[↺ Ripristina]**: compila tutti i campi lasciando all'utente la libertà di modificarli prima dell'invio manuale.
`
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
