/**
 * @file swagger-dto-presets.js
 * @summary DTO Presets, Polymorphic Mock Payloads & Favorites plugin for Swagger UI (OpenAPI / REST).
 *          Automatically generates accurate request body payloads for polymorphic schemas ($type/discriminator),
 *          injects predefined host presets, and enables custom developer favorites saved to localStorage.
 *
 * --- ARCHITECTURAL FLOW ---
 * 1. Dynamic OpenAPI Specification Inspection:
 *    - Reads Swagger Redux store (`ui.getState().get("spec")`) to inspect schemas and components.
 *    - Detects required/optional fields and inheritance hierarchies (`oneOf`, `anyOf`, `allOf`, `discriminator`).
 * 2. Smart Polymorphic Generation:
 *    - Automatically generates dedicated presets for each derived subtype and injects the discriminator ($type).
 * 3. Universal Built-in Templates:
 *    - "✨ Minimal Template": contains only strictly required fields.
 *    - "📋 Full Template": contains all schema properties populated with realistic mock values.
 * 4. Predefined Host Presets & Developer Favorites:
 *    - Supports `window.SwaggerPresetsConfig` for predefined endpoint templates.
 *    - Allows saving custom request bodies to browser localStorage for instant 1-click reuse.
 * 5. Contextual Swagger UI Injection:
 *    - Injects a compact toolbar directly above the Request Body textarea.
 *    - Automatically activates "Try it out" when a preset is selected and dispatches React synthetic events.
 * 6. Theme Integration:
 *    - Fully compatible with Swagger UI Light and Dark modes.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. CONFIGURAZIONE GENERALE (Modificabile dallo sviluppatore)
    // =========================================================================
    const CONFIG = {
        /** LocalStorage key prefix for user-saved custom presets */
        STORAGE_KEY_PREFIX: "swp_swagger_preset_",

        /** CSS class for toolbar injected above request body textarea */
        TOOLBAR_CLASS: "swagger-dto-presets-toolbar",

        /** Polling interval for initial window.ui readiness (ms) */
        DISCOVERY_INTERVAL_MS: 200,

        /** Maximum timeout waiting for window.ui (ms) */
        DISCOVERY_TIMEOUT_MS: 30000,

        /** Valori predefiniti realistici per i tipi primitivi nello schema generator */
        DUMMY_DEFAULTS: {
            GUID: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            STRING: "string",
            INTEGER: 1,
            NUMBER: 10.5,
            BOOLEAN: true,
            DATE: "2026-11-09",
            DATE_TIME: "2026-11-09T10:00:00.000Z",
            EMAIL: "utente@example.com"
        }
    };

    // =========================================================================
    // =========================================================================
    // 1.1 INTERNATIONALIZATION (i18n) ENGINE & DICTIONARIES
    // =========================================================================
    const I18N = {
        en: {
            toolbarTitle: "🧩 DTO Presets:",
            selectPlaceholder: "-- Select a DTO Preset --",
            applyBtn: "✓ Apply",
            applyBtnTitle: "Apply selected payload into request body textarea",
            copyBtn: "📋 Copy",
            copyBtnTitle: "Copy selected JSON payload to clipboard",
            saveBtn: "💾 Save",
            saveBtnTitle: "Save current textarea contents as a custom preset",
            deleteBtn: "✕ Delete",
            deleteBtnTitle: "Delete selected custom preset",
            selectFirstAlert: "Please select a preset from the dropdown first.",
            payloadInserted: "✓ Payload applied!",
            copied: "📋 Copied!",
            saved: "💾 Saved!",
            emptyBodyAlert: "Request body textarea is empty. Enter or edit valid JSON first.",
            invalidJsonAlert: "Textarea content is not valid JSON.",
            presetNamePrompt: "Enter a name for this custom preset:",
            presetDefaultName: "My custom preset",
            deleteConfirm: "Delete custom preset \"{name}\"?",
            groupHost: "Predefined Host Presets",
            groupPolymorphic: "Polymorphic Variants",
            groupAuto: "OpenAPI Auto Templates",
            groupCustom: "Saved Custom Presets",
            autoMinimal: "⚡ Automatic Minimal (Required only)",
            autoFull: "✨ Automatic Full (All fields mock)"
        },
        it: {
            toolbarTitle: "🧩 Preset DTO:",
            selectPlaceholder: "-- Seleziona un Preset DTO --",
            applyBtn: "✓ Applica",
            applyBtnTitle: "Inserisce il payload selezionato nella textarea del body",
            copyBtn: "📋 Copia",
            copyBtnTitle: "Copia il payload JSON selezionato negli appunti",
            saveBtn: "💾 Salva",
            saveBtnTitle: "Salva il contenuto corrente della textarea come preset personalizzato",
            deleteBtn: "✕ Elimina",
            deleteBtnTitle: "Elimina il preset personalizzato selezionato",
            selectFirstAlert: "Seleziona prima un preset dal menu a tendina.",
            payloadInserted: "✓ Payload inserito!",
            copied: "📋 Copiato!",
            saved: "💾 Salvato!",
            emptyBodyAlert: "La textarea del body è vuota. Inserisci o modifica prima un JSON valido.",
            invalidJsonAlert: "Il contenuto della textarea non è un JSON valido.",
            presetNamePrompt: "Inserisci un nome per questo preset personalizzato:",
            presetDefaultName: "Mio preset di test",
            deleteConfirm: "Eliminare il preset personalizzato \"{name}\"?",
            groupHost: "Preset Predefiniti Host",
            groupPolymorphic: "Varianti Polimorfiche",
            groupAuto: "Template Automatici OpenAPI",
            groupCustom: "I Miei Preset Personalizzati",
            autoMinimal: "⚡ Automatico Minimale (Solo campi obbligatori)",
            autoFull: "✨ Automatico Completo (Tutti i campi mockati)"
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

    // 2. FUNZIONI DI UTILITÀ (DOM, String, React State Setter)
    // =========================================================================

    /**
     * Cleans zero-width characters (\u200B) injected by Swagger UI.
     * @param {string} str
     * @returns {string}
     */
    function cleanZeroWidth(str) {
        if (!str || typeof str !== "string") return "";
        return str.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
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
     * Aggiorna il valore di una textarea controllata da React scatenando gli eventi sintetici.
     * @param {HTMLTextAreaElement} textarea
     * @param {string} value
     */
    function setReactTextareaValue(textarea, value) {
        if (!textarea) return;

        // Recupera il property setter nativo del prototipo HTMLTextAreaElement per aggirare React
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;

        if (nativeSetter) {
            nativeSetter.call(textarea, value);
        } else {
            textarea.value = value;
        }

        // Notifica sia React che i listener nativi
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // =========================================================================
    // 3. SCHEMA RESOLVER & OPENAPI SPEC ENGINE
    // =========================================================================

    /**
     * Estrae la specifica OpenAPI dallo store Redux di Swagger UI.
     * @returns {object|null}
     */
    function getSwaggerSpec() {
        try {
            const ui = window.ui;
            if (!ui) return null;

            // Attempt 1: Via Redux store getter
            const state = ui.getState && ui.getState();
            if (state) {
                const specData = state.get("spec")?.get("json");
                if (specData) {
                    return typeof specData.toJS === "function" ? specData.toJS() : specData;
                }
            }

            // Tentativo 2: Tramite selector diretto
            if (ui.specSelectors && typeof ui.specSelectors.specJson === "function") {
                const spec = ui.specSelectors.specJson();
                if (spec) {
                    return typeof spec.toJS === "function" ? spec.toJS() : spec;
                }
            }
        } catch (error) {
            console.warn("[Swagger Presets] Impossibile accedere alla specifica OpenAPI:", error);
        }
        return null;
    }

    /**
     * Risolve un riferimento '$ref' OpenAPI (es. '#/components/schemas/PermanentContractDto').
     * @param {string} ref
     * @param {object} spec
     * @returns {object|null}
     */
    function resolveSchemaRef(ref, spec) {
        if (!ref || !spec || typeof ref !== "string" || !ref.startsWith("#/")) {
            return null;
        }

        const segments = ref.replace(/^#\//, "").split("/");
        let current = spec;

        for (const segment of segments) {
            if (current && typeof current === "object" && segment in current) {
                current = current[segment];
            } else {
                return null;
            }
        }
        return current;
    }

    /**
     * Risolve ed espande uno schema gestendo eventuali costrutti 'allOf' (ereditarietà).
     * @param {object} rawSchema
     * @param {object} spec
     * @returns {object} Schema unificato con properties e required
     */
    function getMergedSchema(rawSchema, spec) {
        if (!rawSchema) return {};

        // Se lo schema è un riferimento $ref, risolvilo prima
        if (rawSchema.$ref) {
            const resolved = resolveSchemaRef(rawSchema.$ref, spec);
            return resolved ? getMergedSchema(resolved, spec) : {};
        }

        // Se lo schema usa allOf (ereditarietà tra classe base e derivata)
        if (Array.isArray(rawSchema.allOf)) {
            const merged = {
                type: "object",
                properties: {},
                required: [],
                discriminator: rawSchema.discriminator || null
            };

            for (const part of rawSchema.allOf) {
                const resolvedPart = part.$ref ? resolveSchemaRef(part.$ref, spec) : part;
                if (resolvedPart) {
                    const expandedPart = getMergedSchema(resolvedPart, spec);

                    if (expandedPart.properties) {
                        Object.assign(merged.properties, expandedPart.properties);
                    }
                    if (Array.isArray(expandedPart.required)) {
                        merged.required = [...new Set([...merged.required, ...expandedPart.required])];
                    }
                    if (expandedPart.discriminator && !merged.discriminator) {
                        merged.discriminator = expandedPart.discriminator;
                    }
                }
            }

            // Incorpora eventuali proprietà dirette
            if (rawSchema.properties) {
                Object.assign(merged.properties, rawSchema.properties);
            }
            if (Array.isArray(rawSchema.required)) {
                merged.required = [...new Set([...merged.required, ...rawSchema.required])];
            }

            return merged;
        }

        return rawSchema;
    }

    /**
     * Detects if schema contains a polymorphic property (oneOf/anyOf).
     * @param {object} schema
     * @param {object} spec
     * @returns {Array<{ propertyName: string, discriminatorProp: string, variants: Array<{ label: string, discriminatorVal: string, schema: object }> }>}
     */
    function findPolymorphicSlots(schema, spec) {
        const slots = [];
        const merged = getMergedSchema(schema, spec);
        if (!merged.properties) return slots;

        for (const [propName, propDef] of Object.entries(merged.properties)) {
            let targetDef = propDef;
            if (targetDef.$ref) {
                targetDef = resolveSchemaRef(targetDef.$ref, spec) || targetDef;
            }

            // Check for presence of oneOf or anyOf
            const subTypes = targetDef.oneOf || targetDef.anyOf;
            if (Array.isArray(subTypes) && subTypes.length > 0) {
                const variants = [];
                const discProp = targetDef.discriminator?.propertyName || "$type";

                subTypes.forEach((subRefObj) => {
                    const resolvedSub = subRefObj.$ref ? resolveSchemaRef(subRefObj.$ref, spec) : subRefObj;
                    if (!resolvedSub) return;

                    // Extract clean DTO class name (e.g. "SubtypeDto")
                    const rawName = subRefObj.$ref ? subRefObj.$ref.split("/").pop() : (resolvedSub.title || "Variante");
                    // Strip redundant 'Dto' or suffixes to keep labels clean
                    const cleanLabel = rawName
                        .replace(/ContractDto$/i, "")
                        .replace(/Dto$/i, "");

                    // Determina il valore del discriminatore ($type) tramite mapping OpenAPI o label pulita
                    let discriminatorVal = cleanLabel;
                    if (targetDef.discriminator && targetDef.discriminator.mapping) {
                        for (const [key, mappingRef] of Object.entries(targetDef.discriminator.mapping)) {
                            if (mappingRef === subRefObj.$ref || mappingRef.endsWith("/" + rawName)) {
                                discriminatorVal = key;
                                break;
                            }
                        }
                    }

                    variants.push({
                        label: cleanLabel,
                        rawName: rawName,
                        discriminatorVal: discriminatorVal,
                        schema: resolvedSub
                    });
                });

                if (variants.length > 0) {
                    slots.push({
                        propertyName: propName,
                        discriminatorProp: discProp,
                        variants: variants
                    });
                }
            }
        }

        return slots;
    }

    /**
     * Generates realistic mock sample value for a single schema property.
     * Gestisce puntualmente:
     * - Default ed Example esposti dal Backend (priorità assoluta)
     * - Wrapper allOf utilizzati da Swashbuckle per applicare attributi a $ref
     * - Riferimenti $ref a schemi Enum (restituendo la stringa/valore dell'enum anziché un oggetto {})
     * - Riferimenti $ref a schemi Polimorfici (selezionando il primo sottotipo concreto)
     * - Dizionari (Dictionary<string, T> -> additionalProperties)
     * - Vincoli di range numerici (minimum/maximum)
     * - Tipi primitivi, date, uuid, ore e oggetti annidati
     *
     * @param {object} rawPropSchema
     * @param {string} propName
     * @param {object} spec
     * @param {boolean} minimalOnly
     * @returns {any}
     */
    function generatePropertyValue(rawPropSchema, propName, spec, minimalOnly) {
        if (!rawPropSchema) return "";

        // 1. Scompatta eventuale wrapper allOf (molto comune in Swashbuckle per annotare un $ref)
        let baseProp = rawPropSchema;
        if (Array.isArray(baseProp.allOf) && baseProp.allOf.length === 1 && baseProp.allOf[0].$ref) {
            baseProp = Object.assign({}, baseProp.allOf[0], baseProp);
        }

        // 2. Risolve eventuali riferimenti $ref a monte
        let propSchema = baseProp;
        if (propSchema.$ref) {
            propSchema = resolveSchemaRef(propSchema.$ref, spec) || propSchema;
        }

        // 3. RECUPERO DEFAULT ED EXAMPLE ESPOSTI DAL BACKEND (Priorità Assoluta)
        // Check both raw property schema in model and referenced schema
        const explicitExample = rawPropSchema.example !== undefined ? rawPropSchema.example : propSchema.example;
        const explicitDefault = rawPropSchema.default !== undefined ? rawPropSchema.default : propSchema.default;

        if (explicitExample !== undefined) return explicitExample;
        if (explicitDefault !== undefined) return explicitDefault;

        // 4. Gestione ENUM: se ha 'enum' o 'x-enumNames'
        if (Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
            return propSchema.enum[0];
        }
        if (Array.isArray(propSchema["x-enumNames"]) && propSchema["x-enumNames"].length > 0) {
            return propSchema["x-enumNames"][0];
        }

        // 5. Gestione POLIMORFISMO (oneOf / anyOf): se la proprietà ha sottotipi
        const subTypes = propSchema.oneOf || propSchema.anyOf;
        if (Array.isArray(subTypes) && subTypes.length > 0) {
            const firstSubRefObj = subTypes[0];
            const firstSub = firstSubRefObj.$ref ? resolveSchemaRef(firstSubRefObj.$ref, spec) : firstSubRefObj;
            if (firstSub) {
                const sample = generateSampleFromSchema(firstSub, spec, { minimalOnly });
                const subRefName = firstSubRefObj.$ref ? firstSubRefObj.$ref.split("/").pop() : (firstSub.title || "");
                const discVal = subRefName.replace(/ContractDto$/i, "").replace(/Dto$/i, "");
                const discProp = propSchema.discriminator?.propertyName || "$type";
                sample[discProp] = discVal;
                return sample;
            }
        }

        // 6. Gestione DIZIONARI (Dictionary<string, T> -> additionalProperties)
        if (propSchema.additionalProperties) {
            const addPropSchema = typeof propSchema.additionalProperties === "object" ? propSchema.additionalProperties : { type: "string" };
            const sampleVal = generatePropertyValue(addPropSchema, "valore", spec, minimalOnly);
            return { "chiave": sampleVal };
        }

        const type = propSchema.type || "string";
        const format = (propSchema.format || "").toLowerCase();
        const lowerName = propName.toLowerCase();

        // 7. Tipi Data, Ora e Data-Ora
        if (format === "date-time") return CONFIG.DUMMY_DEFAULTS.DATE_TIME;
        if (format === "date" || lowerName.endsWith("date")) return CONFIG.DUMMY_DEFAULTS.DATE;
        if (format === "time" || format === "duration") return "10:00:00";

        // 8. Guid / Identificativi UUID
        if (format === "uuid" || lowerName.endsWith("id") || lowerName.endsWith("guid")) {
            return CONFIG.DUMMY_DEFAULTS.GUID;
        }

        // 9. Stringhe con formati speciali o euristiche per nome campo
        if (type === "string") {
            if (format === "email" || lowerName.includes("email")) return CONFIG.DUMMY_DEFAULTS.EMAIL;
            if (format === "uri" || lowerName.includes("url") || lowerName.includes("uri")) return "https://example.com";
            if (format === "byte") return "U3dhZ2dlcg==";
            if (lowerName.includes("phone") || lowerName.includes("telefono")) return "+39 02 1234567";
            if (lowerName.includes("ccnl")) return "Metalmeccanico Industria";
            if (lowerName.includes("level") || lowerName.includes("livello")) return "Livello B1";
            if (lowerName.includes("qualifica")) return "Impiegato";
            if (lowerName.includes("mansione")) return "Software Engineer";
            if (lowerName.includes("previdence") || lowerName.includes("fondo")) return "Fondo Cometa";
            if (lowerName.includes("name") || lowerName.includes("nome")) return "Mario";
            if (lowerName.includes("surname") || lowerName.includes("cognome")) return "Rossi";
            return CONFIG.DUMMY_DEFAULTS.STRING;
        }

        // 10. Numeri interi e decimali (rispettando eventuali vincoli minimum/maximum del BE)
        if (type === "integer") {
            if (propSchema.minimum !== undefined) return propSchema.minimum;
            if (lowerName.includes("year") || lowerName.includes("anno")) return 2026;
            if (lowerName.includes("month") || lowerName.includes("mese")) return 11;
            if (lowerName.includes("ral") || lowerName.includes("retribuzione")) return 35000;
            return CONFIG.DUMMY_DEFAULTS.INTEGER;
        }

        if (type === "number") {
            if (propSchema.minimum !== undefined) return propSchema.minimum;
            if (lowerName.includes("ral") || lowerName.includes("importo")) return 35000.0;
            return CONFIG.DUMMY_DEFAULTS.NUMBER;
        }

        // 11. Booleani
        if (type === "boolean") {
            return CONFIG.DUMMY_DEFAULTS.BOOLEAN;
        }

        // 12. Array di oggetti o valori primitivi
        if (type === "array" && propSchema.items) {
            const itemVal = generatePropertyValue(propSchema.items, propName + "Item", spec, minimalOnly);
            return [itemVal];
        }

        // 13. Oggetti annidati o compositi (allOf, properties)
        if (type === "object" || propSchema.properties || propSchema.allOf) {
            return generateSampleFromSchema(propSchema, spec, { minimalOnly });
        }

        return "";
    }

    /**
     * Genera un oggetto JSON completo o minimale a partire da uno schema OpenAPI.
     * @param {object} rawSchema
     * @param {object} spec
     * @param {object} [options]
     * @param {boolean} [options.minimalOnly=false] - Se true, include solo i campi [Required]
     * @param {object} [options.polymorphicOverride=null] - Mappa di sottotipi selezionati { propName: variant }
     * @returns {object} Oggetto JavaScript pronto per essere serializzato in JSON
     */
    function generateSampleFromSchema(rawSchema, spec, options = {}) {
        const minimalOnly = options.minimalOnly === true;
        const polyOverride = options.polymorphicOverride || {};

        if (!rawSchema) return {};

        // Se lo schema è un riferimento $ref, risolvilo
        let schemaToProcess = rawSchema;
        if (schemaToProcess.$ref) {
            schemaToProcess = resolveSchemaRef(schemaToProcess.$ref, spec) || schemaToProcess;
        }

        // Se lo schema è un Enum diretto
        if (Array.isArray(schemaToProcess.enum) && schemaToProcess.enum.length > 0) {
            return schemaToProcess.example !== undefined ? schemaToProcess.example : (schemaToProcess.default !== undefined ? schemaToProcess.default : schemaToProcess.enum[0]);
        }

        // Se lo schema ha oneOf / anyOf a livello root
        const subTypes = schemaToProcess.oneOf || schemaToProcess.anyOf;
        if (Array.isArray(subTypes) && subTypes.length > 0) {
            const firstSubRef = subTypes[0];
            const firstSub = firstSubRef.$ref ? resolveSchemaRef(firstSubRef.$ref, spec) : firstSubRef;
            if (firstSub) {
                const sample = generateSampleFromSchema(firstSub, spec, options);
                const subRefName = firstSubRef.$ref ? firstSubRef.$ref.split("/").pop() : "";
                const discVal = subRefName.replace(/ContractDto$/i, "").replace(/Dto$/i, "");
                const discProp = schemaToProcess.discriminator?.propertyName || "$type";
                sample[discProp] = discVal;
                return sample;
            }
        }

        const merged = getMergedSchema(schemaToProcess, spec);
        if (!merged.properties) {
            // Se ha additionalProperties (dizionario a livello schema)
            if (merged.additionalProperties) {
                const addPropSchema = typeof merged.additionalProperties === "object" ? merged.additionalProperties : { type: "string" };
                const sampleVal = generatePropertyValue(addPropSchema, "valore", spec, minimalOnly);
                return { "chiave": sampleVal };
            }
            if (Array.isArray(merged.enum) && merged.enum.length > 0) {
                return merged.enum[0];
            }
            if (merged.type && merged.type !== "object") {
                return generatePropertyValue(merged, "", spec, minimalOnly);
            }
            return {};
        }

        const result = {};
        const requiredList = Array.isArray(merged.required) ? merged.required : [];

        for (const [propName, propDef] of Object.entries(merged.properties)) {
            // Se modalità minimale, salta i campi non contrassegnati come required
            if (minimalOnly && !requiredList.includes(propName)) {
                continue;
            }

            // If a polymorphic variant has been chosen for this property:
            if (polyOverride[propName]) {
                const variant = polyOverride[propName];
                const variantSchema = getMergedSchema(variant.schema, spec);
                const subObj = generateSampleFromSchema(variantSchema, spec, { minimalOnly });

                // Inietta il discriminatore per il polimorfismo (es. "$type": "Permanent")
                const discPropName = variant.discriminatorProp || "$type";
                subObj[discPropName] = variant.discriminatorVal;

                result[propName] = subObj;
                continue;
            }

            result[propName] = generatePropertyValue(propDef, propName, spec, minimalOnly);
        }

        return result;
    }

    // =========================================================================
    // 4. GENERATORE DI PRESET PER L'ENDPOINT APERTO
    // =========================================================================

    /**
     * Struttura di un Preset generato:
     * @typedef {object} DtoPreset
     * @property {string} id - Identificativo unico del preset
     * @property {string} label - Display label in dropdown
     * @property {string} group - Raggruppamento (Polimorfismo, Standard, Personali)
     * @property {object} payload - Oggetto JSON del payload
     * @property {boolean} isCustom - Whether created by user and saved in localStorage
     */

    /**
     * Resolves predefined presets configured in window.SwaggerPresetsConfig for a given method and path.
     * @param {string} method
     * @param {string} path
     * @returns {Array<Object>}
     */
    function getGlobalPresetsForEndpoint(method, path) {
        const globalConfig = window.SwaggerPresetsConfig;
        if (!globalConfig || typeof globalConfig !== "object") return [];

        const normalizedUpper = `${method.toUpperCase()} ${path}`;
        const normalizedLower = `${method.toLowerCase()} ${path}`;
        const match = globalConfig[normalizedUpper] || globalConfig[normalizedLower] || globalConfig[path];

        return Array.isArray(match) ? match : [];
    }

    /**
     * Risolve lo schema del requestBody dell'operazione e genera tutti i preset disponibili.
     * @param {string} method - es. "post"
     * @param {string} path - es. "/api/ContractProposals/create-contract-proposal"
     * @returns {DtoPreset[]}
     */
    function buildPresetsForOperation(method, path) {
        const spec = getSwaggerSpec();
        if (!spec || !spec.paths) return [];

        const normalizedMethod = (method || "").toLowerCase();
        const pathItem = spec.paths[path];
        if (!pathItem) return [];

        const op = pathItem[normalizedMethod];
        if (!op || !op.requestBody) return [];

        // Estrae lo schema associato a 'application/json'
        const content = op.requestBody.content || {};
        const jsonContent = content["application/json"] || content["application/*+json"] || Object.values(content)[0];
        if (!jsonContent || !jsonContent.schema) return [];

        const rootSchema = getMergedSchema(jsonContent.schema, spec);
        const presets = [];

        // 1. GLOBAL PRESETS FROM HOST CONFIGURATION (window.SwaggerPresetsConfig)
        const globalPresets = getGlobalPresetsForEndpoint(method, path);
        globalPresets.forEach((gp, idx) => {
            if (gp && gp.payload) {
                presets.push({
                    id: `global_${idx}_${Date.now()}`,
                    label: `🌐 ${gp.name || 'Predefined Preset'}`,
                    group: t("groupHost", "Predefined Host Presets"),
                    payload: gp.payload,
                    isCustom: false,
                    isGlobal: true
                });
            }
        });

        // 2. AUTOMATIC POLYMORPHISM DISCOVERY ($type / discriminators)
        const polySlots = findPolymorphicSlots(rootSchema, spec);

        if (polySlots.length > 0) {
            for (const slot of polySlots) {
                for (const variant of slot.variants) {
                    const payload = generateSampleFromSchema(rootSchema, spec, {
                        minimalOnly: false,
                        polymorphicOverride: {
                            [slot.propertyName]: {
                                schema: variant.schema,
                                discriminatorProp: slot.discriminatorProp,
                                discriminatorVal: variant.discriminatorVal
                            }
                        }
                    });

                    presets.push({
                        id: `poly_${slot.propertyName}_${variant.discriminatorVal}`,
                        label: `${variant.label} (${slot.propertyName})`,
                        group: t("groupPolymorphic", "Polymorphic Variants"),
                        payload: payload,
                        isCustom: false
                    });
                }
            }
        }

        // 3. UNIVERSAL TEMPLATES (Full Sample & Minimal Required)
        const fullPayload = generateSampleFromSchema(rootSchema, spec, { minimalOnly: false });
        presets.push({
            id: "standard_full",
            label: "Full Sample (All Fields)",
            group: t("groupAuto", "OpenAPI Auto Templates"),
            payload: fullPayload,
            isCustom: false
        });

        const minimalPayload = generateSampleFromSchema(rootSchema, spec, { minimalOnly: true });
        if (Object.keys(minimalPayload).length > 0 && Object.keys(minimalPayload).length < Object.keys(fullPayload).length) {
            presets.push({
                id: "standard_minimal",
                label: "Minimal Required Fields",
                group: t("groupAuto", "OpenAPI Auto Templates"),
                payload: minimalPayload,
                isCustom: false
            });
        }

        // 4. CUSTOM DEVELOPER PRESETS (LocalStorage)
        const customPresets = loadCustomPresetsForEndpoint(method, path);
        for (const custom of customPresets) {
            presets.push({
                id: `custom_${custom.id}`,
                label: `★ ${custom.name}`,
                group: t("groupCustom", "Saved Custom Presets"),
                payload: custom.payload,
                isCustom: true,
                rawCustomId: custom.id
            });
        }

        return presets;
    }

    // =========================================================================
    // 5. GESTIONE PRESET PERSONALIZZATI IN LOCALSTORAGE
    // =========================================================================

    /**
     * Costruisce la chiave LocalStorage per un endpoint specifico.
     * @param {string} method
     * @param {string} path
     * @returns {string}
     */
    function getStorageKey(method, path) {
        return `${CONFIG.STORAGE_KEY_PREFIX}${method.toLowerCase()}_${path}`;
    }

    /**
     * Loads user-saved custom presets for an endpoint from localStorage.
     * @param {string} method
     * @param {string} path
     * @returns {Array<{ id: string, name: string, payload: object }>}
     */
    function loadCustomPresetsForEndpoint(method, path) {
        try {
            const raw = localStorage.getItem(getStorageKey(method, path));
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    /**
     * Saves a custom preset for an endpoint to localStorage.
     * @param {string} method
     * @param {string} path
     * @param {string} name
     * @param {object} payload
     */
    function saveCustomPresetForEndpoint(method, path, name, payload) {
        const existing = loadCustomPresetsForEndpoint(method, path);
        const newPreset = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
            name: name.trim(),
            payload: payload
        };
        existing.push(newPreset);
        localStorage.setItem(getStorageKey(method, path), JSON.stringify(existing));
    }

    /**
     * Elimina un preset personalizzato dal LocalStorage.
     * @param {string} method
     * @param {string} path
     * @param {string} customId
     */
    function deleteCustomPresetForEndpoint(method, path, customId) {
        const existing = loadCustomPresetsForEndpoint(method, path);
        const filtered = existing.filter((p) => p.id !== customId);
        localStorage.setItem(getStorageKey(method, path), JSON.stringify(filtered));
    }

    // =========================================================================
    // 6. STILI GRAFICI ADATTIVI (Light e Dark Mode)
    // =========================================================================

    function injectStyles() {
        if (document.getElementById("swagger-dto-presets-styles")) return;

        const style = document.createElement("style");
        style.id = "swagger-dto-presets-styles";
        style.textContent = `
            /* --- Toolbar Contenitore dei Preset DTO --- */
            .${CONFIG.TOOLBAR_CLASS} {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
                margin: 10px 0 12px 0;
                padding: 8px 12px;
                border-radius: 6px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 12px;
                background: #f8fafc;
                border: 1px solid #cbd5e1;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
                transition: all 0.2s ease;
            }

            /* --- Tema Scuro --- */
            html.dark-mode .${CONFIG.TOOLBAR_CLASS},
            body.dark-mode .${CONFIG.TOOLBAR_CLASS} {
                background: #1e1e1e;
                border-color: #383838;
                box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
            }

            /* --- Toolbar Title and Icon --- */
            .swagger-presets-title {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                font-weight: 600;
                color: #0f172a;
                font-size: 12px;
                user-select: none;
            }

            html.dark-mode .swagger-presets-title,
            body.dark-mode .swagger-presets-title {
                color: #f1f5f9;
            }

            /* --- Dropdown Select dei Preset --- */
            .swagger-presets-select {
                flex: 1;
                min-width: 220px;
                max-width: 380px;
                height: 30px;
                padding: 0 8px;
                border-radius: 4px;
                font-size: 12px;
                font-family: inherit;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #0f172a;
                outline: none;
                cursor: pointer;
                transition: border-color 0.15s ease;
            }

            .swagger-presets-select:focus {
                border-color: #0284c7;
            }

            html.dark-mode .swagger-presets-select,
            body.dark-mode .swagger-presets-select {
                background: #262626;
                color: #f5f5f5;
                border-color: #404040;
            }

            html.dark-mode .swagger-presets-select:focus {
                border-color: #49cc90;
            }

            /* --- Pulsanti di Azione --- */
            .swagger-presets-btn {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                height: 30px;
                padding: 0 10px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                font-family: inherit;
                cursor: pointer;
                user-select: none;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #334155;
                transition: all 0.15s ease;
            }

            .swagger-presets-btn:hover {
                background: #f1f5f9;
                border-color: #94a3b8;
                color: #0f172a;
            }

            /* Primary Insert Button */
            .swagger-presets-btn-primary {
                background: #0284c7;
                color: #ffffff;
                border-color: #0284c7;
            }

            .swagger-presets-btn-primary:hover {
                background: #0369a1;
                border-color: #0369a1;
                color: #ffffff;
            }

            html.dark-mode .swagger-presets-btn {
                background: #2a2a2a;
                border-color: #404040;
                color: #e2e8f0;
            }

            html.dark-mode .swagger-presets-btn:hover {
                background: #333333;
                border-color: #555555;
                color: #ffffff;
            }

            html.dark-mode .swagger-presets-btn-primary {
                background: #49cc90;
                border-color: #49cc90;
                color: #121212;
            }

            html.dark-mode .swagger-presets-btn-primary:hover {
                background: #3cb87e;
                border-color: #3cb87e;
            }

            /* --- Badge Notifica Flash "Applicato!" --- */
            .swagger-presets-flash {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                background: #dcfce7;
                color: #166534;
                border: 1px solid #86efac;
                animation: presetFlashFade 1.6s forwards;
            }

            html.dark-mode .swagger-presets-flash {
                background: #14532d;
                color: #86efac;
                border-color: #22c55e;
            }

            @keyframes presetFlashFade {
                0% { opacity: 0; transform: translateY(-2px); }
                15% { opacity: 1; transform: translateY(0); }
                80% { opacity: 1; }
                100% { opacity: 0; }
            }

            /* --- Badge Informativo OpenAPI --- */
            .swagger-presets-badge {
                margin-left: auto;
                font-size: 10px;
                color: #64748b;
                font-weight: 500;
                opacity: 0.8;
                user-select: none;
            }

            html.dark-mode .swagger-presets-badge {
                color: #94a3b8;
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================================================
    // 7. TOOLBAR RENDERING IN SWAGGER UI BODY PARAM
    // =========================================================================

    /**
     * Inietta la toolbar dei preset all'interno di un blocco .opblock aperto.
     * @param {HTMLElement} opblock
     */
    function mountToolbarInOpblock(opblock) {
        if (!opblock || opblock.querySelector(`.${CONFIG.TOOLBAR_CLASS}`)) return;

        // Extract HTTP method and route path from opblock header
        const methodEl = opblock.querySelector(".opblock-summary-method");
        const pathEl = opblock.querySelector(".opblock-summary-path");
        if (!methodEl || !pathEl) return;

        const method = methodEl.textContent.trim().toLowerCase();
        const path = cleanZeroWidth(pathEl.textContent);

        // Genera i preset a runtime dall'OpenAPI spec
        const presets = buildPresetsForOperation(method, path);
        if (presets.length === 0) return; // No requestBody on this operation

        // Individua il container dove montare la toolbar (sezione parameters o body-param)
        const targetContainer =
            opblock.querySelector(".opblock-body .body-param") ||
            opblock.querySelector(".opblock-body .parameters-container") ||
            opblock.querySelector(".opblock-body");
        if (!targetContainer) return;

        // Construct toolbar DOM elements
        const toolbar = document.createElement("div");
        toolbar.className = CONFIG.TOOLBAR_CLASS;

        // Construct grouped dropdown options (<optgroup>)
        const groups = {};
        presets.forEach((p) => {
            if (!groups[p.group]) groups[p.group] = [];
            groups[p.group].push(p);
        });

        let optionsHtml = `<option value="">${t("selectPlaceholder", "-- Select a DTO Preset --")}</option>`;
        for (const [groupName, items] of Object.entries(groups)) {
            optionsHtml += `<optgroup label="${escapeHtml(groupName)}">`;
            for (const item of items) {
                optionsHtml += `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`;
            }
            optionsHtml += `</optgroup>`;
        }

        toolbar.innerHTML = `
            <span class="swagger-presets-title">${t("toolbarTitle", "🧩 DTO Presets:")}</span>
            <select class="swagger-presets-select" title="Select a polymorphic variant, predefined preset, or saved favorite">
                ${optionsHtml}
            </select>
            <button type="button" class="swagger-presets-btn swagger-presets-btn-primary btn-apply" title="${t("applyBtnTitle", "Apply selected payload into request body textarea")}">
                ${t("applyBtn", "✓ Apply")}
            </button>
            <button type="button" class="swagger-presets-btn btn-copy" title="${t("copyBtnTitle", "Copy selected JSON payload to clipboard")}">
                ${t("copyBtn", "📋 Copy")}
            </button>
            <button type="button" class="swagger-presets-btn btn-save" title="${t("saveBtnTitle", "Save current textarea contents as a custom preset")}">
                ${t("saveBtn", "💾 Save")}
            </button>
            <button type="button" class="swagger-presets-btn btn-delete" style="display:none;" title="${t("deleteBtnTitle", "Delete selected custom preset")}">
                ${t("deleteBtn", "✕ Delete")}
            </button>
            <span class="swagger-presets-feedback"></span>
            <span class="swagger-presets-badge">OpenAPI</span>
        `;

        // Toolbar DOM element references
        const selectEl = toolbar.querySelector(".swagger-presets-select");
        const btnApply = toolbar.querySelector(".btn-apply");
        const btnCopy = toolbar.querySelector(".btn-copy");
        const btnSave = toolbar.querySelector(".btn-save");
        const btnDelete = toolbar.querySelector(".btn-delete");
        const feedbackEl = toolbar.querySelector(".swagger-presets-feedback");

        /** Displays temporary visual feedback */
        const showFeedback = (msg) => {
            feedbackEl.innerHTML = `<span class="swagger-presets-flash">${escapeHtml(msg)}</span>`;
            setTimeout(() => {
                feedbackEl.innerHTML = "";
            }, 1800);
        };

        /** Returns currently selected preset from dropdown */
        const getSelectedPreset = () => {
            const selectedId = selectEl.value;
            if (!selectedId) return null;
            return presets.find((p) => p.id === selectedId) || null;
        };

        // Manage visibility of Delete button if selected preset is custom
        selectEl.addEventListener("change", () => {
            const preset = getSelectedPreset();
            if (preset && preset.isCustom) {
                btnDelete.style.display = "inline-flex";
            } else {
                btnDelete.style.display = "none";
            }
        });

        /**
         * Applies selected JSON payload into Swagger UI textarea.
         */
        const applyPreset = () => {
            const preset = getSelectedPreset();
            if (!preset) {
                alert(t("selectFirstAlert", "Please select a preset from the dropdown first."));
                return;
            }

            // 1. Se Swagger UI non è in modalità "Try it out", la attiviamo per far apparire la textarea
            const tryOutBtn = opblock.querySelector(".btn.try-out__btn");
            if (tryOutBtn && tryOutBtn.textContent.includes("Try it out")) {
                tryOutBtn.click();
            }

            // 2. Wait for React to mount textarea if Try it out was just toggled
            const jsonText = JSON.stringify(preset.payload, null, 2);

            let attempts = 0;
            const pollTextarea = setInterval(() => {
                attempts++;
                const textarea = opblock.querySelector("textarea.body-param__text") || opblock.querySelector("textarea");

                if (textarea) {
                    clearInterval(pollTextarea);
                    setReactTextareaValue(textarea, jsonText);
                    showFeedback(t("payloadInserted", "✓ Payload applied!"));
                } else if (attempts >= 15) {
                    clearInterval(pollTextarea);
                    console.warn("[Swagger Presets] Unable to find request body textarea for this endpoint.");
                }
            }, 40);
        };

        btnApply.addEventListener("click", applyPreset);

        // Copy JSON to clipboard
        btnCopy.addEventListener("click", () => {
            const preset = getSelectedPreset();
            if (!preset) {
                alert(t("selectFirstAlert", "Please select a preset from the dropdown first."));
                return;
            }

            const jsonText = JSON.stringify(preset.payload, null, 2);
            navigator.clipboard
                .writeText(jsonText)
                .then(() => showFeedback(t("copied", "📋 Copied!")))
                .catch(() => alert("Unable to copy to clipboard."));
        });

        // Save current content as custom preset
        btnSave.addEventListener("click", () => {
            const textarea = opblock.querySelector("textarea.body-param__text") || opblock.querySelector("textarea");
            const rawContent = textarea ? textarea.value.trim() : "";

            if (!rawContent) {
                alert(t("emptyBodyAlert", "Request body textarea is empty. Enter or edit valid JSON first."));
                return;
            }

            let parsed = null;
            try {
                parsed = JSON.parse(rawContent);
            } catch {
                alert(t("invalidJsonAlert", "Textarea content is not valid JSON."));
                return;
            }

            const name = prompt(t("presetNamePrompt", "Enter a name for this custom preset:"), t("presetDefaultName", "My custom preset"));
            if (!name || !name.trim()) return;

            saveCustomPresetForEndpoint(method, path, name.trim(), parsed);
            showFeedback(t("saved", "💾 Saved!"));

            // Rebuild toolbar to show new preset
            toolbar.remove();
            mountToolbarInOpblock(opblock);
        });

        // Elimina preset personalizzato
        btnDelete.addEventListener("click", () => {
            const preset = getSelectedPreset();
            if (!preset || !preset.isCustom) return;

            if (confirm(t("deleteConfirm", `Delete custom preset "${preset.label}"?`, { name: preset.label }))) {
                deleteCustomPresetForEndpoint(method, path, preset.rawCustomId);
                toolbar.remove();
                mountToolbarInOpblock(opblock);
            }
        });

        // Insert toolbar before body-param textarea
        const bodyParam = opblock.querySelector(".opblock-body .body-param");
        if (bodyParam) {
            bodyParam.insertBefore(toolbar, bodyParam.firstChild);
        } else {
            targetContainer.insertBefore(toolbar, targetContainer.firstChild);
        }
    }

    // =========================================================================
    // 8. MONITORAGGIO DOM E INIZIALIZZAZIONE
    // =========================================================================

    /**
     * Scansiona periodicamente tutti gli opblock aperti per montare la toolbar dei preset.
     */
    function scanAndMountToolbars() {
        const openOpblocks = document.querySelectorAll(".swagger-ui .opblock.is-open");
        openOpblocks.forEach((opblock) => {
            mountToolbarInOpblock(opblock);
        });
    }

    function initialize() {
        const startTime = Date.now();

        const checkInterval = window.setInterval(() => {
            const hasSwaggerState = window.ui && typeof window.ui.getState === "function";
            const hasOpblocks = document.querySelector(".swagger-ui .opblock");

            if (hasSwaggerState || hasOpblocks) {
                window.clearInterval(checkInterval);
                injectStyles();
                scanAndMountToolbars();
                registerGuideDocumentation();

                window.addEventListener("swagger-activity-bar:ready", registerGuideDocumentation);
                window.addEventListener("swagger-i18n:locale-changed", () => {
                    registerGuideDocumentation(true);
                    // Rimuove e rimonta le toolbar negli opblock aperti per aggiornare i testi
                    document.querySelectorAll(".swagger-presets-toolbar").forEach((tb) => tb.remove());
                    scanAndMountToolbars();
                });

                // Observer to intercept dynamic opening of endpoints (.opblock.is-open)
                const observer = new MutationObserver(() => {
                    scanAndMountToolbars();
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["class"]
                });

                console.info("[Swagger Presets] DTO Presets & Polymorphic Generator module initialized successfully.");
            }

            if (Date.now() - startTime >= CONFIG.DISCOVERY_TIMEOUT_MS) {
                window.clearInterval(checkInterval);
            }
        }, CONFIG.DISCOVERY_INTERVAL_MS);
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
                id: "dto-presets",
                name: "DTO Presets & Polymorphic Mocks",
                version: "1.0.0",
                description: "Automatic request body generator for polymorphic schemas ($type/discriminators), predefined host presets, and custom developer favorites.",
                shortcuts: [
                    "Preset Menu: Select DTO variant to insert into Request Body",
                    "Save Preset: Save custom payload to local favorites",
                    "Reset: Restore initial Swagger schema template"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                `,
                i18n: {
                    en: {
                        name: "DTO Presets & Polymorphic Mocks",
                        description: "Automatic request body generator for polymorphic schemas ($type/discriminators), predefined host presets, and custom developer favorites.",
                        shortcuts: [
                            "Preset Menu: Select DTO variant to insert into Request Body",
                            "Save Preset: Save custom payload to local favorites",
                            "Reset: Restore initial Swagger schema template"
                        ],
                        manual: `
### Overview
Solves the challenge of polymorphic DTO hierarchies (such as schemas with discriminator \`$type\` and multiple subtypes) where standard Swagger UI only shows base model fields.

### How to Use
When expanding an endpoint with a JSON request body:
1. A toolbar appears above the Request Body with the **"DTO Presets"** dropdown.
2. Select any desired subtype or template: payload is instantly populated with all specific subtype fields and realistic mock values.
3. Save recurring configurations using the **"Save"** button into local browser storage.
`
                    },
                    it: {
                        name: "Preset DTO & Mock Polimorfici",
                        description: "Generatore automatico di payload per gerarchie polimorfiche ($type/discriminator), preset predefiniti e preferiti personalizzati.",
                        shortcuts: [
                            "Menu Preset: Seleziona la variante DTO da applicare al Body",
                            "Salva Preset: Memorizza il payload attuale nei preferiti locali",
                            "Ripristina: Ricarica il template di default OpenAPI"
                        ],
                        manual: `
### Panoramica
Risolve il problema delle gerarchie polimorfiche OpenAPI (es. discriminator \`$type\` o \`discriminator.propertyName\`), dove Swagger UI nativo mostra solo i campi dell'interfaccia base.

### Come si Usa
Espandendo un endpoint dotato di request body JSON:
1. Sopra il corpo della richiesta compare la barra degli strumenti con il menu **"Preset DTO"**.
2. Selezionando un sottotipo polimorfico o un template, il body viene compilato con tutti i campi del tipo derivato valorizzati con mock realistici.
3. Con il pulsante **"Salva"** è possibile memorizzare payload personalizzati nello storage del browser per riutilizzarli in qualsiasi momento.
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
