/**
 * @file swagger-flow-runner.js
 * @summary API Chained Request Flows & Variable Piping Studio for Swagger UI (OpenAPI / ASP.NET Core).
 *          Enables sequential multi-step scenario testing with automatic variable piping ({{varName}}),
 *          declarative value extraction, Swagger UI Redux Bearer auth inheritance, and import/export.
 *
 * --- ARCHITECTURAL FLOW ---
 * 1. Pinned to the Activity Bar (order: 35) with a chain icon 🔗.
 * 2. Opens a spacious 2-column Flow Studio Modal dialog (Light & Dark mode).
 * 3. Left Column:
 *    - Scenario selection (predefined from window.SwaggerFlowRunnerConfig + custom from localStorage).
 *    - Reorderable step list with real-time status badges (200 OK, 201 Created, 400 Bad Request, etc.).
 *    - Operation picker populated from Swagger's OpenAPI spec (ui.getState().get("spec")).
 *    - Environment Variables live inspector ({{variableName}}).
 *    - Execution controls (Run All, Stop, Stop on Failure, Step Delay).
 * 4. Right Column:
 *    - Step configuration: route parameters, query parameters, headers, and JSON body with {{var}} syntax.
 *    - Declarative Variable Extraction table: JSON path (e.g. "id", "data.token") -> variable name.
 *    - Execution results inspector: HTTP status, latency in ms, response headers, and formatted JSON output.
 * 5. Automatic Bearer Token Inheritance from Swagger UI Redux store (state.auth.authorized).
 * 6. Native bilingual internationalization (i18n: en & it) responsive to Activity Bar language switcher.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. CONFIGURATION & STATE
    // =========================================================================
    const userConfig = window.SwaggerFlowRunnerConfig || {};

    const CONFIG = {
        /** Activity Bar order (defaults to 35, right after SignalR tester) */
        ACTIVITY_BAR_ORDER: typeof userConfig.activityBarOrder === "number" ? userConfig.activityBarOrder : 35,

        /** LocalStorage persistence keys */
        STORAGE_KEYS: {
            SCENARIOS: "swp_flow_runner_scenarios",
            VARIABLES: "swp_flow_runner_variables",
            ACTIVE_SCENARIO: "swp_flow_runner_active_id",
            SETTINGS: "swp_flow_runner_settings"
        },

        /** Element IDs */
        ELEMENT_IDS: {
            MODAL: "swp-flow-runner-modal",
            STYLES: "swp-flow-runner-styles"
        },

        /** Predefined scenarios supplied by host */
        HOST_SCENARIOS: Array.isArray(userConfig.scenarios) ? userConfig.scenarios : [],

        /** Security scheme identifier for application Bearer tokens (e.g. Febe) */
        APP_BEARER_SCHEME: userConfig.appSchemeName || window.SwaggerAuthConfig?.appSchemeName || window.SwaggerJwtConfig?.appSchemeName || "Bearer",

        /** Security scheme identifier for IDP / MSAL tokens */
        MSAL_SCHEME: userConfig.msalSchemeName || window.SwaggerAuthConfig?.msalSchemeName || window.SwaggerJwtConfig?.msalSchemeName || "MsalAuth",

        /** Explicitly preferred security scheme name */
        PREFERRED_SCHEME: userConfig.preferredScheme || null
    };

    // =========================================================================
    // 2. INTERNATIONALIZATION (i18n) DICTIONARIES
    // =========================================================================
    const I18N = {
        en: {
            activityBarTitle: "API Flow Runner & Chained Scenarios",
            activityBarAria: "API Flow Runner Studio",
            modalTitle: "API Flow Runner Studio",
            closeModal: "Close (Esc)",
            tabRequest: "Request Config",
            tabExtract: "Variable Extraction",
            tabResponse: "Response & Output",
            scenarioLabel: "Scenario:",
            selectScenarioPlaceholder: "-- Select or create a scenario --",
            btnNewScenario: "➕ New",
            btnCloneScenario: "📋 Clone",
            btnDeleteScenario: "🗑️ Delete",
            btnExport: "📥 Export JSON",
            btnImport: "📤 Import JSON",
            btnRunAll: "▶ Run Flow",
            btnRunning: "⏳ Running...",
            btnStop: "⏹ Stop",
            stopOnFailure: "Stop on failure",
            stepDelay: "Delay:",
            delayNone: "0 ms",
            delay250: "250 ms",
            delay500: "500 ms",
            delay1000: "1000 ms",
            stepsTitle: "Scenario Steps",
            btnAddStep: "➕ Add Operation from Swagger",
            searchOpPlaceholder: "Filter endpoints by path or method...",
            noStepsNotice: "No steps in this scenario. Click above to add an operation from Swagger.",
            variablesTitle: "Active Session Variables",
            noVariablesNotice: "No variables stored yet. Extracted values will appear here.",
            btnClearVariables: "Clear Vars",
            stepNameLabel: "Step Name:",
            methodLabel: "Method:",
            pathLabel: "Endpoint Path (supports {{var}}):",
            authCheckbox: "Send active Swagger UI Bearer Token",
            pathParamsTitle: "Path Parameters",
            queryParamsTitle: "Query Parameters",
            headersTitle: "Custom Headers",
            bodyTitle: "Request Body (JSON with {{var}} placeholders):",
            paramName: "Parameter",
            paramValue: "Value (or {{var}})",
            headerName: "Header",
            headerValue: "Value",
            btnAddParam: "+ Add Param",
            btnAddHeader: "+ Add Header",
            btnFormatJson: "Format JSON",
            extractTableTitle: "Extract Values from Response into Variables",
            extractPropHeader: "Response JSON Property (e.g. id, data.token)",
            extractVarHeader: "Save into Variable Name (e.g. candidateId)",
            extractActionsHeader: "Actions",
            btnAddExtractRule: "+ Add Extraction Rule",
            btnSuggestExtract: "🪄 Suggest from Last Response",
            noExtractRules: "No extraction rules defined. Variables can also be piped manually.",
            responseStatus: "Status:",
            responseLatency: "Latency:",
            responseHeaders: "Response Headers",
            responseBody: "Response Body",
            noResponseYet: "Step has not been executed yet. Click 'Run Flow' or execute step.",
            btnExecuteStep: "⚡ Run Only This Step",
            btnCopyResponse: "📋 Copy Response",
            copiedFeedback: "✓ Copied!",
            confirmDeleteScenario: "Are you sure you want to delete scenario '{name}'?",
            promptNewScenarioName: "Enter new scenario name:",
            promptCloneScenarioName: "Enter name for cloned scenario:",
            importSuccess: "Imported {count} scenario(s) successfully!",
            importError: "Invalid scenario JSON format.",
            variableInterpolationError: "Warning: Unresolved variable {{var}} in request."
        },
        it: {
            activityBarTitle: "Runner Flussi API e Scenari a Catena",
            activityBarAria: "Flow Runner Studio API",
            modalTitle: "Studio Scenari & Flussi API a Catena",
            closeModal: "Chiudi (Esc)",
            tabRequest: "Configurazione Richiesta",
            tabExtract: "Estrazione Variabili",
            tabResponse: "Risposta & Output",
            scenarioLabel: "Scenario:",
            selectScenarioPlaceholder: "-- Seleziona o crea uno scenario --",
            btnNewScenario: "➕ Nuovo",
            btnCloneScenario: "📋 Clona",
            btnDeleteScenario: "🗑️ Elimina",
            btnExport: "📥 Esporta JSON",
            btnImport: "📤 Importa JSON",
            btnRunAll: "▶ Esegui Flusso",
            btnRunning: "⏳ Esecuzione...",
            btnStop: "⏹ Ferma",
            stopOnFailure: "Ferma su errore",
            stepDelay: "Pausa:",
            delayNone: "0 ms",
            delay250: "250 ms",
            delay500: "500 ms",
            delay1000: "1000 ms",
            stepsTitle: "Step dello Scenario",
            btnAddStep: "➕ Aggiungi Operazione da Swagger",
            searchOpPlaceholder: "Filtra endpoint per rotta o metodo...",
            noStepsNotice: "Nessun passaggio in questo scenario. Clicca sopra per aggiungere un'operazione.",
            variablesTitle: "Variabili di Sessione Attive",
            noVariablesNotice: "Nessuna variabile memorizzata. I valori estratti compariranno qui.",
            btnClearVariables: "Svuota Var",
            stepNameLabel: "Nome Step:",
            methodLabel: "Metodo:",
            pathLabel: "Percorso Endpoint (supporta {{var}}):",
            authCheckbox: "Invia Bearer Token attivo di Swagger UI",
            pathParamsTitle: "Parametri di Percorso (Path)",
            queryParamsTitle: "Parametri Query",
            headersTitle: "Intestazioni Personalizzate",
            bodyTitle: "Corpo Richiesta (JSON con variabili {{var}}):",
            paramName: "Parametro",
            paramValue: "Valore (o {{var}})",
            headerName: "Header",
            headerValue: "Valore",
            btnAddParam: "+ Aggiungi Param",
            btnAddHeader: "+ Aggiungi Header",
            btnFormatJson: "Formatta JSON",
            extractTableTitle: "Estrai Valori dalla Risposta nelle Variabili",
            extractPropHeader: "Proprietà JSON Risposta (es. id, data.token)",
            extractVarHeader: "Salva nella Variabile (es. candidateId)",
            extractActionsHeader: "Azioni",
            btnAddExtractRule: "+ Aggiungi Regola",
            btnSuggestExtract: "🪄 Suggerisci dall'Ultima Risposta",
            noExtractRules: "Nessuna regola di estrazione definita.",
            responseStatus: "Stato:",
            responseLatency: "Latenza:",
            responseHeaders: "Intestazioni Risposta",
            responseBody: "Corpo Risposta",
            noResponseYet: "Questo step non è ancora stato eseguito. Clicca 'Esegui Flusso' o esegui il singolo step.",
            btnExecuteStep: "⚡ Esegui Solo Questo Step",
            btnCopyResponse: "📋 Copia Risposta",
            copiedFeedback: "✓ Copiato!",
            confirmDeleteScenario: "Sei sicuro di voler eliminare lo scenario '{name}'?",
            promptNewScenarioName: "Inserisci il nome del nuovo scenario:",
            promptCloneScenarioName: "Inserisci il nome dello scenario clonato:",
            importSuccess: "Importati con successo {count} scenari!",
            importError: "Formato file JSON non valido.",
            variableInterpolationError: "Attenzione: variabile non risolta {{var}} nella richiesta."
        }
    };

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

    // =========================================================================
    // 3. RUNTIME STATE MANAGEMENT
    // =========================================================================
    const state = {
        scenarios: [],
        activeScenarioId: null,
        selectedStepIndex: 0,
        activeTab: "request", // "request" | "extract" | "response"
        variables: {},
        isRunning: false,
        stopRequested: false,
        settings: {
            stopOnFailure: true,
            delayMs: 250
        },
        stepResults: {} // map: stepIndex -> { status, statusText, latencyMs, headers, body, timestamp, isRunning, error }
    };

    /**
     * Loads custom scenarios and session variables from localStorage.
     */
    function loadState() {
        try {
            const storedScenarios = localStorage.getItem(CONFIG.STORAGE_KEYS.SCENARIOS);
            const customScenarios = storedScenarios ? JSON.parse(storedScenarios) : [];
            
            // Merge host scenarios with custom scenarios (host scenarios are marked read-only / predefined)
            const hostScenarios = CONFIG.HOST_SCENARIOS.map((s, idx) => ({
                id: s.id || `host_scenario_${idx}`,
                name: s.name || `Host Scenario ${idx + 1}`,
                description: s.description || "",
                isHost: true,
                steps: Array.isArray(s.steps) ? s.steps.map(cloneStep) : []
            }));

            state.scenarios = [...hostScenarios, ...customScenarios];

            // If empty, supply a default starter scenario
            if (state.scenarios.length === 0) {
                const defaultScenario = {
                    id: "starter_scenario",
                    name: "Sample Workflow",
                    description: "Example multi-step scenario with variable piping",
                    steps: []
                };
                state.scenarios.push(defaultScenario);
                saveCustomScenarios();
            }

            const lastActiveId = localStorage.getItem(CONFIG.STORAGE_KEYS.ACTIVE_SCENARIO);
            if (lastActiveId && state.scenarios.some(s => s.id === lastActiveId)) {
                state.activeScenarioId = lastActiveId;
            } else {
                state.activeScenarioId = state.scenarios[0].id;
            }

            const storedVars = localStorage.getItem(CONFIG.STORAGE_KEYS.VARIABLES);
            if (storedVars) {
                state.variables = JSON.parse(storedVars);
            }

            const storedSettings = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
            if (storedSettings) {
                state.settings = { ...state.settings, ...JSON.parse(storedSettings) };
            }
        } catch (e) {
            console.warn("[Swagger Flow Runner] Error loading state:", e);
        }
    }

    function cloneStep(step) {
        const rawExtract = Array.isArray(step.extract) ? step.extract : (Array.isArray(step.extractions) ? step.extractions : []);
        return {
            id: step.id || `step_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            name: step.name || "API Step",
            method: (step.method || "GET").toUpperCase(),
            path: step.path || "/",
            useAuth: step.useAuth !== false && step.inheritAuth !== false,
            queryParams: Array.isArray(step.queryParams) ? [...step.queryParams.map(p => ({ ...p }))] : [],
            headers: Array.isArray(step.headers) ? [...step.headers.map(h => ({ ...h }))] : [],
            body: step.body !== undefined ? step.body : "",
            extract: rawExtract.map(e => ({ path: e.path || e.jsonPath || "", varName: e.varName || "" }))
        };
    }

    function saveCustomScenarios() {
        try {
            const customOnly = state.scenarios.filter(s => !s.isHost);
            localStorage.setItem(CONFIG.STORAGE_KEYS.SCENARIOS, JSON.stringify(customOnly));
            localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_SCENARIO, state.activeScenarioId || "");
            localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
        } catch (e) {
            console.warn("[Swagger Flow Runner] Error saving scenarios:", e);
        }
    }

    function saveVariables() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.VARIABLES, JSON.stringify(state.variables));
        } catch (e) {
            console.warn("[Swagger Flow Runner] Error saving variables:", e);
        }
    }

    function getActiveScenario() {
        return state.scenarios.find(s => s.id === state.activeScenarioId) || state.scenarios[0] || null;
    }

    // =========================================================================
    // 4. VARIABLE ENGINE & INTERPOLATION
    // =========================================================================

    /**
     * Resolves all {{variableName}} occurrences in a text string using active variable store.
     * @param {string} text
     * @returns {string}
     */
    /**
     * Interpolates {{varName}} place-holders in a given string using the provided variable map
     * or active state.variables.
     * @param {string} text
     * @param {object} [vars]
     * @returns {string}
     */
    function interpolateVariables(text, vars = state.variables) {
        if (!text || typeof text !== "string") return text;
        const sourceVars = vars || state.variables || {};
        return text.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (match, varName) => {
            if (Object.prototype.hasOwnProperty.call(sourceVars, varName)) {
                return sourceVars[varName];
            }
            // Also attempt dot lookup if varName contains dot, e.g. {{user.id}}
            if (varName.includes(".")) {
                const nestedVal = extractValueByPath(sourceVars, varName);
                if (nestedVal !== undefined && nestedVal !== null) {
                    return nestedVal;
                }
            }
            return match; // Keep unchanged if unresolved
        });
    }

    /**
     * Resolves variables inside an entire JSON body structure or raw string.
     * Handles type coercion (e.g. "\"{{num}}\"" -> numeric value if appropriate).
     * @param {string} rawBody
     * @returns {string}
     */
    function interpolateBody(rawBody) {
        if (!rawBody || typeof rawBody !== "string") return rawBody;
        return interpolateVariables(rawBody);
    }

    /**
     * Extracts a nested property from a JSON object using dot notation and array indexing.
     * Examples: "id", "data.token", "items[0].guid", "result.users[2].email"
     * @param {object} obj
     * @param {string} pathStr
     * @returns {any}
     */
    function extractValueByPath(obj, pathStr) {
        if (!obj || !pathStr) return undefined;
        const normalized = pathStr.replace(/\[(\w+)\]/g, ".$1").replace(/^\./, "");
        const parts = normalized.split(".");
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
        }
        return current;
    }

    /**
     * Discovers all candidate property paths in an object for suggested extraction.
     * @param {object} obj
     * @param {string} prefix
     * @param {number} depth
     * @returns {Array<{ path: string, value: any }>}
     */
    function discoverObjectProperties(obj, prefix = "", depth = 0) {
        if (!obj || depth > 3 || typeof obj !== "object") return [];
        const results = [];
        for (const [key, val] of Object.entries(obj)) {
            const currentPath = prefix ? `${prefix}.${key}` : key;
            if (val === null || typeof val !== "object") {
                results.push({ path: currentPath, value: val });
            } else if (Array.isArray(val)) {
                if (val.length > 0) {
                    if (typeof val[0] === "object") {
                        results.push(...discoverObjectProperties(val[0], `${currentPath}[0]`, depth + 1));
                    } else {
                        results.push({ path: `${currentPath}[0]`, value: val[0] });
                    }
                }
            } else {
                results.push(...discoverObjectProperties(val, currentPath, depth + 1));
            }
        }
        return results;
    }

    // =========================================================================
    // 5. SWAGGER AUTH & OPENAPI SPEC EXTRACTION
    // =========================================================================

    /**
     * Extracts token value string from a Swagger authorized scheme entry.
     * @param {object} schemeData
     * @returns {string|null}
     */
    function extractTokenFromSchemeData(schemeData) {
        if (!schemeData) return null;
        // Direct Bearer token value
        const tokenVal = typeof schemeData.get === "function" ? schemeData.get("value") : schemeData.value;
        if (tokenVal && typeof tokenVal === "string" && tokenVal.trim()) {
            return tokenVal.replace(/^Bearer\s+/i, "").trim();
        }

        // Nested token object (OAuth2 / MSAL / PKCE)
        const nestedToken = typeof schemeData.get === "function" ? schemeData.get("token") : schemeData.token;
        if (nestedToken) {
            const access = typeof nestedToken.get === "function"
                ? (nestedToken.get("access_token") || nestedToken.get("token"))
                : (nestedToken.access_token || nestedToken.token);
            if (access && typeof access === "string" && access.trim()) {
                return access.replace(/^Bearer\s+/i, "").trim();
            }
        }
        return null;
    }

    /**
     * Retrieves active Bearer token from Swagger UI Redux store in memory.
     * Prioritizes application token (e.g. Febe / Bearer) over identity provider token (MSAL).
     * @returns {string|null}
     */
    function getActiveBearerToken() {
        try {
            const ui = window.ui;
            if (!ui || typeof ui.getState !== "function") return null;
            const authState = ui.getState().get("auth");
            if (!authState) return null;
            const authorized = authState.get("authorized");
            if (!authorized || typeof authorized.get !== "function") return null;

            // 1. If explicit scheme configured, check it first
            if (CONFIG.PREFERRED_SCHEME) {
                const preferredEntry = authorized.get(CONFIG.PREFERRED_SCHEME);
                const prefToken = extractTokenFromSchemeData(preferredEntry);
                if (prefToken) return prefToken;
            }

            // 2. Prioritize configured Application Bearer scheme (Febe token)
            const appBearerCandidates = [
                CONFIG.APP_BEARER_SCHEME,
                "Bearer",
                "BearerAuth",
                "appBearer",
                "AppBearer"
            ];
            for (const schemeName of appBearerCandidates) {
                if (!schemeName) continue;
                const entry = authorized.get(schemeName);
                const token = extractTokenFromSchemeData(entry);
                if (token) return token;
            }

            // 3. Fallback: inspect any authorized schemes excluding MSAL
            for (const [schemeKey, schemeData] of authorized.entries()) {
                if (!schemeData || schemeKey === CONFIG.MSAL_SCHEME) continue;
                const token = extractTokenFromSchemeData(schemeData);
                if (token) return token;
            }

            // 4. Last resort: if only MSAL scheme is present, use it
            const msalEntry = authorized.get(CONFIG.MSAL_SCHEME);
            if (msalEntry) {
                const msalToken = extractTokenFromSchemeData(msalEntry);
                if (msalToken) return msalToken;
            }
        } catch (e) {
            console.warn("[Swagger Flow Runner] Error reading Bearer token:", e);
        }
        return null;
    }

    /**
     * Reads OpenAPI specification paths and components from Swagger UI Redux store.
     * @returns {Array<{ method: string, path: string, summary: string, tag: string }>}
     */
    function getSwaggerOperations() {
        try {
            const ui = window.ui;
            if (!ui || typeof ui.getState !== "function") return [];
            const specState = ui.getState().get("spec");
            if (!specState) return [];
            const jsonSpec = typeof specState.get === "function" ? specState.get("json") : null;
            if (!jsonSpec || typeof jsonSpec.toJS !== "function") return [];

            const specObj = jsonSpec.toJS();
            if (!specObj.paths) return [];

            const operations = [];
            const methods = ["get", "post", "put", "delete", "patch", "head", "options"];

            for (const [pathKey, pathItem] of Object.entries(specObj.paths)) {
                if (!pathItem) continue;
                for (const m of methods) {
                    if (pathItem[m]) {
                        const op = pathItem[m];
                        operations.push({
                            method: m.toUpperCase(),
                            path: pathKey,
                            summary: op.summary || op.operationId || pathKey,
                            tag: (op.tags && op.tags[0]) || "General",
                            parameters: op.parameters || [],
                            requestBody: op.requestBody || null
                        });
                    }
                }
            }
            return operations;
        } catch (e) {
            console.warn("[Swagger Flow Runner] Error extracting operations:", e);
            return [];
        }
    }

    // =========================================================================
    // 6. EXECUTION RUNNER ENGINE
    // =========================================================================

    /**
     * Executes a single step with interpolated parameters and variable extraction.
     * @param {object} step
     * @param {number} stepIndex
     * @returns {Promise<{ success: boolean, status: number, data: any }>}
     */
    async function executeStep(step, stepIndex) {
        state.stepResults[stepIndex] = {
            isRunning: true,
            status: null,
            statusText: "Executing...",
            latencyMs: null,
            headers: {},
            body: null,
            error: null,
            timestamp: Date.now()
        };
        renderModalContent();

        const startTime = Date.now();

        try {
            // 1. Build resolved URL path with variable interpolation
            let resolvedPath = interpolateVariables(step.path || "/");

            // 2. Build Query parameters
            const queryParams = new URLSearchParams();
            if (Array.isArray(step.queryParams)) {
                step.queryParams.forEach(qp => {
                    if (qp.name) {
                        queryParams.append(qp.name, interpolateVariables(qp.value || ""));
                    }
                });
            }
            const queryString = queryParams.toString();
            const finalUrl = queryString ? `${resolvedPath}${resolvedPath.includes("?") ? "&" : "?"}${queryString}` : resolvedPath;

            // 3. Build Headers
            const headers = new Headers();
            if (step.useAuth !== false) {
                const token = getActiveBearerToken();
                if (token) {
                    headers.set("Authorization", token.startsWith("Bearer ") ? token : `Bearer ${token}`);
                }
            }

            // Custom headers
            if (Array.isArray(step.headers)) {
                step.headers.forEach(h => {
                    if (h.name) {
                        headers.set(h.name, interpolateVariables(h.value || ""));
                    }
                });
            }

            // 4. Request Body (if POST/PUT/PATCH)
            let fetchBody = null;
            const hasBody = ["POST", "PUT", "PATCH"].includes(step.method);
            if (hasBody && step.body) {
                fetchBody = interpolateBody(step.body);
                if (!headers.has("Content-Type")) {
                    headers.set("Content-Type", "application/json");
                }
            }

            // 5. Execute Request
            const response = await fetch(finalUrl, {
                method: step.method,
                headers: headers,
                body: fetchBody
            });

            const latencyMs = Date.now() - startTime;
            const resHeaders = {};
            response.headers.forEach((val, key) => { resHeaders[key] = val; });

            let parsedBody = null;
            const textResponse = await response.text();
            try {
                parsedBody = JSON.parse(textResponse);
            } catch {
                parsedBody = textResponse;
            }

            // 6. Perform Declarative Variable Extraction
            if (response.ok && typeof parsedBody === "object" && parsedBody !== null && Array.isArray(step.extract)) {
                step.extract.forEach(rule => {
                    if (rule.path && rule.varName) {
                        const extractedVal = extractValueByPath(parsedBody, rule.path.trim());
                        if (extractedVal !== undefined && extractedVal !== null) {
                            state.variables[rule.varName.trim()] = typeof extractedVal === "object"
                                ? JSON.stringify(extractedVal)
                                : String(extractedVal);
                        }
                    }
                });
                saveVariables();
            }

            state.stepResults[stepIndex] = {
                isRunning: false,
                status: response.status,
                statusText: response.statusText,
                latencyMs: latencyMs,
                headers: resHeaders,
                body: parsedBody,
                error: null,
                timestamp: Date.now()
            };

            renderModalContent();
            return { success: response.ok, status: response.status, data: parsedBody };
        } catch (error) {
            const latencyMs = Date.now() - startTime;
            state.stepResults[stepIndex] = {
                isRunning: false,
                status: 0,
                statusText: "Network Failure",
                latencyMs: latencyMs,
                headers: {},
                body: null,
                error: error.message || String(error),
                timestamp: Date.now()
            };
            renderModalContent();
            return { success: false, status: 0, data: null };
        }
    }

    /**
     * Executes all steps of active scenario sequentially.
     */
    async function runActiveScenario() {
        const scenario = getActiveScenario();
        if (!scenario || !Array.isArray(scenario.steps) || scenario.steps.length === 0) return;

        state.isRunning = true;
        state.stopRequested = false;
        renderModalContent();

        for (let i = 0; i < scenario.steps.length; i++) {
            if (state.stopRequested) break;

            state.selectedStepIndex = i;
            const result = await executeStep(scenario.steps[i], i);

            // Check stop on failure
            if (!result.success && state.settings.stopOnFailure) {
                break;
            }

            // Apply delay before next step
            if (i < scenario.steps.length - 1 && state.settings.delayMs > 0 && !state.stopRequested) {
                await new Promise(r => setTimeout(r, state.settings.delayMs));
            }
        }

        state.isRunning = false;
        state.stopRequested = false;
        renderModalContent();
    }

    // =========================================================================
    // 7. MODAL UI STYLES & RENDERING
    // =========================================================================

    function injectStyles() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.STYLES)) return;
        const style = document.createElement("style");
        style.id = CONFIG.ELEMENT_IDS.STYLES;
        style.textContent = `
            /* Backdrop & Modal Container */
            .swp-fr-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(15, 23, 42, 0.7);
                backdrop-filter: blur(4px);
                z-index: 100050;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                animation: swpFrFadeIn 0.15s ease-out;
            }
            @keyframes swpFrFadeIn {
                from { opacity: 0; transform: scale(0.98); }
                to { opacity: 1; transform: scale(1); }
            }

            .swp-fr-window {
                width: 1140px;
                max-width: 95vw;
                height: 740px;
                max-height: 90vh;
                background: var(--swp-fr-bg, #ffffff);
                color: var(--swp-fr-text, #0f172a);
                border: 1px solid var(--swp-fr-border, #cbd5e1);
                border-radius: 10px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            /* Theme Variables */
            .swp-fr-overlay {
                --swp-fr-bg: #ffffff;
                --swp-fr-sidebar-bg: #f8fafc;
                --swp-fr-border: #cbd5e1;
                --swp-fr-border-light: #e2e8f0;
                --swp-fr-text: #0f172a;
                --swp-fr-text-muted: #64748b;
                --swp-fr-primary: #0284c7;
                --swp-fr-primary-hover: #0369a1;
                --swp-fr-card-hover: #f1f5f9;
                --swp-fr-input-bg: #ffffff;
                --swp-fr-code-bg: #0f172a;
                --swp-fr-code-text: #f8fafc;
            }
            html.dark-mode .swp-fr-overlay,
            body.dark-mode .swp-fr-overlay {
                --swp-fr-bg: #181818;
                --swp-fr-sidebar-bg: #202020;
                --swp-fr-border: #383838;
                --swp-fr-border-light: #2d2d2d;
                --swp-fr-text: #f5f5f5;
                --swp-fr-text-muted: #94a3b8;
                --swp-fr-primary: #38bdf8;
                --swp-fr-primary-hover: #7dd3fc;
                --swp-fr-card-hover: #2a2a2a;
                --swp-fr-input-bg: #222222;
                --swp-fr-code-bg: #111111;
                --swp-fr-code-text: #f1f5f9;
            }

            /* Header */
            .swp-fr-header {
                padding: 12px 18px;
                border-bottom: 1px solid var(--swp-fr-border);
                background: var(--swp-fr-sidebar-bg);
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-shrink: 0;
            }
            .swp-fr-title {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 15px;
                font-weight: 700;
            }
            .swp-fr-badge {
                font-size: 11px;
                padding: 2px 8px;
                border-radius: 12px;
                background: var(--swp-fr-primary);
                color: #ffffff;
                font-weight: 600;
            }
            .swp-fr-close-btn {
                background: none;
                border: 1px solid transparent;
                color: var(--swp-fr-text-muted);
                cursor: pointer;
                font-size: 16px;
                padding: 4px 8px;
                border-radius: 4px;
                transition: all 0.15s ease;
            }
            .swp-fr-close-btn:hover {
                color: var(--swp-fr-text);
                background: var(--swp-fr-border-light);
            }

            /* Studio Body (2 Columns) */
            .swp-fr-body {
                display: flex;
                flex: 1 1 auto;
                min-height: 0;
                overflow: hidden;
            }

            /* Left Column: Sidebar / Scenarios & Steps */
            .swp-fr-col-left {
                width: 380px;
                flex-shrink: 0;
                border-right: 1px solid var(--swp-fr-border);
                background: var(--swp-fr-sidebar-bg);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .swp-fr-scenario-bar {
                padding: 12px;
                border-bottom: 1px solid var(--swp-fr-border-light);
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .swp-fr-select {
                width: 100%;
                padding: 6px 10px;
                border-radius: 6px;
                border: 1px solid var(--swp-fr-border);
                background: var(--swp-fr-input-bg);
                color: var(--swp-fr-text);
                font-size: 13px;
                font-weight: 600;
                outline: none;
                box-sizing: border-box;
            }
            .swp-fr-btn-group {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
            }
            .swp-fr-btn-xs {
                font-size: 11px;
                font-weight: 600;
                padding: 4px 8px;
                border-radius: 4px;
                border: 1px solid var(--swp-fr-border);
                background: var(--swp-fr-bg);
                color: var(--swp-fr-text);
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .swp-fr-btn-xs:hover {
                background: var(--swp-fr-card-hover);
                border-color: var(--swp-fr-primary);
            }

            /* Steps Section */
            .swp-fr-steps-container {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .swp-fr-step-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 10px;
                border: 1px solid var(--swp-fr-border-light);
                border-radius: 6px;
                background: var(--swp-fr-bg);
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .swp-fr-step-item:hover {
                background: var(--swp-fr-card-hover);
            }
            .swp-fr-step-item.is-active {
                border-color: var(--swp-fr-primary);
                background: var(--swp-fr-card-hover);
                box-shadow: 0 0 0 1px var(--swp-fr-primary);
            }
            .swp-fr-method-pill {
                font-size: 10px;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 4px;
                text-transform: uppercase;
                color: #ffffff;
                flex-shrink: 0;
            }
            .swp-fr-method-GET { background: #0284c7; }
            .swp-fr-method-POST { background: #16a34a; }
            .swp-fr-method-PUT { background: #d97706; }
            .swp-fr-method-DELETE { background: #dc2626; }
            .swp-fr-method-PATCH { background: #7c3aed; }

            .swp-fr-step-title {
                flex: 1 1 auto;
                margin: 0 8px;
                font-size: 12px;
                font-weight: 600;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .swp-fr-step-status {
                font-size: 10px;
                font-weight: 700;
                padding: 2px 5px;
                border-radius: 4px;
                flex-shrink: 0;
            }
            .swp-fr-status-ok { background: #dcfce7; color: #16a34a; }
            .swp-fr-status-err { background: #fee2e2; color: #dc2626; }
            .swp-fr-status-run { background: #e0f2fe; color: #0284c7; }

            /* Left Bottom Controls */
            .swp-fr-runner-bar {
                padding: 12px;
                border-top: 1px solid var(--swp-fr-border);
                background: var(--swp-fr-sidebar-bg);
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .swp-fr-btn-run {
                width: 100%;
                padding: 8px 12px;
                border-radius: 6px;
                border: none;
                background: #16a34a;
                color: #ffffff;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                transition: opacity 0.15s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            .swp-fr-btn-run:hover { opacity: 0.9; }
            .swp-fr-btn-run.is-running { background: #dc2626; }

            /* Right Column: Detail / Step Editor */
            .swp-fr-col-right {
                flex: 1 1 auto;
                min-width: 0;
                display: flex;
                flex-direction: column;
                background: var(--swp-fr-bg);
            }

            .swp-fr-tab-nav {
                display: flex;
                align-items: center;
                border-bottom: 1px solid var(--swp-fr-border);
                background: var(--swp-fr-sidebar-bg);
                padding: 0 12px;
                gap: 4px;
            }
            .swp-fr-tab-btn {
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                padding: 10px 14px;
                font-size: 12px;
                font-weight: 600;
                color: var(--swp-fr-text-muted);
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .swp-fr-tab-btn:hover {
                color: var(--swp-fr-text);
            }
            .swp-fr-tab-btn.is-active {
                color: var(--swp-fr-primary);
                border-bottom-color: var(--swp-fr-primary);
            }

            .swp-fr-detail-content {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                padding: 16px 20px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }

            .swp-fr-field-group {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .swp-fr-field-label {
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--swp-fr-text-muted);
            }
            .swp-fr-input {
                padding: 7px 10px;
                border-radius: 6px;
                border: 1px solid var(--swp-fr-border);
                background: var(--swp-fr-input-bg);
                color: var(--swp-fr-text);
                font-size: 12px;
                outline: none;
            }
            .swp-fr-textarea {
                width: 100%;
                min-height: 140px;
                padding: 10px;
                border-radius: 6px;
                border: 1px solid var(--swp-fr-border);
                background: var(--swp-fr-code-bg);
                color: var(--swp-fr-code-text);
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 12px;
                box-sizing: border-box;
                resize: vertical;
                outline: none;
            }

            /* Extraction Table */
            .swp-fr-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
            }
            .swp-fr-table th, .swp-fr-table td {
                padding: 8px 10px;
                border: 1px solid var(--swp-fr-border-light);
                text-align: left;
            }
            .swp-fr-table th {
                background: var(--swp-fr-sidebar-bg);
                font-weight: 700;
                font-size: 11px;
            }

            /* Variables Box */
            .swp-fr-vars-box {
                max-height: 120px;
                overflow-y: auto;
                padding: 8px;
                border: 1px solid var(--swp-fr-border-light);
                border-radius: 6px;
                background: var(--swp-fr-sidebar-bg);
                font-size: 11px;
                font-family: monospace;
            }
            .swp-fr-var-chip {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 2px 6px;
                margin: 2px;
                border-radius: 4px;
                background: var(--swp-fr-border-light);
                color: var(--swp-fr-text);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Opens the 2-Column Flow Studio modal dialog.
     */
    function openFlowStudio() {
        closeFlowStudio();
        injectStyles();

        const overlay = document.createElement("div");
        overlay.id = CONFIG.ELEMENT_IDS.MODAL;
        overlay.className = "swp-fr-overlay";

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeFlowStudio();
        });

        const escHandler = (e) => {
            if (e.key === "Escape") {
                closeFlowStudio();
                window.removeEventListener("keydown", escHandler);
            }
        };
        window.addEventListener("keydown", escHandler);

        const win = document.createElement("div");
        win.className = "swp-fr-window";
        overlay.appendChild(win);
        document.body.appendChild(overlay);

        if (window.SwaggerActivityBar?.setItemActive) {
            window.SwaggerActivityBar.setItemActive("flow-runner", true);
        }

        renderModalContent();
    }

    function closeFlowStudio() {
        const existing = document.getElementById(CONFIG.ELEMENT_IDS.MODAL);
        if (existing) existing.remove();
        if (window.SwaggerActivityBar?.setItemActive) {
            window.SwaggerActivityBar.setItemActive("flow-runner", false);
        }
    }

    function toggleFlowStudio() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.MODAL)) {
            closeFlowStudio();
        } else {
            openFlowStudio();
        }
    }

    /**
     * Renders or updates complete modal markup and event listeners.
     */
    function renderModalContent() {
        const modal = document.getElementById(CONFIG.ELEMENT_IDS.MODAL);
        if (!modal) return;
        const win = modal.querySelector(".swp-fr-window");
        if (!win) return;

        const scenario = getActiveScenario();
        const steps = scenario ? (scenario.steps || []) : [];
        const activeStep = steps[state.selectedStepIndex] || null;
        const activeResult = state.stepResults[state.selectedStepIndex] || null;

        // Render Header
        let headerHtml = `
            <div class="swp-fr-header">
                <div class="swp-fr-title">
                    <span>🔗 ${t("modalTitle", "API Flow Runner Studio")}</span>
                    <span class="swp-fr-badge">${scenario ? escapeHtml(scenario.name) : ""}</span>
                </div>
                <button type="button" class="swp-fr-close-btn" id="swp-fr-btn-close">✕</button>
            </div>
        `;

        // Render Left Column
        let scenarioOptions = state.scenarios.map(s => `
            <option value="${s.id}" ${s.id === state.activeScenarioId ? "selected" : ""}>
                ${s.isHost ? "🔒 " : ""}${escapeHtml(s.name)} (${(s.steps || []).length} steps)
            </option>
        `).join("");

        let stepsListHtml = steps.length === 0
            ? `<div style="padding:20px;text-align:center;color:var(--swp-fr-text-muted);font-size:12px;">${t("noStepsNotice", "No steps yet.")}</div>`
            : steps.map((st, idx) => {
                const res = state.stepResults[idx];
                let statusBadge = "";
                if (res?.isRunning) {
                    statusBadge = `<span class="swp-fr-step-status swp-fr-status-run">⏳ run</span>`;
                } else if (res?.status) {
                    const isOk = res.status >= 200 && res.status < 300;
                    statusBadge = `<span class="swp-fr-step-status ${isOk ? "swp-fr-status-ok" : "swp-fr-status-err"}">${res.status} · ${res.latencyMs}ms</span>`;
                }

                return `
                    <div class="swp-fr-step-item ${idx === state.selectedStepIndex ? "is-active" : ""}" data-step-index="${idx}">
                        <span class="swp-fr-method-pill swp-fr-method-${st.method}">${st.method}</span>
                        <span class="swp-fr-step-title" title="${escapeHtml(st.name || st.path)}">${idx + 1}. ${escapeHtml(st.name || st.path)}</span>
                        ${statusBadge}
                        <button type="button" class="swp-fr-btn-xs" data-action="delete-step" data-step-index="${idx}" title="Delete step" style="border:none;background:none;color:var(--swp-fr-text-muted);cursor:pointer;padding:2px 4px;">✕</button>
                    </div>
                `;
            }).join("");

        let varChips = Object.entries(state.variables).map(([k, v]) => `
            <span class="swp-fr-var-chip" title="${escapeHtml(v)}">
                <strong>{{${escapeHtml(k)}}}:</strong> ${escapeHtml(v.length > 20 ? v.slice(0, 18) + "..." : v)}
            </span>
        `).join("");

        let leftColHtml = `
            <div class="swp-fr-col-left">
                <div class="swp-fr-scenario-bar">
                    <select class="swp-fr-select" id="swp-fr-scenario-select">
                        ${scenarioOptions}
                    </select>
                    <div class="swp-fr-btn-group">
                        <button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-new">${t("btnNewScenario", "➕ New")}</button>
                        <button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-clone">${t("btnCloneScenario", "📋 Clone")}</button>
                        ${!scenario?.isHost ? `<button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-delete">${t("btnDeleteScenario", "🗑️ Delete")}</button>` : ""}
                        <button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-export">${t("btnExport", "📥 Export")}</button>
                        <button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-import">${t("btnImport", "📤 Import")}</button>
                    </div>
                </div>

                <div style="padding:8px 12px;border-bottom:1px solid var(--swp-fr-border-light);display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--swp-fr-text-muted);">${t("stepsTitle", "Scenario Steps")} (${steps.length})</span>
                    <button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-add-op">${t("btnAddStep", "➕ Add Step")}</button>
                </div>

                <div class="swp-fr-steps-container">
                    ${stepsListHtml}
                </div>

                <div style="padding:10px 12px;border-top:1px solid var(--swp-fr-border-light);background:var(--swp-fr-sidebar-bg);">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--swp-fr-text-muted);">${t("variablesTitle", "Variables")} (${Object.keys(state.variables).length})</span>
                        ${Object.keys(state.variables).length > 0 ? `<button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-clear-vars" style="font-size:10px;padding:2px 6px;">${t("btnClearVariables", "Clear")}</button>` : ""}
                    </div>
                    <div class="swp-fr-vars-box">
                        ${varChips || `<span style="color:var(--swp-fr-text-muted);">${t("noVariablesNotice", "No variables")}</span>`}
                    </div>
                </div>

                <div class="swp-fr-runner-bar">
                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;">
                        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;">
                            <input type="checkbox" id="swp-fr-opt-stop-fail" ${state.settings.stopOnFailure ? "checked" : ""}>
                            <span>${t("stopOnFailure", "Stop on failure")}</span>
                        </label>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <span>${t("stepDelay", "Delay:")}</span>
                            <select id="swp-fr-opt-delay" style="font-size:11px;border-radius:4px;border:1px solid var(--swp-fr-border);background:var(--swp-fr-input-bg);color:var(--swp-fr-text);">
                                <option value="0" ${state.settings.delayMs === 0 ? "selected" : ""}>0 ms</option>
                                <option value="250" ${state.settings.delayMs === 250 ? "selected" : ""}>250 ms</option>
                                <option value="500" ${state.settings.delayMs === 500 ? "selected" : ""}>500 ms</option>
                                <option value="1000" ${state.settings.delayMs === 1000 ? "selected" : ""}>1000 ms</option>
                            </select>
                        </div>
                    </div>
                    <button type="button" class="swp-fr-btn-run ${state.isRunning ? "is-running" : ""}" id="swp-fr-btn-run-all">
                        ${state.isRunning ? t("btnStop", "⏹ Stop") : t("btnRunAll", "▶ Run Flow")}
                    </button>
                </div>
            </div>
        `;

        // Render Right Column
        let rightColHtml = "";
        if (!activeStep) {
            rightColHtml = `
                <div class="swp-fr-col-right" style="align-items:center;justify-content:center;color:var(--swp-fr-text-muted);font-size:13px;">
                    <span>👈 ${t("noStepsNotice", "Select or add a step to inspect configuration.")}</span>
                </div>
            `;
        } else {
            let tabNav = `
                <div class="swp-fr-tab-nav">
                    <button type="button" class="swp-fr-tab-btn ${state.activeTab === "request" ? "is-active" : ""}" data-tab="request">${t("tabRequest", "Request Config")}</button>
                    <button type="button" class="swp-fr-tab-btn ${state.activeTab === "extract" ? "is-active" : ""}" data-tab="extract">${t("tabExtract", "Variable Extraction")} (${(activeStep.extract || []).length})</button>
                    <button type="button" class="swp-fr-tab-btn ${state.activeTab === "response" ? "is-active" : ""}" data-tab="response">${t("tabResponse", "Response & Output")}</button>
                    <div style="flex:1;"></div>
                    <button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-run-step" style="background:var(--swp-fr-primary);color:#fff;border-color:transparent;padding:5px 10px;">${t("btnExecuteStep", "⚡ Run This Step")}</button>
                </div>
            `;

            let tabContent = "";
            if (state.activeTab === "request") {
                tabContent = `
                    <div class="swp-fr-field-group">
                        <label class="swp-fr-field-label">${t("stepNameLabel", "Step Name:")}</label>
                        <input type="text" class="swp-fr-input" id="swp-fr-input-name" value="${escapeHtml(activeStep.name || "")}">
                    </div>

                    <div style="display:flex;gap:10px;">
                        <div class="swp-fr-field-group" style="width:110px;">
                            <label class="swp-fr-field-label">${t("methodLabel", "Method:")}</label>
                            <select class="swp-fr-input" id="swp-fr-input-method" style="font-weight:700;">
                                ${["GET", "POST", "PUT", "DELETE", "PATCH"].map(m => `<option value="${m}" ${activeStep.method === m ? "selected" : ""}>${m}</option>`).join("")}
                            </select>
                        </div>
                        <div class="swp-fr-field-group" style="flex:1;">
                            <label class="swp-fr-field-label">${t("pathLabel", "Endpoint Path (supports {{var}}):")}</label>
                            <input type="text" class="swp-fr-input" id="swp-fr-input-path" value="${escapeHtml(activeStep.path || "")}">
                        </div>
                    </div>

                    <div style="margin-top:2px;">
                        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
                            <input type="checkbox" id="swp-fr-input-auth" ${activeStep.useAuth !== false ? "checked" : ""}>
                            <span>${t("authCheckbox", "Send active Swagger UI Bearer Token")}</span>
                        </label>
                    </div>

                    <div class="swp-fr-field-group">
                        <div style="display:flex;align-items:center;justify-content:space-between;">
                            <label class="swp-fr-field-label">${t("bodyTitle", "Request Body:")}</label>
                            <button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-format-json">${t("btnFormatJson", "Format JSON")}</button>
                        </div>
                        <textarea class="swp-fr-textarea" id="swp-fr-input-body" placeholder='{\n  "id": "{{candidateId}}"\n}'>${escapeHtml(activeStep.body || "")}</textarea>
                    </div>
                `;
            } else if (state.activeTab === "extract") {
                let rulesRows = (activeStep.extract || []).map((r, rIdx) => `
                    <tr>
                        <td><input type="text" class="swp-fr-input swp-fr-rule-path" data-rule-index="${rIdx}" value="${escapeHtml(r.path || "")}" style="width:100%;box-sizing:border-box;"></td>
                        <td><input type="text" class="swp-fr-input swp-fr-rule-var" data-rule-index="${rIdx}" value="${escapeHtml(r.varName || "")}" style="width:100%;box-sizing:border-box;"></td>
                        <td style="text-align:center;"><button type="button" class="swp-fr-btn-xs" data-action="delete-rule" data-rule-index="${rIdx}">✕</button></td>
                    </tr>
                `).join("");

                tabContent = `
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-size:12px;font-weight:700;">${t("extractTableTitle", "Extract values from response")}</span>
                        <div class="swp-fr-btn-group">
                            <button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-add-rule">${t("btnAddExtractRule", "+ Add Rule")}</button>
                            <button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-suggest">${t("btnSuggestExtract", "🪄 Suggest from response")}</button>
                        </div>
                    </div>

                    <table class="swp-fr-table">
                        <thead>
                            <tr>
                                <th>${t("extractPropHeader", "Response JSON Property")}</th>
                                <th>${t("extractVarHeader", "Variable Name (without {{}})")}</th>
                                <th style="width:40px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rulesRows || `<tr><td colspan="3" style="text-align:center;color:var(--swp-fr-text-muted);">${t("noExtractRules", "No extraction rules defined.")}</td></tr>`}
                        </tbody>
                    </table>
                `;
            } else if (state.activeTab === "response") {
                if (!activeResult) {
                    tabContent = `
                        <div style="padding:40px 20px;text-align:center;color:var(--swp-fr-text-muted);font-size:13px;">
                            ${t("noResponseYet", "Step has not been executed yet.")}
                        </div>
                    `;
                } else {
                    const isOk = activeResult.status >= 200 && activeResult.status < 300;
                    const jsonString = typeof activeResult.body === "object"
                        ? JSON.stringify(activeResult.body, null, 2)
                        : String(activeResult.body || "");

                    tabContent = `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:6px;background:var(--swp-fr-sidebar-bg);border:1px solid var(--swp-fr-border-light);">
                            <div style="display:flex;align-items:center;gap:12px;font-size:13px;">
                                <span class="swp-fr-step-status ${isOk ? "swp-fr-status-ok" : "swp-fr-status-err"}" style="font-size:12px;padding:3px 8px;">
                                    ${activeResult.status} ${escapeHtml(activeResult.statusText || "")}
                                </span>
                                <span>⏱ ${activeResult.latencyMs} ms</span>
                            </div>
                            <button type="button" class="swp-fr-btn-xs" id="swp-fr-btn-copy-res">${t("btnCopyResponse", "📋 Copy")}</button>
                        </div>

                        ${activeResult.error ? `<div style="color:#dc2626;font-size:12px;font-weight:600;">⚠️ Error: ${escapeHtml(activeResult.error)}</div>` : ""}

                        <div class="swp-fr-field-group">
                            <label class="swp-fr-field-label">${t("responseBody", "Response Body:")}</label>
                            <textarea class="swp-fr-textarea" readonly style="min-height:280px;">${escapeHtml(jsonString)}</textarea>
                        </div>
                    `;
                }
            }

            rightColHtml = `
                <div class="swp-fr-col-right">
                    ${tabNav}
                    <div class="swp-fr-detail-content">
                        ${tabContent}
                    </div>
                </div>
            `;
        }

        win.innerHTML = `
            ${headerHtml}
            <div class="swp-fr-body">
                ${leftColHtml}
                ${rightColHtml}
            </div>
        `;

        // Bind Event Handlers
        bindModalEvents(win);
    }

    /**
     * Attaches interactive event listeners to modal elements.
     */
    function bindModalEvents(win) {
        // Close Button
        win.querySelector("#swp-fr-btn-close")?.addEventListener("click", closeFlowStudio);

        // Scenario Selector
        const scenarioSelect = win.querySelector("#swp-fr-scenario-select");
        scenarioSelect?.addEventListener("change", (e) => {
            state.activeScenarioId = e.target.value;
            state.selectedStepIndex = 0;
            state.stepResults = {};
            saveCustomScenarios();
            renderModalContent();
        });

        // Scenario Buttons
        win.querySelector("#swp-fr-btn-new")?.addEventListener("click", () => {
            const name = prompt(t("promptNewScenarioName", "Enter scenario name:"), "New Workflow");
            if (!name) return;
            const newScenario = {
                id: `scenario_${Date.now()}`,
                name: name.trim(),
                description: "",
                steps: []
            };
            state.scenarios.push(newScenario);
            state.activeScenarioId = newScenario.id;
            state.selectedStepIndex = 0;
            state.stepResults = {};
            saveCustomScenarios();
            renderModalContent();
        });

        win.querySelector("#swp-fr-btn-clone")?.addEventListener("click", () => {
            const current = getActiveScenario();
            if (!current) return;
            const name = prompt(t("promptCloneScenarioName", "Enter name for cloned scenario:"), `${current.name} (Copy)`);
            if (!name) return;
            const cloned = {
                id: `scenario_${Date.now()}`,
                name: name.trim(),
                description: current.description || "",
                steps: (current.steps || []).map(cloneStep)
            };
            state.scenarios.push(cloned);
            state.activeScenarioId = cloned.id;
            state.selectedStepIndex = 0;
            state.stepResults = {};
            saveCustomScenarios();
            renderModalContent();
        });

        win.querySelector("#swp-fr-btn-delete")?.addEventListener("click", () => {
            const current = getActiveScenario();
            if (!current || current.isHost) return;
            if (confirm(t("confirmDeleteScenario", `Are you sure you want to delete scenario '${current.name}'?`, { name: current.name }))) {
                state.scenarios = state.scenarios.filter(s => s.id !== current.id);
                state.activeScenarioId = state.scenarios[0] ? state.scenarios[0].id : null;
                state.selectedStepIndex = 0;
                state.stepResults = {};
                saveCustomScenarios();
                renderModalContent();
            }
        });

        // Export Scenarios JSON
        win.querySelector("#swp-fr-btn-export")?.addEventListener("click", () => {
            const customOnly = state.scenarios.filter(s => !s.isHost);
            const blob = new Blob([JSON.stringify(customOnly, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `swagger-flow-runner-scenarios-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        // Import Scenarios JSON
        win.querySelector("#swp-fr-btn-import")?.addEventListener("click", () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "application/json";
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const parsed = JSON.parse(ev.target.result);
                        const importedList = Array.isArray(parsed) ? parsed : [parsed];
                        let count = 0;
                        importedList.forEach(sc => {
                            if (sc && sc.name && Array.isArray(sc.steps)) {
                                sc.id = `imported_${Date.now()}_${count}`;
                                sc.isHost = false;
                                state.scenarios.push(sc);
                                count++;
                            }
                        });
                        saveCustomScenarios();
                        renderModalContent();
                        alert(t("importSuccess", `Imported ${count} scenario(s) successfully!`, { count }));
                    } catch {
                        alert(t("importError", "Invalid scenario JSON format."));
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });

        // Add Step from Swagger Operations
        win.querySelector("#swp-fr-btn-add-op")?.addEventListener("click", () => {
            showAddOperationPicker();
        });

        // Step selection and step deletion
        win.querySelectorAll(".swp-fr-step-item").forEach(item => {
            item.addEventListener("click", (e) => {
                if (e.target.closest('[data-action="delete-step"]')) {
                    const stepIdx = parseInt(e.target.closest('[data-action="delete-step"]').getAttribute("data-step-index"), 10);
                    const scenario = getActiveScenario();
                    if (scenario && scenario.steps) {
                        scenario.steps.splice(stepIdx, 1);
                        if (state.selectedStepIndex >= scenario.steps.length) {
                            state.selectedStepIndex = Math.max(0, scenario.steps.length - 1);
                        }
                        saveCustomScenarios();
                        renderModalContent();
                    }
                    return;
                }
                const idx = parseInt(item.getAttribute("data-step-index"), 10);
                state.selectedStepIndex = idx;
                renderModalContent();
            });
        });

        // Clear Variables
        win.querySelector("#swp-fr-btn-clear-vars")?.addEventListener("click", () => {
            state.variables = {};
            saveVariables();
            renderModalContent();
        });

        // Runner Controls
        win.querySelector("#swp-fr-opt-stop-fail")?.addEventListener("change", (e) => {
            state.settings.stopOnFailure = e.target.checked;
            saveCustomScenarios();
        });

        win.querySelector("#swp-fr-opt-delay")?.addEventListener("change", (e) => {
            state.settings.delayMs = parseInt(e.target.value, 10);
            saveCustomScenarios();
        });

        win.querySelector("#swp-fr-btn-run-all")?.addEventListener("click", () => {
            if (state.isRunning) {
                state.stopRequested = true;
            } else {
                runActiveScenario();
            }
        });

        // Right Column Tab Navigation
        win.querySelectorAll(".swp-fr-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                state.activeTab = btn.getAttribute("data-tab");
                renderModalContent();
            });
        });

        // Step Editor Inputs (Save changes live)
        const scenario = getActiveScenario();
        const activeStep = scenario ? (scenario.steps || [])[state.selectedStepIndex] : null;

        if (activeStep) {
            win.querySelector("#swp-fr-input-name")?.addEventListener("input", (e) => {
                activeStep.name = e.target.value;
                saveCustomScenarios();
            });
            win.querySelector("#swp-fr-input-method")?.addEventListener("change", (e) => {
                activeStep.method = e.target.value;
                saveCustomScenarios();
                renderModalContent();
            });
            win.querySelector("#swp-fr-input-path")?.addEventListener("input", (e) => {
                activeStep.path = e.target.value;
                saveCustomScenarios();
            });
            win.querySelector("#swp-fr-input-auth")?.addEventListener("change", (e) => {
                activeStep.useAuth = e.target.checked;
                saveCustomScenarios();
            });
            win.querySelector("#swp-fr-input-body")?.addEventListener("input", (e) => {
                activeStep.body = e.target.value;
                saveCustomScenarios();
            });

            // Format JSON button
            win.querySelector("#swp-fr-btn-format-json")?.addEventListener("click", () => {
                const textarea = win.querySelector("#swp-fr-input-body");
                if (textarea && textarea.value) {
                    try {
                        const parsed = JSON.parse(textarea.value);
                        textarea.value = JSON.stringify(parsed, null, 2);
                        activeStep.body = textarea.value;
                        saveCustomScenarios();
                    } catch {}
                }
            });

            // Run only single step
            win.querySelector("#swp-fr-btn-run-step")?.addEventListener("click", async () => {
                await executeStep(activeStep, state.selectedStepIndex);
                state.activeTab = "response";
                renderModalContent();
            });

            // Copy response button
            win.querySelector("#swp-fr-btn-copy-res")?.addEventListener("click", (e) => {
                const res = state.stepResults[state.selectedStepIndex];
                if (res) {
                    const txt = typeof res.body === "object" ? JSON.stringify(res.body, null, 2) : String(res.body || "");
                    navigator.clipboard.writeText(txt).then(() => {
                        const btn = e.target;
                        const orig = btn.textContent;
                        btn.textContent = t("copiedFeedback", "✓ Copied!");
                        setTimeout(() => { btn.textContent = orig; }, 1500);
                    });
                }
            });

            // Extraction rules table bindings
            win.querySelectorAll(".swp-fr-rule-path").forEach(input => {
                input.addEventListener("input", (e) => {
                    const rIdx = parseInt(e.target.getAttribute("data-rule-index"), 10);
                    if (activeStep.extract && activeStep.extract[rIdx]) {
                        activeStep.extract[rIdx].path = e.target.value;
                        saveCustomScenarios();
                    }
                });
            });

            win.querySelectorAll(".swp-fr-rule-var").forEach(input => {
                input.addEventListener("input", (e) => {
                    const rIdx = parseInt(e.target.getAttribute("data-rule-index"), 10);
                    if (activeStep.extract && activeStep.extract[rIdx]) {
                        activeStep.extract[rIdx].varName = e.target.value;
                        saveCustomScenarios();
                    }
                });
            });

            win.querySelectorAll('[data-action="delete-rule"]').forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const rIdx = parseInt(e.target.getAttribute("data-rule-index"), 10);
                    if (activeStep.extract) {
                        activeStep.extract.splice(rIdx, 1);
                        saveCustomScenarios();
                        renderModalContent();
                    }
                });
            });

            win.querySelector("#swp-fr-btn-add-rule")?.addEventListener("click", () => {
                if (!Array.isArray(activeStep.extract)) activeStep.extract = [];
                activeStep.extract.push({ path: "id", varName: "id" });
                saveCustomScenarios();
                renderModalContent();
            });

            // Suggest extraction from last response
            win.querySelector("#swp-fr-btn-suggest")?.addEventListener("click", () => {
                const lastRes = state.stepResults[state.selectedStepIndex];
                if (!lastRes || !lastRes.body || typeof lastRes.body !== "object") {
                    alert("Run the step first to inspect its response properties!");
                    return;
                }
                const props = discoverObjectProperties(lastRes.body);
                if (props.length === 0) {
                    alert("No properties found in response object.");
                    return;
                }
                if (!Array.isArray(activeStep.extract)) activeStep.extract = [];
                props.slice(0, 5).forEach(p => {
                    const cleanVar = p.path.replace(/[^a-zA-Z0-9]/g, "_");
                    if (!activeStep.extract.some(r => r.path === p.path)) {
                        activeStep.extract.push({ path: p.path, varName: cleanVar });
                    }
                });
                saveCustomScenarios();
                renderModalContent();
            });
        }
    }

    /**
     * Shows a searchable modal/popover to pick an OpenAPI endpoint and add it to the scenario.
     */
    function showAddOperationPicker() {
        const operations = getSwaggerOperations();
        const scenario = getActiveScenario();
        if (!scenario) return;

        const popover = document.createElement("div");
        popover.className = "swp-fr-overlay";
        popover.style.zIndex = "100060";

        popover.innerHTML = `
            <div class="swp-fr-window" style="width:680px;height:520px;">
                <div class="swp-fr-header">
                    <span style="font-weight:700;font-size:14px;">${t("btnAddStep", "➕ Add Operation from Swagger")}</span>
                    <button type="button" class="swp-fr-close-btn" id="swp-fr-picker-close">✕</button>
                </div>
                <div style="padding:10px 14px;border-bottom:1px solid var(--swp-fr-border-light);">
                    <input type="text" class="swp-fr-input" id="swp-fr-picker-search" placeholder="${t("searchOpPlaceholder", "Filter endpoints...")}" style="width:100%;box-sizing:border-box;">
                </div>
                <div class="swp-fr-steps-container" id="swp-fr-picker-list" style="padding:12px;">
                    ${renderOperationsList(operations)}
                </div>
            </div>
        `;

        document.body.appendChild(popover);

        popover.querySelector("#swp-fr-picker-close")?.addEventListener("click", () => popover.remove());
        popover.addEventListener("click", (e) => { if (e.target === popover) popover.remove(); });

        const searchInput = popover.querySelector("#swp-fr-picker-search");
        searchInput?.focus();
        searchInput?.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtered = operations.filter(op => op.path.toLowerCase().includes(query) || op.method.toLowerCase().includes(query) || (op.summary && op.summary.toLowerCase().includes(query)));
            const listEl = popover.querySelector("#swp-fr-picker-list");
            if (listEl) listEl.innerHTML = renderOperationsList(filtered);
            bindPickerItems(popover, filtered, scenario);
        });

        bindPickerItems(popover, operations, scenario);
    }

    function renderOperationsList(operations) {
        if (operations.length === 0) {
            return `<div style="text-align:center;padding:30px;color:var(--swp-fr-text-muted);">No matching operations found.</div>`;
        }
        return operations.map((op, idx) => `
            <div class="swp-fr-step-item" data-op-idx="${idx}" style="cursor:pointer;">
                <span class="swp-fr-method-pill swp-fr-method-${op.method}">${op.method}</span>
                <span class="swp-fr-step-title" style="flex:1;">${escapeHtml(op.path)}</span>
                <span style="font-size:11px;color:var(--swp-fr-text-muted);">${escapeHtml(op.summary || "")}</span>
            </div>
        `).join("");
    }

    function bindPickerItems(popover, operations, scenario) {
        popover.querySelectorAll(".swp-fr-step-item").forEach(item => {
            item.addEventListener("click", () => {
                const idx = parseInt(item.getAttribute("data-op-idx"), 10);
                const op = operations[idx];
                if (op) {
                    if (!Array.isArray(scenario.steps)) scenario.steps = [];
                    scenario.steps.push({
                        id: `step_${Date.now()}`,
                        name: op.summary || `${op.method} ${op.path}`,
                        method: op.method,
                        path: op.path,
                        useAuth: true,
                        queryParams: [],
                        headers: [],
                        body: op.method !== "GET" ? "{\n  \n}" : "",
                        extract: []
                    });
                    state.selectedStepIndex = scenario.steps.length - 1;
                    saveCustomScenarios();
                    popover.remove();
                    renderModalContent();
                }
            });
        });
    }

    function escapeHtml(str) {
        if (!str || typeof str !== "string") return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // =========================================================================
    // 8. ACTIVITY BAR DOCKING & EXTENSIONS GUIDE INTEGRATION
    // =========================================================================

    function registerInActivityBar() {
        if (!window.SwaggerActivityBar || typeof window.SwaggerActivityBar.registerItem !== "function") return;
        if (window.SwaggerActivityBar.getItemElement("flow-runner")) return;

        window.SwaggerActivityBar.registerItem({
            id: "flow-runner",
            title: t("activityBarTitle", "API Flow Runner & Chained Scenarios"),
            ariaLabel: t("activityBarAria", "Flow Runner Studio"),
            iconHtml: `
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
            `,
            onClick: () => toggleFlowStudio(),
            section: "top",
            order: CONFIG.ACTIVITY_BAR_ORDER
        });
    }

    let isGuideRegistered = false;

    function registerGuideDocumentation(force = false) {
        if (isGuideRegistered && !force) return;
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerPluginGuide === "function") {
            isGuideRegistered = true;
            window.SwaggerActivityBar.registerPluginGuide({
                id: "flow-runner",
                name: "API Flow Runner & Chained Scenarios",
                version: "1.0.0",
                description: "Sequentially executes chained API requests with variable piping ({{varName}}), declarative response extraction, and live execution reports.",
                shortcuts: [
                    "Activity Bar: Click the chain icon (🔗) to open the 2-column Flow Studio modal",
                    "Piping: Use {{varName}} in route paths, queries, and JSON request bodies",
                    "Auth: Automatically inherits active Bearer token from Swagger UI Redux store",
                    "Esc: Close Flow Studio modal"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                `,
                i18n: {
                    en: {
                        name: "API Flow Runner & Chained Scenarios",
                        description: "Sequentially executes chained API requests with variable piping ({{varName}}), declarative response extraction, and live execution reports.",
                        shortcuts: [
                            "Activity Bar: Click the chain icon (🔗) to open Flow Studio",
                            "Piping: Use {{varName}} in paths, queries, and bodies",
                            "Auth: Automatically inherits active Bearer token from Swagger UI Redux store",
                            "Esc: Close Flow Studio modal"
                        ],
                        manual: `
### Overview
The **Flow Runner Studio** solves multi-step API testing inside Swagger UI without needing Postman.

### Key Capabilities
- **Variable Piping**: Use \`{{variableName}}\` in path parameters, query strings, and JSON request bodies.
- **Declarative Extraction**: Map response properties (e.g. \`id\` or \`data.token\`) directly into destination variables.
- **Sequential Execution**: Runs all steps in order with live latency and HTTP status indicators.
- **Swagger Auth Inheritance**: Steps automatically inherit the active Bearer token.
- **Import / Export**: Save workflows to \`localStorage\` or export/import as JSON.
                        `
                    },
                    it: {
                        name: "Runner Flussi API e Scenari a Catena",
                        description: "Esegue richieste API concatenate con passaggio automatico di variabili ({{varName}}), estrazione dichiarativa dalle risposte e report di esecuzione.",
                        shortcuts: [
                            "Activity Bar: Clicca l'icona catena (🔗) per aprire il Flow Studio a 2 colonne",
                            "Piping: Usa {{varName}} nei percorsi, query string e body JSON",
                            "Auth: Eredita automaticamente il Bearer token attivo da Swagger UI Redux",
                            "Esc: Chiudi il modale Flow Studio"
                        ],
                        manual: `
### Panoramica
Il **Flow Runner Studio** permette di testare flussi di chiamate concatenate direttamente in Swagger UI senza dover aprire Postman o copiare manualmente ID e token tra accordion diversi.

### Funzionalità Principali
- **Piping Variabili**: Sintassi \`{{nomeVariabile}}\` in percorsi, query string e body JSON.
- **Estrazione Dichiarativa**: Mappa proprietà delle risposte (es. \`id\` o \`data.token\`) nelle variabili con 1 click.
- **Esecuzione Sequenziale**: Esegue tutti gli step in ordine con pause configurabili e report di latenza/status HTTP.
- **Ereditarietà Auth Swagger**: Eredita automaticamente il Bearer Token applicativo attivo.
- **Import / Export**: Salva gli scenari in \`localStorage\` o esportali/importali in file JSON.
                        `
                    }
                }
            });
        }
    }

    // =========================================================================
    // 9. INITIALIZATION BOOTSTRAP
    // =========================================================================

    function init() {
        loadState();
        registerInActivityBar();
        registerGuideDocumentation();

        window.addEventListener("swagger-activity-bar:ready", () => {
            registerInActivityBar();
            registerGuideDocumentation(true);
        });

        window.addEventListener("swagger-i18n:locale-changed", () => {
            registerGuideDocumentation(true);
            if (window.SwaggerActivityBar?.updateItem) {
                window.SwaggerActivityBar.updateItem("flow-runner", {
                    title: t("activityBarTitle", "API Flow Runner & Chained Scenarios")
                });
            }
            if (document.getElementById(CONFIG.ELEMENT_IDS.MODAL)) {
                renderModalContent();
            }
        });

        console.info("[Swagger Flow Runner] Initialized successfully.");
    }

    // Expose public API on window for programmatic control or integrations
    window.SwaggerFlowRunner = {
        version: "1.0.0",
        open: openFlowStudio,
        close: closeFlowStudio,
        toggle: toggleFlowStudio,
        run: runActiveScenario,
        getActiveBearerToken,
        interpolateVariables,
        extractValueByPath,
        getState: () => state
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
