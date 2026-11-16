/**
 * Swagger UI Plugins - cURL to Swagger Auto-Matcher & Importer
 * File: swagger-curl-importer.js
 * Version: 1.0.0
 *
 * Description:
 * Parses raw cURL commands from any source (DevTools, Postman, terminal, logs),
 * automatically matches the corresponding OpenAPI endpoint in Swagger UI,
 * expands the controller/opblock, activates "Try it out", and pre-fills all
 * path parameters, query parameters, headers, and request body.
 *
 * Features:
 * - Robust state-machine cURL parser (multi-line, flags, quotes, body, headers).
 * - OpenAPI template path matching (e.g. /users/42 -> /users/{id}).
 * - Pre-populates Swagger UI React inputs with native value setters and dispatches.
 * - Smooth scroll & animated glow highlight around the target endpoint.
 * - Security Hardened: Ephemeral in-memory handling, token masking in preview,
 *   opt-in authorization sync (disabled by default), zero permanent token storage.
 * - Auto-execute toggle (optional immediate execution).
 * - Full Light / Dark theme synchronization with Swagger UI.
 * - Dynamic Activity Bar integration & Extensions Guide self-registration.
 * - Bilingual i18n support (Italian & English) with auto-detection.
 * - Comprehensive user configuration via `window.SwaggerCurlImporterConfig`.
 *
 * Zero external dependencies. 100% Vanilla JS & CSS.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. CONFIGURATION & EXTENSIBILITY
    // =========================================================================
    const userConfig = window.SwaggerCurlImporterConfig || {};

    const CONFIG = {
        /** Plugin identity */
        PLUGIN_ID: "curl-importer",
        PLUGIN_NAME: "cURL Importer",
        PLUGIN_VERSION: "1.0.0",

        /** Element IDs */
        ELEMENT_IDS: {
            MODAL: "swp-curl-importer-modal",
            STYLES: "swp-curl-importer-styles",
            TOPBAR_BTN: "swp-curl-importer-topbar-btn"
        },

        /** UI & Animation Settings */
        GLOW_DURATION_MS: typeof userConfig.glowDurationMs === "number" ? userConfig.glowDurationMs : 2500,
        ENABLE_GLOW: userConfig.enableHighlightGlow !== false,
        DEFAULT_AUTO_EXECUTE: Boolean(userConfig.defaultAutoExecute),
        DEFAULT_SYNC_AUTH: Boolean(userConfig.defaultSyncAuth),
        MASK_TOKEN_IN_PREVIEW: userConfig.maskTokenInPreview !== false,

        /** Keyboard Shortcuts */
        SHORTCUTS: {
            KEY: (userConfig.shortcuts?.openModal || "i").toLowerCase(),
            MODIFIER: (userConfig.shortcuts?.modifier || "ctrl+shift").toLowerCase(),
            SUBMIT_ON_ENTER: userConfig.shortcuts?.submitOnEnter !== false
        },

        /** Activity Bar Integration */
        ACTIVITY_BAR: {
            ENABLED: userConfig.activityBar?.enabled !== false,
            ORDER: typeof userConfig.activityBar?.order === "number" ? userConfig.activityBar.order : 45
        },

        /** Topbar Injection */
        TOPBAR_BUTTON: {
            ENABLED: userConfig.topbarButton?.enabled !== false
        },

        /** Language Setting */
        LOCALE: userConfig.locale || "auto"
    };

    // =========================================================================
    // 2. INTERNATIONALIZATION (i18n)
    // =========================================================================
    const I18N = {
        en: {
            activityBarTitle: "Import cURL (Ctrl+Shift+I)",
            topbarBtnText: "Import cURL",
            modalTitle: "Import cURL Command",
            modalSubtitle: "Paste a cURL command from DevTools, Postman, or terminal to auto-navigate and fill Swagger UI",
            textareaPlaceholder: "curl -X POST \"https://api.example.com/v1/orders/1024\" \\\n  -H \"Authorization: Bearer eyJhbGciOi...\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"quantity\": 2, \"status\": \"NEW\"}'",
            detectedTitle: "Parsed Request Preview:",
            methodLabel: "Method:",
            pathLabel: "Path:",
            paramsCount: "{count} params",
            headersCount: "{count} headers",
            hasBody: "Body present",
            tokenDetectedWarning: "Security Notice: Authorization token detected. Syncing with Swagger Authorize is optional and strictly in-memory.",
            syncAuthLabel: "Synchronize token with Swagger Authorize (Session)",
            syncAuthHelp: "Applies the extracted Bearer/ApiKey to Swagger's global authorization state for this browser tab.",
            autoExecuteLabel: "Auto-execute request immediately after pre-fill",
            autoExecuteHelp: "Automatically clicks 'Execute' once all fields and body parameters are populated.",
            btnCancel: "Cancel",
            btnImport: "📥 Import & Match Endpoint",
            errEmptyInput: "Please paste a valid cURL command.",
            errInvalidCurl: "Could not parse cURL command. Ensure it starts with 'curl' or contains valid HTTP flags.",
            errNoMatch: "No matching endpoint found in Swagger UI for: {method} {path}",
            successMatched: "Matched {method} {path} — form prefilled successfully!",
            tokenMasked: "{scheme} {masked} ({length} chars)",
            guideDescription: "Instantly imports raw cURL commands, auto-matches the corresponding OpenAPI endpoint, activates 'Try it out', and pre-fills all path, query, header, and body inputs with optional execution and security-hardened token sync."
        },
        it: {
            activityBarTitle: "Importa cURL (Ctrl+Shift+I)",
            topbarBtnText: "Importa cURL",
            modalTitle: "Importa Comando cURL",
            modalSubtitle: "Incolla un comando cURL da DevTools, Postman o terminale per aprire e precompilare l'endpoint in Swagger UI",
            textareaPlaceholder: "curl -X POST \"https://api.example.com/v1/orders/1024\" \\\n  -H \"Authorization: Bearer eyJhbGciOi...\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"quantity\": 2, \"status\": \"NEW\"}'",
            detectedTitle: "Anteprima Richiesta Rilevata:",
            methodLabel: "Metodo:",
            pathLabel: "Percorso:",
            paramsCount: "{count} parametri",
            headersCount: "{count} header",
            hasBody: "Body presente",
            tokenDetectedWarning: "Avviso di Sicurezza: Token di autenticazione rilevato. La sincronizzazione con Authorize di Swagger è facoltativa e solo in-memory.",
            syncAuthLabel: "Sincronizza token in Authorize di Swagger (Sessione)",
            syncAuthHelp: "Applica il token Bearer o ApiKey estratto all'autorizzazione globale di Swagger per questa scheda.",
            autoExecuteLabel: "Esegui chiamata subito dopo la compilazione",
            autoExecuteHelp: "Clicca automaticamente su 'Execute' non appena tutti i parametri e il body sono compilati.",
            btnCancel: "Annulla",
            btnImport: "📥 Importa & Apri Endpoint",
            errEmptyInput: "Incolla un comando cURL valido.",
            errInvalidCurl: "Impossibile analizzare il comando cURL. Verifica che inizi con 'curl' o contenga parametri HTTP validi.",
            errNoMatch: "Nessun endpoint corrispondente trovato in Swagger UI per: {method} {path}",
            successMatched: "Corrispondenza trovata per {method} {path} — form precompilato con successo!",
            tokenMasked: "{scheme} {masked} ({length} caratteri)",
            guideDescription: "Importa istantaneamente comandi cURL grezzi, individua l'endpoint OpenAPI corrispondente, attiva 'Try it out' e precompila parametri di path, query, header e body con auto-esecuzione e sincronizzazione auth sicura."
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

    // =========================================================================
    // 3. cURL PARSER ENGINE
    // =========================================================================
    /**
     * Splits a shell command string into an array of command arguments,
     * honoring single quotes, double quotes, ANSI quotes, and backslash escapes.
     * @param {string} cmd
     * @returns {string[]}
     */
    function tokenizeShellCommand(cmd) {
        const tokens = [];
        let current = "";
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let escaped = false;

        // Clean newlines with trailing backslashes or powershell backticks
        const cleanCmd = cmd
            .replace(/\\\r?\n/g, " ")
            .replace(/`\r?\n/g, " ")
            .trim();

        for (let i = 0; i < cleanCmd.length; i++) {
            const char = cleanCmd[i];

            if (escaped) {
                current += char;
                escaped = false;
                continue;
            }

            if (char === "\\" && !inSingleQuote) {
                escaped = true;
                continue;
            }

            if (char === "'" && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
                continue;
            }

            if (char === '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
                continue;
            }

            if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
                if (current.length > 0) {
                    tokens.push(current);
                    current = "";
                }
                continue;
            }

            current += char;
        }

        if (current.length > 0) {
            tokens.push(current);
        }

        return tokens;
    }

    /**
     * Robust cURL Command Parser.
     * Extracts method, url, pathname, query params, headers, body, and auth tokens.
     * @param {string} rawInput
     * @returns {Object|null}
     */
    function parseCurlCommand(rawInput) {
        if (!rawInput || typeof rawInput !== "string") return null;

        const tokens = tokenizeShellCommand(rawInput.trim());
        if (tokens.length === 0) return null;

        let method = null;
        let rawUrl = "";
        const headers = {};
        const queryParams = {};
        let body = "";
        let authHeader = "";

        let i = 0;
        // Skip leading 'curl' or 'curl.exe'
        if (/^curl(\.exe)?$/i.test(tokens[0])) {
            i = 1;
        }

        while (i < tokens.length) {
            const token = tokens[i];
            const next = tokens[i + 1] !== undefined ? tokens[i + 1] : "";

            if (token === "-X" || token === "--request") {
                if (next) {
                    method = next.toUpperCase();
                    i += 2;
                    continue;
                }
            } else if (token.startsWith("-X") && token.length > 2) {
                method = token.substring(2).toUpperCase();
                i++;
                continue;
            } else if (token === "-H" || token === "--header") {
                if (next) {
                    parseHeaderPair(next, headers);
                    i += 2;
                    continue;
                }
            } else if (token.startsWith("-H") && token.length > 2) {
                parseHeaderPair(token.substring(2), headers);
                i++;
                continue;
            } else if (
                token === "-d" ||
                token === "--data" ||
                token === "--data-raw" ||
                token === "--data-binary" ||
                token === "--data-ascii"
            ) {
                if (next) {
                    body = body ? body + "&" + next : next;
                    if (!method) method = "POST";
                    i += 2;
                    continue;
                }
            } else if (token === "--data-urlencode") {
                if (next) {
                    body = body ? body + "&" + encodeURIComponent(next) : encodeURIComponent(next);
                    if (!method) method = "POST";
                    i += 2;
                    continue;
                }
            } else if (token.startsWith("-d") && token.length > 2) {
                const val = token.substring(2);
                body = body ? body + "&" + val : val;
                if (!method) method = "POST";
                i++;
                continue;
            } else if (token === "-u" || token === "--user") {
                if (next) {
                    try {
                        const b64 = btoa(next);
                        headers["authorization"] = `Basic ${b64}`;
                    } catch {}
                    i += 2;
                    continue;
                }
            } else if (token === "-b" || token === "--cookie") {
                if (next) {
                    headers["cookie"] = next;
                    i += 2;
                    continue;
                }
            } else if (token === "-A" || token === "--user-agent") {
                if (next) {
                    headers["user-agent"] = next;
                    i += 2;
                    continue;
                }
            } else if (token === "--oauth2-bearer") {
                if (next) {
                    authHeader = "Bearer " + next;
                    headers["authorization"] = authHeader;
                    i += 2;
                    continue;
                }
            } else if (
                token === "-k" || token === "--insecure" ||
                token === "-s" || token === "--silent" ||
                token === "-S" || token === "--show-error" ||
                token === "-v" || token === "--verbose" ||
                token === "-L" || token === "--location" ||
                token === "--compressed"
            ) {
                // Flags with no arguments that we safely ignore
                i++;
                continue;
            } else if (!token.startsWith("-") && !rawUrl) {
                rawUrl = token;
                i++;
                continue;
            }

            i++;
        }

        if (!rawUrl) return null;

        // Default method fallback
        if (!method) {
            method = body ? "POST" : "GET";
        }

        // Parse URL components
        let pathname = "";
        try {
            // Handle relative URLs or absolute URLs
            const parsedUrl = new URL(rawUrl, "http://localhost");
            pathname = parsedUrl.pathname;
            parsedUrl.searchParams.forEach((val, key) => {
                queryParams[key] = val;
            });
        } catch {
            // Fallback manual URL parsing
            const qIdx = rawUrl.indexOf("?");
            if (qIdx !== -1) {
                pathname = rawUrl.substring(0, qIdx);
                const qStr = rawUrl.substring(qIdx + 1);
                const pairs = qStr.split("&");
                for (const p of pairs) {
                    const [k, v] = p.split("=");
                    if (k) queryParams[decodeURIComponent(k)] = v !== undefined ? decodeURIComponent(v) : "";
                }
            } else {
                pathname = rawUrl;
            }
            // Strip domain if present
            pathname = pathname.replace(/^https?:\/\/[^/]+/i, "");
        }

        // Ensure leading slash
        if (!pathname.startsWith("/")) pathname = "/" + pathname;

        // Extract authorization token if present
        for (const [k, v] of Object.entries(headers)) {
            if (k.toLowerCase() === "authorization") {
                authHeader = v;
                break;
            }
        }

        return {
            method: method.toUpperCase(),
            rawUrl: rawUrl,
            pathname: pathname,
            queryParams: queryParams,
            headers: headers,
            body: body,
            authHeader: authHeader
        };
    }

    function parseHeaderPair(headerString, targetHeaders) {
        if (!headerString || typeof headerString !== "string") return;
        const colonIdx = headerString.indexOf(":");
        if (colonIdx !== -1) {
            const key = headerString.substring(0, colonIdx).trim().toLowerCase();
            let val = headerString.substring(colonIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.substring(1, val.length - 1).trim();
            }
            targetHeaders[key] = val;
        }
    }

    function maskAuthToken(tokenString) {
        if (!tokenString) return "";
        const parts = tokenString.trim().split(" ");
        const scheme = parts.length > 1 ? parts[0] : "Bearer";
        const token = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];

        if (token.length <= 16) {
            return `${scheme} ****`;
        }
        const start = token.substring(0, 8);
        const end = token.substring(token.length - 4);
        return `${scheme} ${start}...${end}`;
    }

    // =========================================================================
    // 4. OPENAPI PATH MATCHER & SPEC RESOLVER
    // =========================================================================
    /**
     * Retrieves the loaded OpenAPI specification from Swagger UI's Redux state.
     * @returns {Object|null}
     */
    function getOpenApiSpec() {
        if (!window.ui) return null;
        try {
            if (typeof window.ui.getState === "function") {
                const specState = window.ui.getState().get("spec");
                if (specState) {
                    const jsonSpec = specState.get("json") || specState.get("spec");
                    if (jsonSpec) {
                        return typeof jsonSpec.toJS === "function" ? jsonSpec.toJS() : jsonSpec;
                    }
                }
            }
            if (window.ui.specSelectors && typeof window.ui.specSelectors.specJson === "function") {
                const spec = window.ui.specSelectors.specJson();
                if (spec) {
                    return typeof spec.toJS === "function" ? spec.toJS() : spec;
                }
            }
        } catch (e) {
            console.warn("[SwaggerCurlImporter] Could not read OpenAPI spec from Redux state:", e);
        }
        return null;
    }

    /**
     * Converts an OpenAPI templated path (/users/{id}/orders/{orderId}) into
     * a RegExp and list of parameter names.
     * @param {string} openApiPath
     * @returns {{ regex: RegExp, paramNames: string[] }}
     */
    function pathToRegex(openApiPath) {
        const paramNames = [];
        const pattern = openApiPath.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => {
            paramNames.push(name);
            return "([^/?#]+)";
        });
        return {
            regex: new RegExp(`^${pattern}$`, "i"),
            paramNames
        };
    }

    /**
     * Matches the parsed cURL request against OpenAPI spec operations.
     * Returns matching operation details and extracted path parameters.
     * @param {Object} parsedCurl
     * @returns {Object|null}
     */
    function matchOperation(parsedCurl) {
        const spec = getOpenApiSpec();
        const curlPath = parsedCurl.pathname;
        const curlMethod = parsedCurl.method.toLowerCase();

        // 1. Spec-based matching (Accurate)
        if (spec && spec.paths) {
            const basePath = (spec.basePath || "").replace(/\/$/, "");
            const servers = Array.isArray(spec.servers) ? spec.servers : [];
            const serverPrefixes = servers.map(s => {
                try { return new URL(s.url, "http://localhost").pathname.replace(/\/$/, ""); } catch { return ""; }
            }).filter(Boolean);

            if (basePath) serverPrefixes.push(basePath);

            for (const [specPath, pathItem] of Object.entries(spec.paths)) {
                if (!pathItem || typeof pathItem !== "object") continue;
                const op = pathItem[curlMethod];
                if (!op) continue;

                // Match with or without server prefixes
                const candidatePaths = [specPath];
                for (const prefix of serverPrefixes) {
                    if (prefix && prefix !== "/") {
                        candidatePaths.push(prefix + specPath);
                    }
                }

                for (const candidate of candidatePaths) {
                    const { regex, paramNames } = pathToRegex(candidate);
                    const match = curlPath.match(regex);
                    if (match) {
                        const extractedPathParams = {};
                        paramNames.forEach((name, idx) => {
                            extractedPathParams[name] = decodeURIComponent(match[idx + 1] || "");
                        });

                        return {
                            specPath: specPath,
                            candidatePath: candidate,
                            method: curlMethod,
                            operation: op,
                            tag: (op && Array.isArray(op.tags) && op.tags[0]) || "",
                            operationId: (op && op.operationId) || "",
                            pathParams: extractedPathParams
                        };
                    }
                }
            }
        }

        // 2. DOM-based Fallback Matching (if spec is unavailable)
        const opblocks = document.querySelectorAll(".swagger-ui .opblock, .opblock");
        for (const opblock of opblocks) {
            const methodEl = opblock.querySelector(".opblock-summary-method");
            const pathEl = opblock.querySelector(".opblock-summary-path");
            if (!methodEl || !pathEl) continue;

            const domMethod = methodEl.textContent.trim().toLowerCase();
            const domPath = cleanZeroWidth(pathEl.getAttribute("data-path") || pathEl.textContent);

            if (domMethod === curlMethod) {
                const { regex, paramNames } = pathToRegex(domPath);
                const match = curlPath.match(regex);
                if (match) {
                    const extractedPathParams = {};
                    paramNames.forEach((name, idx) => {
                        extractedPathParams[name] = decodeURIComponent(match[idx + 1] || "");
                    });

                    const tagHeader = opblock.closest(".opblock-tag-section")?.querySelector(".opblock-tag");
                    const domTag = tagHeader ? cleanZeroWidth(tagHeader.getAttribute("data-tag") || tagHeader.textContent) : "";

                    return {
                        specPath: domPath,
                        candidatePath: domPath,
                        method: domMethod,
                        operation: null,
                        tag: domTag,
                        operationId: "",
                        pathParams: extractedPathParams
                    };
                }
            }
        }

        return null;
    }

    // =========================================================================
    // 5. DOM INTERACTION & PRE-FILLER ENGINE
    // =========================================================================
    /**
     * Cleans zero-width space characters (\u200B) injected internally by Swagger UI.
     * @param {string} str
     * @returns {string}
     */
    function cleanZeroWidth(str) {
        if (!str || typeof str !== "string") return "";
        return str.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    }

    /**
     * Finds parent controller/tag DOM element in Swagger UI.
     * @param {string} tag
     * @returns {HTMLElement|null}
     */
    function findTagSection(tag) {
        if (!tag) return null;
        const normalizedTargetTag = cleanZeroWidth(tag).toLowerCase();

        const byId = document.getElementById(`operations-tag-${tag}`);
        if (byId) return byId.closest(".opblock-tag-section") || byId;

        const byData = document.querySelector(`.opblock-tag-section [data-tag="${tag}"]`);
        if (byData) return byData.closest(".opblock-tag-section") || byData;

        const sections = document.querySelectorAll(".swagger-ui .opblock-tag-section, .opblock-tag-section");
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
     * Ensures the controller/tag section is open.
     * @param {HTMLElement} tagSection
     * @returns {boolean} True if clicked to open, False if already open
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
     * Locates the endpoint .opblock element in DOM via ID or method + path scan.
     */
    function findOpblockElement(method, specPath, operationId = "") {
        const normMethod = (method || "").toLowerCase().trim();
        const normPath = cleanZeroWidth(specPath).toLowerCase().trim();

        if (operationId) {
            const byOpId = document.querySelector(`[id*="-${operationId}"]`);
            if (byOpId && byOpId.classList.contains("opblock")) return byOpId;
        }

        const opblocks = document.querySelectorAll(".swagger-ui .opblock, .opblock");
        for (const block of opblocks) {
            const methodEl = block.querySelector(".opblock-summary-method");
            const pathEl = block.querySelector(".opblock-summary-path");
            if (!methodEl || !pathEl) continue;

            const m = methodEl.textContent.trim().toLowerCase();
            const p = cleanZeroWidth(pathEl.getAttribute("data-path") || pathEl.textContent).toLowerCase().trim();

            if (m === normMethod && (p === normPath || p.endsWith(normPath) || normPath.endsWith(p))) {
                return block;
            }
        }
        return null;
    }

    /**
     * Ensures endpoint (.opblock) is expanded by clicking .opblock-summary-control.
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
     * Pre-fills a React-controlled HTML input or textarea element,
     * dispatching standard events so React state captures the new value.
     */
    function setReactInputValue(element, value) {
        if (!element) return;
        const proto = element instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;

        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        if (descriptor && descriptor.set) {
            descriptor.set.call(element, value);
        } else {
            element.value = value;
        }

        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    /**
     * Expands and pre-fills the matched Swagger UI operation block with robust asynchronous polling.
     * @param {Object} matchInfo
     * @param {Object} parsedCurl
     * @param {Object} options
     * @returns {boolean} True if successfully initiated
     */
    function populateSwaggerOperation(matchInfo, parsedCurl, options = {}) {
        const { method, specPath, tag, operationId, pathParams } = matchInfo;
        const { queryParams, headers, body, authHeader } = parsedCurl;
        const autoExecute = Boolean(options.autoExecute);
        const syncAuth = Boolean(options.syncAuth);

        // 1. Expand parent Tag Section if collapsed
        let didOpenTag = false;
        if (tag) {
            const tagSection = findTagSection(tag);
            if (tagSection) {
                didOpenTag = ensureTagSectionOpen(tagSection);
            }
        }

        // 2. Poll for the .opblock to appear in DOM (especially if tag was just unfolded)
        let opblockAttempts = 0;
        const maxOpblockAttempts = didOpenTag ? 30 : 15;

        const pollOpblock = setInterval(() => {
            opblockAttempts++;
            const targetOpblock = findOpblockElement(method, specPath, operationId);

            if (!targetOpblock && opblockAttempts >= 6 && !didOpenTag) {
                // If not found, try unfolding all closed tags as fallback
                const collapsedTags = document.querySelectorAll(".swagger-ui .opblock-tag-section:not(.is-open)");
                if (collapsedTags.length > 0) {
                    collapsedTags.forEach(sec => ensureTagSectionOpen(sec));
                    didOpenTag = true;
                }
            }

            if (targetOpblock) {
                clearInterval(pollOpblock);
                proceedWithOpblock(targetOpblock);
            } else if (opblockAttempts >= maxOpblockAttempts) {
                clearInterval(pollOpblock);
                console.warn(`[SwaggerCurlImporter] Could not locate DOM block for ${method.toUpperCase()} ${specPath}`);
            }
        }, 40);

        function proceedWithOpblock(targetOpblock) {
            // 3. Expand the opblock if collapsed
            ensureOpblockOpen(targetOpblock);

            // 4. Smooth scroll and glow highlight
            setTimeout(() => {
                const headerElement = targetOpblock.querySelector(".opblock-summary") || targetOpblock;
                headerElement.scrollIntoView({ behavior: "smooth", block: "center" });

                if (CONFIG.ENABLE_GLOW) {
                    targetOpblock.classList.add("swp-curl-highlight-glow");
                    setTimeout(() => {
                        targetOpblock.classList.remove("swp-curl-highlight-glow");
                    }, CONFIG.GLOW_DURATION_MS);
                }
            }, 60);

            // 5. Poll for "Try it out" button and click it
            let tryOutAttempts = 0;
            const pollTryOut = setInterval(() => {
                tryOutAttempts++;
                const tryOutBtn = targetOpblock.querySelector(".btn.try-out__btn");

                if (tryOutBtn) {
                    clearInterval(pollTryOut);
                    const isTryActive = tryOutBtn.classList.contains("cancel") ||
                                        tryOutBtn.textContent.toLowerCase().includes("cancel");
                    if (!isTryActive) {
                        tryOutBtn.click();
                    }
                    // Wait for React to render input fields and body textarea
                    pollAndFillInputs(targetOpblock);
                } else if (tryOutAttempts >= 25) {
                    clearInterval(pollTryOut);
                    pollAndFillInputs(targetOpblock);
                }
            }, 40);
        }

        function pollAndFillInputs(targetOpblock) {
            let fillAttempts = 0;
            const pollInputs = setInterval(() => {
                fillAttempts++;
                const hasInputs = targetOpblock.querySelector(".parameters, .body-param, textarea, input:not([type='file'])");

                if (hasInputs || fillAttempts >= 25) {
                    clearInterval(pollInputs);

                    // 6. Populate Parameters (Path, Query, Header)
                    const paramRows = targetOpblock.querySelectorAll(".parameters tr[data-param-name]");
                    paramRows.forEach(row => {
                        const rawParamName = row.getAttribute("data-param-name");
                        const paramName = cleanZeroWidth(rawParamName);
                        const input = row.querySelector("input:not([type='file']), select, textarea");
                        if (!input || !paramName) return;

                        if (pathParams[paramName] !== undefined) {
                            setReactInputValue(input, pathParams[paramName]);
                        } else if (queryParams[paramName] !== undefined) {
                            setReactInputValue(input, queryParams[paramName]);
                        } else if (headers[paramName.toLowerCase()] !== undefined) {
                            setReactInputValue(input, headers[paramName.toLowerCase()]);
                        }
                    });

                    // 7. Populate Request Body Textarea
                    if (body) {
                        const bodyTextarea = targetOpblock.querySelector("textarea.body-param__text, .body-param textarea, textarea");
                        if (bodyTextarea) {
                            let formattedBody = body;
                            try {
                                const parsedJson = JSON.parse(body);
                                formattedBody = JSON.stringify(parsedJson, null, 2);
                            } catch {}
                            setReactInputValue(bodyTextarea, formattedBody);
                        }
                    }

                    // 8. Synchronize Global Authorization if opted-in
                    if (syncAuth && authHeader && window.ui && typeof window.ui.authActions?.authorize === "function") {
                        trySyncAuthorization(authHeader);
                    }

                    // 9. Auto-Execute if opted-in
                    if (autoExecute) {
                        setTimeout(() => {
                            const executeBtn = targetOpblock.querySelector(".btn.execute");
                            if (executeBtn) {
                                executeBtn.click();
                            }
                        }, 250);
                    }
                }
            }, 40);
        }

        return true;
    }

    /**
     * Resolves security definitions from OpenAPI spec and Swagger UI Redux state.
     * @returns {Object}
     */
    function getSecurityDefinitions() {
        const definitions = {};
        try {
            const spec = getOpenApiSpec();
            const fromSpec = spec?.components?.securitySchemes || spec?.securityDefinitions;
            if (fromSpec && typeof fromSpec === "object") {
                Object.assign(definitions, fromSpec);
            }
            if (window.ui?.specSelectors?.securityDefinitions) {
                const sd = window.ui.specSelectors.securityDefinitions();
                const jsSd = sd && typeof sd.toJS === "function" ? sd.toJS() : sd;
                if (jsSd && typeof jsSd === "object") {
                    Object.assign(definitions, jsSd);
                }
            }
            if (window.ui?.authSelectors?.definitions) {
                const ad = window.ui.authSelectors.definitions();
                const jsAd = ad && typeof ad.toJS === "function" ? ad.toJS() : ad;
                if (jsAd && typeof jsAd === "object") {
                    Object.assign(definitions, jsAd);
                }
            }
        } catch (e) {
            console.warn("[SwaggerCurlImporter] Error reading security definitions:", e);
        }
        return definitions;
    }

    /**
     * Safely updates Swagger UI's internal Authorize state and synchronized plugins.
     * @param {string} authHeaderValue
     */
    function trySyncAuthorization(authHeaderValue) {
        if (!authHeaderValue || !window.ui || typeof window.ui.authActions?.authorize !== "function") return;
        try {
            let raw = authHeaderValue.trim();
            if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
                raw = raw.substring(1, raw.length - 1).trim();
            }

            let token = raw;
            if (/^bearer\s+/i.test(raw)) {
                token = raw.replace(/^bearer\s+/i, "").trim();
            }
            if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
                token = token.substring(1, token.length - 1).trim();
            }

            if (!token) return;

            const definitions = getSecurityDefinitions();
            const authPayload = {};

            // 1. Authorize all detected schemes in definitions (Bearer, ApiKey, JWT)
            for (const [schemeKey, schemeData] of Object.entries(definitions)) {
                const type = (schemeData?.type || "").toLowerCase();
                const scheme = (schemeData?.scheme || "").toLowerCase();
                const inWhere = (schemeData?.in || "").toLowerCase();
                const paramName = (schemeData?.name || "").toLowerCase();

                const isHttpBearer = (type === "http" && scheme === "bearer");
                const isApiKey = (type === "apikey" && (inWhere === "header" || !inWhere));
                const isLikelyToken = schemeKey.toLowerCase().includes("bearer") ||
                                      schemeKey.toLowerCase().includes("token") ||
                                      schemeKey.toLowerCase().includes("jwt") ||
                                      paramName === "authorization";

                if (isHttpBearer || isApiKey || isLikelyToken) {
                    authPayload[schemeKey] = {
                        name: schemeKey,
                        schema: schemeData || {
                            type: "http",
                            scheme: "bearer",
                            bearerFormat: "JWT"
                        },
                        value: isHttpBearer ? token : (raw.toLowerCase().startsWith("bearer ") ? raw : token)
                    };
                }
            }

            // 2. Guarantee standard schemes ("Bearer", "BearerAuth") and user-configured scheme are authorized
            const appScheme = userConfig.appSchemeName ||
                              window.SwaggerTokenInterceptorConfig?.appSchemeName ||
                              window.SwaggerJwtInspectorConfig?.appSchemeName ||
                              "Bearer";

            const standardSchemes = [appScheme, "Bearer", "BearerAuth"];
            standardSchemes.forEach((name) => {
                if (!authPayload[name]) {
                    authPayload[name] = {
                        name: name,
                        schema: {
                            type: "http",
                            scheme: "bearer",
                            bearerFormat: "JWT"
                        },
                        value: token
                    };
                }
            });

            // 3. Dispatch to Swagger UI Redux store
            window.ui.authActions.authorize(authPayload);

            // 4. Optionally sync token to configured localStorage keys for companion plugins
            const storageKey = window.SwaggerTokenInterceptorConfig?.storageKey;
            if (storageKey) {
                try { localStorage.setItem(storageKey, token); } catch {}
            }
            const fallbackKeys = window.SwaggerJwtInspectorConfig?.tokenStorageKeys;
            if (Array.isArray(fallbackKeys)) {
                fallbackKeys.forEach((k) => {
                    try { localStorage.setItem(k, token); } catch {}
                });
            }

            console.log("[SwaggerCurlImporter] Sincronizzazione autorizzazione completata:", Object.keys(authPayload));
        } catch (e) {
            console.warn("[SwaggerCurlImporter] Could not sync authorization:", e);
        }
    }

    // =========================================================================
    // 6. UI MODAL & USER EXPERIENCE
    // =========================================================================
    function injectStyles() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.STYLES)) return;

        const style = document.createElement("style");
        style.id = CONFIG.ELEMENT_IDS.STYLES;
        style.textContent = `
            /* Theme Variables */
            .swp-curl-overlay {
                --swp-curl-bg: #ffffff;
                --swp-curl-sidebar-bg: #f8fafc;
                --swp-curl-border: #cbd5e1;
                --swp-curl-border-light: #e2e8f0;
                --swp-curl-text: #0f172a;
                --swp-curl-text-muted: #64748b;
                --swp-curl-primary: #0284c7;
                --swp-curl-primary-hover: #0369a1;
                --swp-curl-input-bg: #ffffff;
                --swp-curl-code-bg: #0f172a;
                --swp-curl-code-text: #f8fafc;
                --swp-curl-warn-bg: #fffbeb;
                --swp-curl-warn-border: #fde68a;
                --swp-curl-warn-text: #92400e;
            }

            html.dark-mode .swp-curl-overlay,
            body.dark-mode .swp-curl-overlay,
            .dark-mode .swp-curl-overlay,
            [data-theme="dark"] .swp-curl-overlay {
                --swp-curl-bg: #181818;
                --swp-curl-sidebar-bg: #202020;
                --swp-curl-border: #383838;
                --swp-curl-border-light: #2d2d2d;
                --swp-curl-text: #f5f5f5;
                --swp-curl-text-muted: #94a3b8;
                --swp-curl-primary: #38bdf8;
                --swp-curl-primary-hover: #7dd3fc;
                --swp-curl-input-bg: #222222;
                --swp-curl-code-bg: #111111;
                --swp-curl-code-text: #f1f5f9;
                --swp-curl-warn-bg: #2d2210;
                --swp-curl-warn-border: #4d3810;
                --swp-curl-warn-text: #fde047;
            }

            /* Overlay Backdrop */
            .swp-curl-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(15, 23, 42, 0.75);
                backdrop-filter: blur(4px);
                z-index: 100060;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                animation: swpCurlFadeIn 0.15s ease-out;
            }
            @keyframes swpCurlFadeIn {
                from { opacity: 0; transform: scale(0.98); }
                to { opacity: 1; transform: scale(1); }
            }

            /* Modal Window */
            .swp-curl-window {
                width: 720px;
                max-width: 95vw;
                background-color: var(--swp-curl-bg, #ffffff) !important;
                color: var(--swp-curl-text, #0f172a) !important;
                border: 1px solid var(--swp-curl-border, #cbd5e1) !important;
                border-radius: 10px;
                box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }

            .swp-curl-header {
                padding: 14px 18px;
                border-bottom: 1px solid var(--swp-curl-border);
                background: var(--swp-curl-sidebar-bg);
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-shrink: 0;
            }

            .swp-curl-body {
                padding: 18px;
                display: flex;
                flex-direction: column;
                gap: 14px;
                max-height: 80vh;
                overflow-y: auto;
                background: var(--swp-curl-bg);
            }

            .swp-curl-textarea {
                width: 100%;
                height: 180px;
                padding: 12px;
                border-radius: 6px;
                border: 1px solid var(--swp-curl-border);
                background: var(--swp-curl-input-bg);
                color: var(--swp-curl-text);
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
                font-size: 12px;
                line-height: 1.45;
                box-sizing: border-box;
                resize: vertical;
                outline: none;
                transition: border-color 0.15s, box-shadow 0.15s;
            }
            .swp-curl-textarea:focus {
                border-color: var(--swp-curl-primary);
                box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
            }

            /* Preview Info Bar */
            .swp-curl-preview {
                padding: 10px 14px;
                border-radius: 6px;
                background: var(--swp-curl-sidebar-bg);
                border: 1px solid var(--swp-curl-border-light);
                font-size: 12px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .swp-curl-badge-method {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 4px;
                font-weight: 700;
                font-size: 11px;
                color: #ffffff;
                text-transform: uppercase;
            }
            .swp-curl-badge-get { background: #0ea5e9; }
            .swp-curl-badge-post { background: #22c55e; }
            .swp-curl-badge-put { background: #f59e0b; }
            .swp-curl-badge-delete { background: #ef4444; }
            .swp-curl-badge-patch { background: #8b5cf6; }

            .swp-curl-warn-box {
                padding: 8px 12px;
                border-radius: 6px;
                background: var(--swp-curl-warn-bg);
                border: 1px solid var(--swp-curl-warn-border);
                color: var(--swp-curl-warn-text);
                font-size: 11px;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .swp-curl-checkbox-label {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                font-size: 12px;
                cursor: pointer;
                user-select: none;
            }
            .swp-curl-checkbox-label input[type="checkbox"] {
                margin-top: 2px;
                accent-color: var(--swp-curl-primary);
                cursor: pointer;
            }

            .swp-curl-footer {
                padding: 12px 18px;
                border-top: 1px solid var(--swp-curl-border);
                background: var(--swp-curl-sidebar-bg);
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-shrink: 0;
            }

            .swp-curl-btn {
                padding: 7px 14px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                border: 1px solid var(--swp-curl-border);
                background: var(--swp-curl-bg);
                color: var(--swp-curl-text);
                transition: all 0.15s;
            }
            .swp-curl-btn:hover {
                border-color: var(--swp-curl-primary);
            }

            .swp-curl-btn-primary {
                background: var(--swp-curl-primary);
                color: #ffffff;
                border-color: var(--swp-curl-primary);
            }
            .swp-curl-btn-primary:hover {
                background: var(--swp-curl-primary-hover);
                border-color: var(--swp-curl-primary-hover);
            }

            .swp-curl-close-btn {
                background: transparent;
                border: none;
                color: var(--swp-curl-text-muted);
                cursor: pointer;
                font-size: 16px;
                line-height: 1;
                padding: 4px;
                border-radius: 4px;
            }
            .swp-curl-close-btn:hover {
                color: var(--swp-curl-text);
                background: var(--swp-curl-border-light);
            }

            /* Animated Glow for Target Endpoint */
            .swp-curl-highlight-glow {
                animation: swpCurlGlow ${CONFIG.GLOW_DURATION_MS}ms ease-out !important;
                border-radius: 6px;
            }
            @keyframes swpCurlGlow {
                0% {
                    box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.7);
                    transform: scale(1.01);
                }
                50% {
                    box-shadow: 0 0 0 8px rgba(2, 132, 199, 0.35);
                    transform: scale(1.01);
                }
                100% {
                    box-shadow: 0 0 0 0 rgba(2, 132, 199, 0);
                    transform: scale(1);
                }
            }

            /* Fallback Import Button (Only when Activity Bar is absent) */
            #${CONFIG.ELEMENT_IDS.TOPBAR_BTN} {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 14px;
                font-size: 13px;
                font-weight: 600;
                line-height: 1.2;
                background: #0284c7;
                color: #ffffff;
                border: 1px solid #0284c7;
                border-radius: 4px;
                cursor: pointer;
                margin: 4px 8px;
                transition: background 0.15s, border-color 0.15s, transform 0.1s;
                vertical-align: middle;
            }
            #${CONFIG.ELEMENT_IDS.TOPBAR_BTN}:hover {
                background: #0369a1;
                border-color: #0369a1;
            }
            #${CONFIG.ELEMENT_IDS.TOPBAR_BTN}:active {
                transform: scale(0.97);
            }
            html.dark-mode #${CONFIG.ELEMENT_IDS.TOPBAR_BTN},
            body.dark-mode #${CONFIG.ELEMENT_IDS.TOPBAR_BTN},
            .dark-mode #${CONFIG.ELEMENT_IDS.TOPBAR_BTN},
            [data-theme="dark"] #${CONFIG.ELEMENT_IDS.TOPBAR_BTN} {
                background: #0284c7;
                border-color: #38bdf8;
                color: #ffffff;
            }
        `;
        document.head.appendChild(style);
    }

    let lastSyncAuthChoice = CONFIG.DEFAULT_SYNC_AUTH;
    let lastAutoExecChoice = CONFIG.DEFAULT_AUTO_EXECUTE;

    function openCurlImporterModal() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.MODAL)) return;
        injectStyles();

        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.setItemActive === "function") {
            window.SwaggerActivityBar.setItemActive(CONFIG.PLUGIN_ID, true);
        }

        const overlay = document.createElement("div");
        overlay.id = CONFIG.ELEMENT_IDS.MODAL;
        overlay.className = "swp-curl-overlay";

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeCurlImporterModal();
        });

        const escHandler = (e) => {
            if (e.key === "Escape") {
                closeCurlImporterModal();
                window.removeEventListener("keydown", escHandler);
            }
        };
        window.addEventListener("keydown", escHandler);

        overlay.innerHTML = `
            <div class="swp-curl-window">
                <div class="swp-curl-header">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--swp-curl-primary);">
                            <polyline points="4 17 10 11 4 5"></polyline>
                            <line x1="12" y1="19" x2="20" y2="19"></line>
                        </svg>
                        <div>
                            <strong style="font-size:14px;color:var(--swp-curl-text);">${escapeHtml(t("modalTitle"))}</strong>
                            <div style="font-size:11px;color:var(--swp-curl-text-muted);">${escapeHtml(t("modalSubtitle"))}</div>
                        </div>
                    </div>
                    <button type="button" class="swp-curl-close-btn" id="swp-curl-btn-close" aria-label="Close">✕</button>
                </div>
                <div class="swp-curl-body">
                    <textarea class="swp-curl-textarea" id="swp-curl-input" placeholder="${escapeHtml(t("textareaPlaceholder"))}" autofocus></textarea>

                    <div id="swp-curl-preview-container" style="display:none;"></div>

                    <div style="display:flex;flex-direction:column;gap:8px;padding-top:4px;">
                        <label class="swp-curl-checkbox-label">
                            <input type="checkbox" id="swp-curl-chk-sync-auth" ${lastSyncAuthChoice ? "checked" : ""}>
                            <div>
                                <strong style="color:var(--swp-curl-text);">${escapeHtml(t("syncAuthLabel"))}</strong>
                                <div style="font-size:11px;color:var(--swp-curl-text-muted);">${escapeHtml(t("syncAuthHelp"))}</div>
                            </div>
                        </label>
                        <label class="swp-curl-checkbox-label">
                            <input type="checkbox" id="swp-curl-chk-auto-exec" ${lastAutoExecChoice ? "checked" : ""}>
                            <div>
                                <strong style="color:var(--swp-curl-text);">${escapeHtml(t("autoExecuteLabel"))}</strong>
                                <div style="font-size:11px;color:var(--swp-curl-text-muted);">${escapeHtml(t("autoExecuteHelp"))}</div>
                            </div>
                        </label>
                    </div>

                    <div id="swp-curl-error-box" style="display:none;padding:8px 12px;border-radius:6px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-size:12px;"></div>
                </div>
                <div class="swp-curl-footer">
                    <button type="button" class="swp-curl-btn" id="swp-curl-btn-cancel">${escapeHtml(t("btnCancel"))}</button>
                    <div style="display:flex;gap:8px;">
                        <button type="button" class="swp-curl-btn swp-curl-btn-primary" id="swp-curl-btn-import">${escapeHtml(t("btnImport"))}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const textarea = overlay.querySelector("#swp-curl-input");
        const previewContainer = overlay.querySelector("#swp-curl-preview-container");
        const errorBox = overlay.querySelector("#swp-curl-error-box");
        const importBtn = overlay.querySelector("#swp-curl-btn-import");
        const cancelBtn = overlay.querySelector("#swp-curl-btn-cancel");
        const closeBtn = overlay.querySelector("#swp-curl-btn-close");
        const chkSyncAuth = overlay.querySelector("#swp-curl-chk-sync-auth");
        const chkAutoExec = overlay.querySelector("#swp-curl-chk-auto-exec");

        closeBtn?.addEventListener("click", closeCurlImporterModal);
        cancelBtn?.addEventListener("click", closeCurlImporterModal);

        chkSyncAuth?.addEventListener("change", () => {
            lastSyncAuthChoice = chkSyncAuth.checked;
        });
        chkAutoExec?.addEventListener("change", () => {
            lastAutoExecChoice = chkAutoExec.checked;
        });

        // Real-time parsed preview on input
        textarea?.addEventListener("input", () => {
            errorBox.style.display = "none";
            const val = textarea.value.trim();
            if (!val) {
                previewContainer.style.display = "none";
                return;
            }

            const parsed = parseCurlCommand(val);
            if (!parsed) {
                previewContainer.style.display = "none";
                return;
            }

            const methodClass = `swp-curl-badge-${parsed.method.toLowerCase()}`;
            const queryCount = Object.keys(parsed.queryParams).length;
            const headerCount = Object.keys(parsed.headers).length;

            let authNoticeHtml = "";
            if (parsed.authHeader) {
                const masked = CONFIG.MASK_TOKEN_IN_PREVIEW ? maskAuthToken(parsed.authHeader) : parsed.authHeader;
                authNoticeHtml = `
                    <div class="swp-curl-warn-box">
                        <span>🔒</span>
                        <div>
                            <div>${escapeHtml(t("tokenDetectedWarning"))}</div>
                            <strong style="font-family:monospace;font-size:11px;">${escapeHtml(masked)}</strong>
                        </div>
                    </div>
                `;
            }

            previewContainer.innerHTML = `
                <div class="swp-curl-preview">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span class="swp-curl-badge-method ${methodClass}">${escapeHtml(parsed.method)}</span>
                        <strong style="font-family:monospace;font-size:12px;color:var(--swp-curl-text);">${escapeHtml(parsed.pathname)}</strong>
                        <span style="color:var(--swp-curl-text-muted);font-size:11px;">(${t("paramsCount").replace("{count}", queryCount)}, ${t("headersCount").replace("{count}", headerCount)}${parsed.body ? ", " + t("hasBody") : ""})</span>
                    </div>
                    ${authNoticeHtml}
                </div>
            `;
            previewContainer.style.display = "block";
        });

        // Submit action
        const doImport = () => {
            const rawVal = textarea.value.trim();
            if (!rawVal) {
                showError(t("errEmptyInput"));
                return;
            }

            const parsed = parseCurlCommand(rawVal);
            if (!parsed) {
                showError(t("errInvalidCurl"));
                return;
            }

            const matched = matchOperation(parsed);
            if (!matched) {
                showError(t("errNoMatch").replace("{method}", parsed.method).replace("{path}", parsed.pathname));
                return;
            }

            const shouldSyncAuth = Boolean(chkSyncAuth?.checked);
            const shouldAutoExec = Boolean(chkAutoExec?.checked);

            // Synchronize authorization immediately with Swagger UI and companion plugins
            if (shouldSyncAuth && parsed.authHeader) {
                trySyncAuthorization(parsed.authHeader);
            }

            const success = populateSwaggerOperation(matched, parsed, {
                autoExecute: shouldAutoExec,
                syncAuth: shouldSyncAuth
            });

            if (success) {
                closeCurlImporterModal();
            } else {
                showError(t("errNoMatch").replace("{method}", parsed.method).replace("{path}", parsed.pathname));
            }
        };

        importBtn?.addEventListener("click", doImport);

        textarea?.addEventListener("keydown", (e) => {
            if (CONFIG.SHORTCUTS.SUBMIT_ON_ENTER && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                doImport();
            }
        });

        function showError(msg) {
            errorBox.textContent = msg;
            errorBox.style.display = "block";
        }

        setTimeout(() => textarea?.focus(), 60);
    }

    function closeCurlImporterModal() {
        const modal = document.getElementById(CONFIG.ELEMENT_IDS.MODAL);
        if (modal) modal.remove();
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.setItemActive === "function") {
            window.SwaggerActivityBar.setItemActive(CONFIG.PLUGIN_ID, false);
        }
    }

    function toggleCurlImporterModal() {
        if (document.getElementById(CONFIG.ELEMENT_IDS.MODAL)) {
            closeCurlImporterModal();
        } else {
            openCurlImporterModal();
        }
    }

    // =========================================================================
    // 7. KEYBOARD SHORTCUTS & ACTIVITY BAR INTEGRATION
    // =========================================================================
    function setupKeyboardShortcuts() {
        window.addEventListener("keydown", (e) => {
            const isCtrlShift = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === CONFIG.SHORTCUTS.KEY;
            const isAlt = e.altKey && e.key.toLowerCase() === CONFIG.SHORTCUTS.KEY;

            let matched = false;
            if (CONFIG.SHORTCUTS.MODIFIER === "alt") matched = isAlt;
            else matched = isCtrlShift;

            if (matched) {
                // Ignore if currently typing inside an input/textarea unless it's our modal
                const tag = document.activeElement?.tagName?.toLowerCase();
                const isOurModal = document.activeElement?.closest(`#${CONFIG.ELEMENT_IDS.MODAL}`);
                if ((tag === "input" || tag === "textarea") && !isOurModal) {
                    return;
                }
                e.preventDefault();
                toggleCurlImporterModal();
            }
        });
    }

    function isActivityBarPresent() {
        return Boolean(
            (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerItem === "function") ||
            document.querySelector(".swp-activity-bar") ||
            document.getElementById(`activity-btn-${CONFIG.PLUGIN_ID}`)
        );
    }

    function registerActivityBarItem() {
        if (!CONFIG.ACTIVITY_BAR.ENABLED) return;
        if (!window.SwaggerActivityBar || typeof window.SwaggerActivityBar.registerItem !== "function") return;

        window.SwaggerActivityBar.registerItem({
            id: CONFIG.PLUGIN_ID,
            title: t("activityBarTitle"),
            iconHtml: `
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                </svg>
            `,
            section: "main",
            order: CONFIG.ACTIVITY_BAR.ORDER,
            ariaLabel: t("activityBarTitle"),
            onClick: () => {
                toggleCurlImporterModal();
            }
        });

        // Clean up fallback button if Activity Bar is active
        const fallbackBtn = document.getElementById(CONFIG.ELEMENT_IDS.TOPBAR_BTN);
        if (fallbackBtn) fallbackBtn.remove();
        const fallbackContainer = document.getElementById("swp-curl-fallback-container");
        if (fallbackContainer) fallbackContainer.remove();
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
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="4 17 10 11 4 5"></polyline>
                        <line x1="12" y1="19" x2="20" y2="19"></line>
                    </svg>
                `,
                shortcuts: [
                    { key: "Ctrl + Shift + I", desc: t("activityBarTitle") },
                    { key: "Ctrl + Enter", desc: "Submit cURL command in modal" },
                    { key: "Esc", desc: "Close modal" }
                ],
                manual: `
### ${CONFIG.PLUGIN_NAME} — Manual

1. **Open Modal**: Click the Terminal [ >_ ] icon in the Activity Bar or press \`Ctrl+Shift+I\` (or \`Cmd+Shift+I\` on macOS).
2. **Paste cURL**: Paste any command copied from browser DevTools, Postman, or terminal.
3. **Review Preview**: The parser previews detected HTTP Method, Path, parameter count, and masks authorization tokens.
4. **Options**:
   - **Sync Token**: Optional in-memory sync with Swagger's global Authorize dialog.
   - **Auto-Execute**: Automatically clicks 'Execute' upon populating the form.
5. **Import & Match**: Clicks through to the exact Swagger operation, sets 'Try it out', pre-fills inputs, and glows around the card.
                `.trim()
            });
        }
    }

    function tryInjectFallbackButton() {
        if (!CONFIG.TOPBAR_BUTTON.ENABLED) return;

        // If Activity Bar is present, do NOT inject fallback button and clean up any previously injected instance
        if (isActivityBarPresent()) {
            const existingBtn = document.getElementById(CONFIG.ELEMENT_IDS.TOPBAR_BTN);
            if (existingBtn) existingBtn.remove();
            const existingContainer = document.getElementById("swp-curl-fallback-container");
            if (existingContainer) existingContainer.remove();
            return;
        }

        if (document.getElementById(CONFIG.ELEMENT_IDS.TOPBAR_BTN)) return;

        const btn = document.createElement("button");
        btn.id = CONFIG.ELEMENT_IDS.TOPBAR_BTN;
        btn.type = "button";
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px;">
                <polyline points="4 17 10 11 4 5"></polyline>
                <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <span>${escapeHtml(t("topbarBtnText"))}</span>
        `;
        btn.addEventListener("click", toggleCurlImporterModal);

        // Preference 1: inside .scheme-container .schemes (aligned near Authorize and Search)
        const schemesWrapper = document.querySelector(".swagger-ui .scheme-container .schemes");
        if (schemesWrapper) {
            const authWrapper = schemesWrapper.querySelector(".auth-wrapper");
            if (authWrapper) {
                schemesWrapper.insertBefore(btn, authWrapper);
            } else {
                schemesWrapper.appendChild(btn);
            }
            return;
        }

        // Preference 2: below .information-container
        const infoContainer = document.querySelector(".swagger-ui .information-container");
        if (infoContainer && infoContainer.parentNode) {
            let container = document.getElementById("swp-curl-fallback-container");
            if (!container) {
                container = document.createElement("div");
                container.id = "swp-curl-fallback-container";
                container.style.cssText = "display:flex;justify-content:flex-end;max-width:1460px;margin:10px auto;padding:0 20px;";
                infoContainer.parentNode.insertBefore(container, infoContainer.nextSibling);
            }
            container.appendChild(btn);
            return;
        }

        // Preference 3: topbar
        const topbarWrapper = document.querySelector(".topbar .topbar-wrapper, .topbar");
        if (topbarWrapper) {
            topbarWrapper.appendChild(btn);
        }
    }

    // =========================================================================
    // 8. INITIALIZATION & PUBLIC API
    // =========================================================================
    function init() {
        injectStyles();
        setupKeyboardShortcuts();

        // Try registering with Activity Bar immediately and upon retry
        registerActivityBarItem();
        registerExtensionsGuide();
        tryInjectFallbackButton();

        window.addEventListener("swagger-activity-bar:ready", () => {
            registerActivityBarItem();
            const fallbackBtn = document.getElementById(CONFIG.ELEMENT_IDS.TOPBAR_BTN);
            if (fallbackBtn) fallbackBtn.remove();
        });

        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            registerActivityBarItem();
            registerExtensionsGuide();
            tryInjectFallbackButton();
            if (attempts > 12) clearInterval(interval);
        }, 800);
    }

    // Expose Global API for programmatic usage
    window.SwaggerCurlImporter = {
        openModal: openCurlImporterModal,
        closeModal: closeCurlImporterModal,
        toggleModal: toggleCurlImporterModal,
        parseCurl: parseCurlCommand,
        matchOperation: matchOperation,
        syncAuthorization: trySyncAuthorization,
        importCommand: (curlString, options) => {
            const parsed = parseCurlCommand(curlString);
            if (!parsed) return false;
            const matched = matchOperation(parsed);
            if (!matched) return false;
            if (options?.syncAuth && parsed.authHeader) {
                trySyncAuthorization(parsed.authHeader);
            }
            return populateSwaggerOperation(matched, parsed, options);
        },
        version: CONFIG.PLUGIN_VERSION
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
