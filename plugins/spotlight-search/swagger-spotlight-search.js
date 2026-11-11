/**
 * @file swagger-spotlight-search.js
 * @summary Plugin Command Palette / Spotlight Search per Swagger UI (OpenAPI / REST).
 *          Consente di cercare istantaneamente qualsiasi endpoint dell'API premendo
 *          Ctrl+K (o Cmd+K su Mac) oppure '/' e navigare tramite tastiera.
 *
 * --- FLUSSO ARCHITETTURALE ---
 * 1. Attende il caricamento di Swagger UI e indicizza tutti gli endpoint registrati
 *    nella specifica OpenAPI (rotte, verbi HTTP, tag/controller, riassunti).
 * 2. Inietta un pulsante di ricerca discreto nella testata di Swagger (.topbar-wrapper).
 * 3. Registra gli shortcut da tastiera globali:
 *    - 'Ctrl + K' o 'Cmd + K' (sempre attivi)
 *    - '/' (attivo quando non si sta digitando in campi di testo)
 * 4. All'apertura della finestra Spotlight modale:
 *    - Mostra un input di ricerca con focus automatico.
 *    - Esegue una ricerca rapida multi-token (es. "post cand", "chat", "dev").
 *    - Permette di scorrere i risultati con Freccia Giù / Freccia Su.
 * 5. Alla pressione di 'Invio' o al click su un risultato:
 *    - Chiude la finestra di ricerca.
 *    - Espande il gruppo/controller se collassato.
 *    - Espande l'endpoint (.opblock) se chiuso.
 *    - Esegue uno scroll animato centrando l'endpoint nello schermo.
 *    - Attiva un effetto visivo temporaneo (highlight glow) per evidenziare la destinazione.
 * 6. Supporto Temi (Light / Dark Mode):
 *    - Allineato al 100% con 'swagger-pretty-json-view.js' e 'swagger-jwt-inspector.js'.
 *    - Si adatta in tempo reale alla presenza della classe 'dark-mode' su <html> o <body>.
 *
 * --- GUIDA ALLA MANUTENZIONE PER SVILUPPATORI ---
 * - Per modificare i tasti di scelta rapida: Aggiornare `CONFIG.SHORTCUTS`.
 * - Per modificare il limite dei risultati mostrati: Modificare `CONFIG.MAX_RESULTS`.
 * - Per cambiare la durata o il colore dell'evidenziazione dopo il salto: Modificare `CONFIG.HIGHLIGHT_DURATION_MS`.
 * - Per modificare gli stili dei verbi HTTP o dei temi: Modificare le variabili CSS in `injectStyles()`.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. CONFIGURAZIONE GENERALE (Modificabile dallo sviluppatore)
    // =========================================================================
    const CONFIG = {
        /** Tasti di scelta rapida abilitati */
        SHORTCUTS: {
            PRIMARY_KEY: "k", // Usato con Ctrl o Meta/Cmd
            SLASH_TRIGGER: true // Abilita '/' quando non si digita in input
        },

        /** Numero massimo di risultati restituiti dalla ricerca */
        MAX_RESULTS: 30,

        /** Durata dell'effetto evidenziazione luminosa (glow) all'arrivo sull'endpoint (ms) */
        HIGHLIGHT_DURATION_MS: 2500,

        /** Intervallo di polling per attendere il caricamento di Swagger UI */
        UI_DISCOVERY_INTERVAL_MS: 200,

        /** Timeout massimo di attesa caricamento di window.ui */
        UI_DISCOVERY_TIMEOUT_MS: 30000,

        /** ID elemento DOM del modale Spotlight */
        MODAL_ELEMENT_ID: "swagger-spotlight-modal",

        /** ID elemento del pulsante trigger nella navbar */
        TRIGGER_BTN_ID: "swagger-spotlight-trigger-btn",

        /** ID elemento container di fallback quando .scheme-container (Authorize) non esiste */
        FALLBACK_CONTAINER_ID: "swagger-spotlight-fallback-container",

        /** ID elemento stile CSS iniettato */
        STYLE_ELEMENT_ID: "swagger-spotlight-styles",

        /** Configurazione pulsante floating "Torna in Cima" */
        BACK_TO_TOP: {
            ENABLED: true,
            SCROLL_THRESHOLD_PX: 280,
            BUTTON_ID: "swagger-back-to-top-btn"
        }
    };

    /** Mappa colori standard di Swagger per ciascun metodo HTTP */
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
    // 2. STATO RUNTIME IN-MEMORY
    // =========================================================================
    let indexedEndpoints = [];
    let isIndexLoaded = false;
    let selectedResultIndex = 0;
    let currentSearchResults = [];

    // =========================================================================
    // 3. INDICIZZAZIONE ENDPOINT (Da Spec OpenAPI e DOM)
    // =========================================================================

    /**
     * Struttura di un endpoint indicizzato:
     * @typedef {object} IndexedEndpoint
     * @property {string} method - Verbo HTTP minuscolo (get, post, ecc.)
     * @property {string} path - Percorso rotta (es. /api/Candidate/{id})
     * @property {string} tag - Controller o tag di appartenenza
     * @property {string} summary - Riassunto o descrizione dell'operazione
     * @property {string} operationId - ID operazione OpenAPI se presente
     * @property {string} searchText - Stringa normalizzata per la ricerca multi-token
     * @property {string} domId - Identificativo ID del blocco opblock nel DOM
     */

    /**
     * Estrae la specifica OpenAPI dallo store Redux di Swagger o dai metadati globali.
     * @returns {object|null}
     */
    function getSwaggerSpec() {
        try {
            const ui = window.ui;
            if (!ui) return null;

            // Tentativo 1: Tramite getter dello store Redux
            const state = ui.getState && ui.getState();
            if (state) {
                const specData = state.get("spec")?.get("json");
                if (specData) {
                    return typeof specData.toJS === "function" ? specData.toJS() : specData;
                }
            }

            // Tentativo 2: Tramite selectors
            if (ui.specSelectors && typeof ui.specSelectors.specJson === "function") {
                const spec = ui.specSelectors.specJson();
                if (spec) {
                    return typeof spec.toJS === "function" ? spec.toJS() : spec;
                }
            }
        } catch (error) {
            console.warn("[Swagger Spotlight] Impossibile leggere specifica da Redux:", error);
        }
        return null;
    }

    /**
     * Indicizza tutti gli endpoint OpenAPI disponibili, integrando sia la specifica che il DOM.
     */
    function buildEndpointsIndex() {
        const spec = getSwaggerSpec();
        const results = [];

        if (spec && spec.paths) {
            // Indicizzazione dalla specifica OpenAPI
            Object.entries(spec.paths).forEach(([pathName, pathItem]) => {
                const methods = ["get", "post", "put", "delete", "patch", "head", "options", "trace"];

                methods.forEach((method) => {
                    const op = pathItem[method];
                    if (!op) return;

                    const tag = Array.isArray(op.tags) && op.tags.length > 0 ? op.tags[0] : "Default";
                    const summary = op.summary || op.description || "";
                    const operationId = op.operationId || "";

                    // Calcolo domId standard utilizzato da Swagger UI: operations-{tag}-{operationId o sanitize(path)}
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

        // Se la specifica non era accessibile, esegue scansione di riserva direttamente dal DOM
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
        console.info(`[Swagger Spotlight] Indicizzati ${indexedEndpoints.length} endpoint con successo.`);
    }

    // =========================================================================
    // 4. RICERCA E FILTRO ENDPOINT (Multi-Token Fuzzy Search)
    // =========================================================================

    /**
     * Esegue una ricerca rapida multi-token tra tutti gli endpoint indicizzati.
     * @param {string} rawQuery
     * @returns {IndexedEndpoint[]}
     */
    function searchEndpoints(rawQuery) {
        if (!isIndexLoaded || indexedEndpoints.length === 0) {
            buildEndpointsIndex();
        }

        const query = (rawQuery || "").trim().toLowerCase();
        if (!query) {
            // Se la query è vuota, restituisce i primi N endpoint per esplorazione
            return indexedEndpoints.slice(0, CONFIG.MAX_RESULTS);
        }

        const tokens = query.split(/\s+/).filter(Boolean);

        const matched = [];
        for (const item of indexedEndpoints) {
            // Tutti i token digitati dall'utente devono corrispondere
            const allMatched = tokens.every((token) => item.searchText.includes(token));
            if (allMatched) {
                // Calcolo score di rilevanza per ordinare i risultati
                let score = 0;

                // Match esatto o iniziale sul path
                if (item.path.toLowerCase().startsWith(query)) score += 100;
                else if (item.path.toLowerCase().includes(query)) score += 50;

                // Match esatto sul metodo HTTP
                if (tokens.includes(item.method)) score += 40;

                // Match sul tag/controller
                if (item.tag.toLowerCase().includes(query)) score += 30;

                matched.push({ item, score });
            }
        }

        // Ordina per score decrescente
        matched.sort((a, b) => b.score - a.score);

        return matched.slice(0, CONFIG.MAX_RESULTS).map((m) => m.item);
    }

    // =========================================================================
    // 5. GESTIONE TEMI (LIGHT / DARK THEME) ED INIEZIONE STILI CSS
    // =========================================================================

    /**
     * Rileva se la pagina Swagger UI è in modalità scura controllando la presenza della classe 'dark-mode'
     * su <html> o <body>, coerentemente con tutti gli altri plugin.
     * @returns {boolean}
     */
    function isDarkModeActive() {
        return Boolean(
            document.documentElement.classList.contains("dark-mode") ||
            (document.body && document.body.classList.contains("dark-mode"))
        );
    }

    /**
     * Sincronizza la classe tema '--dark' sul modale se attualmente aperto.
     */
    function applyTheme() {
        const dark = isDarkModeActive();
        const modal = document.getElementById(CONFIG.MODAL_ELEMENT_ID);
        if (modal) {
            modal.classList.toggle("spotlight-modal--dark", dark);
        }
    }

    /**
     * Ascolta le mutazioni della classe su <html> e <body> per aggiornare istantaneamente il tema.
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

            /* --- Layout container della sezione schemes (.scheme-container) --- */
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

            /* --- Fallback container quando Authorize non è presente --- */
            #${CONFIG.FALLBACK_CONTAINER_ID} {
                margin: 20px 0 !important;
                padding: 15px 0 !important;
            }

            #${CONFIG.FALLBACK_CONTAINER_ID} .schemes {
                justify-content: flex-start !important;
            }

            /* --- Barra di Ricerca Orizzontale a sinistra di Authorize --- */
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

            /* --- Stile Barra di Ricerca in Tema Scuro --- */
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

            /* --- Overlay Modale Spotlight (Default: Tema Chiaro ad Alto Contrasto) --- */
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

            /* --- Modale Spotlight Tema Scuro --- */
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

            /* --- Header con Input di Ricerca --- */
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

            /* --- Lista Risultati --- */
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

            /* --- Badge Metodo HTTP --- */
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

            /* --- Footer con Guida Tasti --- */
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

            /* --- Animazione Flash Glow all'arrivo sull'endpoint --- */
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

            /* --- Pulsante Floating Torna in Cima (Back to Top) --- */
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

            /* In Tema Scuro il bottone ha sfondo scuro coordinato con verde Swagger */
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
    // 6. NAVIGAZIONE VERSO L'ENDPOINT TARGET (Scroll, Espansione, Centratura)
    // =========================================================================

    /**
     * Pulisce una stringa rimuovendo eventuali caratteri zero-width space (\u200B) che
     * Swagger UI inietta internamente nei tag e nei percorsi per gestire i word-break.
     * @param {string} str
     * @returns {string}
     */
    function cleanZeroWidth(str) {
        if (!str || typeof str !== "string") return "";
        return str.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    }

    /**
     * Trova l'elemento DOM del controller/tag genitore in Swagger UI.
     * @param {string} tag
     * @returns {HTMLElement|null}
     */
    function findTagSection(tag) {
        if (!tag) return null;
        const normalizedTargetTag = cleanZeroWidth(tag).toLowerCase();

        // 1. Ricerca per ID convenzionale assegnato da Swagger UI
        const sanitizedId = tag.replace(/\s+/g, "_");
        const byId = document.getElementById(`operations-tag-${tag}`)
                  || document.getElementById(`operations-tag-${sanitizedId}`);
        if (byId) {
            return byId.closest(".opblock-tag-section") || byId;
        }

        // 2. Ricerca per attributo data-tag
        try {
            const byData = document.querySelector(`.swagger-ui [data-tag="${CSS.escape(tag)}"]`);
            if (byData) {
                return byData.closest(".opblock-tag-section") || byData;
            }
        } catch {
            // Ignora eccezioni su caratteri speciali in CSS.escape
        }

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
     * Assicura che la sezione del controller/tag sia aperta.
     * @param {HTMLElement} tagSection
     * @returns {boolean} True se ha cliccato per aprirla, False se era già aperta
     */
    function ensureTagSectionOpen(tagSection) {
        if (!tagSection) return false;

        // Se la sezione non ha la classe 'is-open', è collassata
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
     * Localizza l'elemento .opblock dell'endpoint nel DOM tramite ID o scansione metodo + path.
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
     * Assicura che l'endpoint (.opblock) sia espanso.
     * Clicca specificamente il pulsante .opblock-summary-control che gestisce l'evento di Swagger UI.
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
     * Localizza l'elemento dell'endpoint nel DOM, ne garantisce l'apertura
     * (inclusa quella del controller genitore) e naviga fino alla testa dell'endpoint.
     * @param {IndexedEndpoint} endpoint
     */
    function navigateToEndpoint(endpoint) {
        closeSpotlightModal();

        // 1. Risolve il controller genitore e lo apre subito se era chiuso
        const tagSection = findTagSection(endpoint.tag);
        const didOpenTag = tagSection ? ensureTagSectionOpen(tagSection) : false;

        /**
         * Esegue la centratura visiva sulla TESTA dell'endpoint (.opblock-summary),
         * ne garantisce l'espansione e applica l'anello luminoso (Glow).
         */
        const executeJump = () => {
            const targetElement = findOpblockElement(endpoint);
            if (!targetElement) {
                console.warn(`[Swagger Spotlight] Endpoint non trovato nel DOM: ${endpoint.method} ${endpoint.path}`);
                return;
            }

            // 2. Espande l'endpoint se chiuso
            ensureOpblockOpen(targetElement);

            // 3. Centra la TESTA dell'endpoint (la barra con metodo e rotta) a video
            // Usiamo un breve ritardo per consentire al DOM di recepire l'espansione
            setTimeout(() => {
                const headerElement = targetElement.querySelector(".opblock-summary") || targetElement;
                headerElement.scrollIntoView({ behavior: "smooth", block: "center" });

                // 4. Effetto visivo Glow per focalizzare l'attenzione
                targetElement.classList.add("swagger-spotlight-highlight");
                setTimeout(() => {
                    targetElement.classList.remove("swagger-spotlight-highlight");
                }, CONFIG.HIGHLIGHT_DURATION_MS);
            }, 80);
        };

        // Se abbiamo dovuto aprire il controller genitore, Swagger UI (React) monta gli opblock
        // in modo asincrono; facciamo un polling breve fino a che l'elemento appare
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
    // 7. RENDERING E GESTIONE MODALE SPOTLIGHT
    // =========================================================================

    /**
     * Apre la finestra Spotlight o ne acquisisce il focus se già aperta.
     */
    function openSpotlightModal() {
        // Se già aperto, posiziona solo il cursore nell'input
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
                <input type="text" class="spotlight-input" placeholder="Cerca endpoint per percorso, metodo, controller o descrizione... (es. /candidates, post, chat, dev)" autocomplete="off" spellcheck="false" />
                <span class="spotlight-esc-pill" id="spotlight-btn-esc" title="Chiudi">ESC</span>
            </div>

            <ul class="spotlight-results-list" id="spotlight-results-container"></ul>

            <div class="spotlight-footer">
                <div class="spotlight-hints">
                    <span class="spotlight-hint-item"><kbd>↑</kbd> <kbd>↓</kbd> Naviga</span>
                    <span class="spotlight-hint-item"><kbd>↵</kbd> Seleziona & Vai</span>
                    <span class="spotlight-hint-item"><kbd>ESC</kbd> Chiudi</span>
                </div>
                <div id="spotlight-count-badge">0 endpoint</div>
            </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const input = card.querySelector(".spotlight-input");
        const resultsContainer = card.querySelector("#spotlight-results-container");
        const countBadge = card.querySelector("#spotlight-count-badge");
        const escBtn = card.querySelector("#spotlight-btn-esc");

        escBtn.addEventListener("click", closeSpotlightModal);

        // Funzione per aggiornare a video i risultati cercati
        const renderResults = () => {
            currentSearchResults = searchEndpoints(input.value);
            selectedResultIndex = 0;

            countBadge.textContent = `${currentSearchResults.length} endpoint`;

            if (currentSearchResults.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="spotlight-empty-state">
                        Nessun endpoint trovato per "<strong>${escapeHtml(input.value)}</strong>".
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

        // Gestione tastiera all'interno del modale (Frecce, Invio, ESC)
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

        // Primo rendering
        renderResults();

        // Focus immediato sull'input
        setTimeout(() => input.focus(), 30);
    }

    /**
     * Aggiorna la selezione visiva dell'elemento selezionato e ne esegue lo scroll automatico.
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
     * Chiude la finestra Spotlight e la rimuove dal DOM.
     */
    function closeSpotlightModal() {
        const modal = document.getElementById(CONFIG.MODAL_ELEMENT_ID);
        if (modal) modal.remove();
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
    // 8. REGISTRAZIONE SHORTCUT GLOBALI E PULSANTE NAVBAR
    // =========================================================================

    /**
     * Inietta la barra orizzontale di ricerca nella sezione schemes (.scheme-container .schemes)
     * allineata a sinistra, ad altezza del pulsante 'Authorize'.
     * Nel caso in cui l'API non abbia la sicurezza/Authorize configurata, Swagger UI non genera
     * .scheme-container nel DOM; in tal caso crea un fallback container trasparente subito
     * sotto .information-container per garantire che il campo di ricerca appaia sempre.
     */
    function renderTriggerButton() {
        if (document.getElementById(CONFIG.TRIGGER_BTN_ID)) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = CONFIG.TRIGGER_BTN_ID;
        btn.title = "Cerca endpoint per rotta, verbo o descrizione (Ctrl + K oppure /)";
        btn.innerHTML = `
            <span style="font-size: 15px; opacity: 0.85;">🔍</span>
            <span class="spotlight-trigger-label">Cerca endpoint...</span>
            <div class="spotlight-kbd-group">
                <span class="spotlight-kbd-pill">Ctrl K</span>
                <span class="spotlight-kbd-pill">/</span>
            </div>
        `;

        btn.addEventListener("click", openSpotlightModal);

        // Caso 1: Swagger UI ha generato .scheme-container nativo (presenza di Authorize o schemes)
        const nativeSchemesContainer = document.querySelector(`.swagger-ui .scheme-container:not(#${CONFIG.FALLBACK_CONTAINER_ID}) .schemes`);
        if (nativeSchemesContainer) {
            // Rimuove eventuale fallback precedente se Swagger UI ha montato schemes in un secondo momento
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

        // Caso 2: Fallback quando Authorize / .scheme-container non è presente nell'API
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
     * Inietta e gestisce il pulsante floating "Torna in Cima" (Back to Top) in basso a destra.
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

        // Controllo visibilità con requestAnimationFrame su scroll
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
     * Registra i listener globali da tastiera (Ctrl+K, Cmd+K, /).
     */
    function registerKeyboardShortcuts() {
        window.addEventListener("keydown", (event) => {
            // Scorciatoia Ctrl+K o Cmd+K (MetaKey su MacOS)
            const isCtrlK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === CONFIG.SHORTCUTS.PRIMARY_KEY;

            if (isCtrlK) {
                event.preventDefault();
                openSpotlightModal();
                return;
            }

            // Scorciatoia '/' (solo quando il cursore non si trova già in un campo di input)
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
    // 9. INIZIALIZZAZIONE PLUGIN
    // =========================================================================
    /**
     * Registra il pulsante di ricerca Spotlight nell'Activity Bar modulare (se presente).
     */
    function registerInActivityBar() {
        if (!window.SwaggerActivityBar || typeof window.SwaggerActivityBar.registerItem !== "function") return;
        if (window.SwaggerActivityBar.getItemElement("spotlight-search")) return;

        window.SwaggerActivityBar.registerItem({
            id: "spotlight-search",
            title: "Cerca endpoint per rotta, verbo o descrizione (Ctrl + K oppure /)",
            ariaLabel: "Cerca endpoint",
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

                // Se la pagina ha renderizzato la sezione schemes o l'info container o gli endpoint, completiamo l'inizializzazione
                if (nativeSchemes || infoContainer || document.querySelector(".swagger-ui .opblock")) {
                    window.clearInterval(checkInterval);
                    setTimeout(buildEndpointsIndex, 600);
                    registerGuideDocumentation();
                    console.info("[Swagger Spotlight] Plugin Command Palette inizializzato con successo.");
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

        // Observer per garantire la persistenza della barra in caso di re-render di Swagger UI
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
     * Pubblica i metadati e la documentazione del plugin nella guida interattiva dell'Activity Bar (ID 27).
     */
    function registerGuideDocumentation() {
        if (isGuideRegistered) return;
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerPluginGuide === "function") {
            isGuideRegistered = true;
            window.SwaggerActivityBar.registerPluginGuide({
                id: "spotlight-search",
                name: "Spotlight Search (Ctrl + K)",
                version: "1.0.0",
                description: "Ricerca rapida stile Command Palette con fuzzy search tra tutti gli endpoint, apertura asincrona dei controller e centratura glow.",
                shortcuts: [
                    "Ctrl + K: Apre la ricerca rapida Spotlight",
                    "↑ / ↓: Naviga tra i risultati",
                    "Invio: Raggiungi ed espandi l'endpoint",
                    "Esc: Chiude la modale di ricerca"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                `,
                manual: `
### Panoramica
La Command Palette Spotlight consente di individuare ed espandere qualsiasi rotta API senza dover scorrere manualmente centinaia di endpoint in Swagger UI.

### Scorciatoia Rapida
Premi in qualunque momento \`Ctrl + K\` (o \`Cmd + K\` su Mac) oppure clicca la barra di ricerca orizzontale o l'icona della lente nell'Activity Bar.

### Caratteristiche
- **Ricerca Fuzzy**: cerca simultaneamente per percorso (\`/api/...\`), tag controller, descrizione e verbo HTTP (\`GET\`, \`POST\`, ecc.).
- **Navigazione da Tastiera**: scorri le corrispondenze con le frecce \`↑\` e \`↓\` e premi \`Invio\` per saltare direttamente alla testata dell'endpoint.
- **Espansione Asincrona**: se il controller padre è chiuso, viene espanso automaticamente e la pagina scorre con un anello luminoso Glow.
- **Pulsante Torna in Cima**: un pulsante discreto fluttuante in basso a destra consente di ritornare all'inizio della pagina in un click.
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
