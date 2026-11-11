/**
 * @file swagger-activity-bar.js
 * @summary Plugin Indipendente Activity Bar & Extensions Guide per Swagger UI (ASP.NET Core / OpenAPI).
 *          Fornisce:
 *          1. Una barra verticale laterale in stile VS Code (44px) fissa a sinistra,
 *             accessibile a qualsiasi livello di scroll.
 *          2. Un'API globale su `window.SwaggerActivityBar` che permette a tutti i plugin
 *             (Spotlight Search, SignalR Tester, Network History, Presets, ecc.) di registrarsi
 *             dinamicamente come strumenti e/o pubblicare la propria documentazione.
 *          3. La modale "🧩 Extensions Manager & Interactive Feature Guide" (ID 27) integrata
 *             nella sezione bottom dell'Activity Bar, con navigazione Master-Detail e visualizzatore
 *             Markdown per le guide dei plugin attivi.
 *
 * --- ARCHITETTURA MODULARE & DECOUPLING ---
 * 1. Totale Indipendenza:
 *    - Si occupa del contenitore laterale, del layout responsive di Swagger UI e del ciclo di vita dei pulsanti.
 * 2. API Globale `window.SwaggerActivityBar`:
 *    - `registerItem({ id, title, iconHtml, onClick, section, order, ariaLabel })`
 *    - `unregisterItem(id)`
 *    - `setItemActive(id, isActive)`
 *    - `updateItem(id, updates)`
 *    - `getItemElement(id)`
 *    - `isAvailable()`
 *    - `registerPluginGuide({ id, name, version, description, manual, shortcuts, iconHtml })`
 *    - `getRegisteredGuides()`
 * 3. Graceful Fallback:
 *    - I plugin consumatori verificano `window.SwaggerActivityBar?.isAvailable()` prima di registrarsi.
 * 4. Pieno Supporto Light & Dark Mode:
 *    - Sincronizzato automaticamente con le classi del tema di Swagger UI.
 *
 * --- GUIDA ALLA MANUTENZIONE PER SVILUPPATORI ---
 * - Per modificare dimensioni o posizionamento: Aggiornare `CONFIG.BAR_WIDTH_PX`.
 * - Per personalizzare gli stili della barra o della modale: Vedere la sezione `injectStyles()`.
 */
(() => {
    "use strict";

    // =========================================================================
    // 1. CONFIGURAZIONE GENERALE
    // =========================================================================
    const CONFIG = {
        /** Larghezza in pixel della barra laterale */
        BAR_WIDTH_PX: 44,

        /** ID elemento DOM principale */
        BAR_ID: "swagger-activity-bar",

        /** ID elemento stili CSS iniettati */
        STYLES_ID: "swagger-activity-bar-styles",

        /** ID elemento modale della guida plugin */
        MODAL_ID: "swp-extensions-guide-modal",

        /** Z-index per posizionamento sopra elementi standard di Swagger */
        Z_INDEX: 999990
    };

    // =========================================================================
    // 2. STATO IN-MEMORY REGISTRAZIONI
    // =========================================================================
    /** Mappa degli elementi registrati nell'Activity Bar: id -> opzioni */
    const registeredItems = new Map();

    /** Mappa delle guide dei plugin registrate: id -> metadata */
    const registeredGuides = new Map();

    /** Flag DOM montato */
    let isMounted = false;

    /** ID della guida correntemente aperta in dettaglio (null = lista master) */
    let currentDetailGuideId = null;

    /** Flag che indica se la modale guida è aperta */
    let isGuideModalOpen = false;

    // =========================================================================
    // 3. FUNZIONI DI UTILITÀ & MICRO-PARSER MARKDOWN
    // =========================================================================

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
     * Normalizza e analizza una scorciatoia (stringa o oggetto) in { key, desc }.
     * @param {string|Object} sc
     * @returns {{ key: string, desc: string }}
     */
    function parseShortcut(sc) {
        if (!sc) return { key: "", desc: "" };
        if (typeof sc === "object") {
            return {
                key: String(sc.key || "").trim(),
                desc: String(sc.description || "").trim()
            };
        }
        const str = String(sc).trim();
        const colonIdx = str.indexOf(":");
        if (colonIdx > -1) {
            return {
                key: str.slice(0, colonIdx).trim(),
                desc: str.slice(colonIdx + 1).trim()
            };
        }
        return { key: str, desc: "" };
    }

    /**
     * Parser Markdown leggero e sicuro per la formattazione dei manuali d'uso.
     * Supporta: titoli (###), elenchi puntati (- ), grassetto (**), codice inline (`),
     * blocchi di codice (```) e alert di stile GitHub (> [!NOTE]).
     * @param {string} text
     * @returns {string}
     */
    function renderMarkdownToHtml(text) {
        if (!text || typeof text !== "string") return "";

        // 1. Sanificazione preliminare
        let src = escapeHtml(text.trim());

        // 2. Blocchi di codice con tre backtick ```
        src = src.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, (match, lang, code) => {
            return `<pre class="guide-code-block"><code>${code.trim()}</code></pre>`;
        });

        // 3. Intestazioni Markdown (### Titolo, #### Sottotitolo)
        src = src.replace(/^#### (.*?)$/gm, '<h5 class="guide-heading-5">$1</h5>');
        src = src.replace(/^### (.*?)$/gm, '<h4 class="guide-heading-4">$1</h4>');
        src = src.replace(/^## (.*?)$/gm, '<h3 class="guide-heading-3">$1</h3>');

        // 4. Alert in stile GitHub (> [!NOTE] ...)
        src = src.replace(/^&gt;\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*?)$/gim, (match, type, content) => {
            const lowerType = type.toLowerCase();
            return `<div class="guide-alert guide-alert--${lowerType}"><strong class="guide-alert-title">${type}</strong>: ${content}</div>`;
        });

        // 5. Grassetto (**testo**) e Corsivo (*testo*)
        src = src.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        src = src.replace(/\*(.*?)\*/g, "<em>$1</em>");

        // 6. Codice inline (`codice`)
        src = src.replace(/`([^`]+)`/g, '<code class="guide-code-inline">$1</code>');

        // 7. Elenchi puntati (- elemento o * elemento)
        src = src.replace(/^\s*[-*]\s+(.*?)$/gm, '<li class="guide-list-item">$1</li>');
        src = src.replace(/(<li class="guide-list-item">[\s\S]*?<\/li>)/g, '<ul class="guide-list">$1</ul>');
        // Rimuove liste annidate duplicate generate da regex adiacenti
        src = src.replace(/<\/ul>\s*<ul class="guide-list">/g, "");

        // 8. Linee orizzontali (---)
        src = src.replace(/^---$/gm, '<hr class="guide-divider"/>');

        // 9. Paragrafi semplici (righe separate da doppio a-capo)
        const paragraphs = src.split(/\n{2,}/);
        return paragraphs
            .map((p) => {
                const trimmed = p.trim();
                if (!trimmed) return "";
                // Non avvolgere in <p> se è già un blocco (ul, h3, h4, pre, alert, hr)
                if (/^<(ul|h[1-6]|pre|div|hr)/i.test(trimmed)) {
                    return trimmed;
                }
                return `<p class="guide-paragraph">${trimmed.replace(/\n/g, "<br/>")}</p>`;
            })
            .join("\n");
    }

    // =========================================================================
    // 4. STILI CSS ADATTIVI (Light e Dark Mode)
    // =========================================================================
    function injectStyles() {
        if (document.getElementById(CONFIG.STYLES_ID)) return;

        const style = document.createElement("style");
        style.id = CONFIG.STYLES_ID;
        style.textContent = `
            /* =========================================================================
               SWAGGER ACTIVITY BAR & EXTENSIONS GUIDE - STILI GRAFICI MODULARI
               ========================================================================= */

            /* Riserva spazio a sinistra nel body per non sovrapporsi ai contenuti */
            body {
                padding-left: ${CONFIG.BAR_WIDTH_PX}px !important;
                box-sizing: border-box !important;
            }

            /* Contenitore principale Activity Bar (Stile VS Code) */
            #${CONFIG.BAR_ID} {
                --bar-bg: #f8fafc;
                --bar-border: #cbd5e1;
                --bar-icon-color: #1e293b;
                --bar-icon-hover: #0284c7;
                --bar-btn-hover-bg: #e2e8f0;
                --bar-btn-active-bg: #e0f2fe;
                --bar-active-indicator: #0284c7;

                position: fixed;
                top: 0;
                left: 0;
                bottom: 0;
                width: ${CONFIG.BAR_WIDTH_PX}px;
                background: var(--bar-bg);
                border-right: 1px solid var(--bar-border);
                z-index: ${CONFIG.Z_INDEX};
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
                box-sizing: border-box;
                user-select: none;
                transition: background 0.2s ease, border-color 0.2s ease;
            }

            /* Tema Scuro Activity Bar */
            html.dark-mode #${CONFIG.BAR_ID},
            body.dark-mode #${CONFIG.BAR_ID} {
                --bar-bg: #181818;
                --bar-border: #2d2d2d;
                --bar-icon-color: #cbd5e1;
                --bar-icon-hover: #49cc90;
                --bar-btn-hover-bg: #262626;
                --bar-btn-active-bg: #1a2e22;
                --bar-active-indicator: #49cc90;
            }

            .swagger-activity-bar-section {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                width: 100%;
            }

            .swagger-activity-bar-bottom {
                padding-bottom: 6px;
            }

            /* Pulsante Singolo Item */
            .swagger-activity-btn {
                position: relative;
                width: 36px;
                height: 36px;
                border-radius: 6px;
                border: none;
                background: transparent;
                color: var(--bar-icon-color);
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
                padding: 0;
                outline: none;
            }

            .swagger-activity-btn:hover {
                background: var(--bar-btn-hover-bg);
                color: var(--bar-icon-hover);
            }

            .swagger-activity-btn:active {
                transform: scale(0.94);
            }

            .swagger-activity-btn.is-active {
                background: var(--bar-btn-active-bg);
                color: var(--bar-icon-hover);
                box-shadow: inset 3px 0 0 var(--bar-active-indicator);
            }

            .swagger-activity-btn svg {
                display: block;
                stroke: currentColor;
            }

            /* Separatore o indicatore bottom */
            .swagger-activity-indicator {
                font-size: 11px;
                opacity: 0.35;
                user-select: none;
                color: var(--bar-icon-color);
                margin-top: 4px;
            }

            /* =========================================================================
               MODALE EXTENSIONS GUIDE (ID 27) - DESIGN CENTRATO BLUR POPUP
               ========================================================================= */
            .swp-guide-overlay {
                --guide-overlay-bg: rgba(0, 0, 0, 0.55);
                --guide-bg: #ffffff;
                --guide-card-bg: #f8fafc;
                --guide-card-hover: #f1f5f9;
                --guide-border: #cbd5e1;
                --guide-border-light: #e2e8f0;
                --guide-text: #0f172a;
                --guide-text-muted: #64748b;
                --guide-primary: #0284c7;
                --guide-primary-hover: #0369a1;
                --guide-badge-bg: #e0f2fe;
                --guide-badge-text: #0369a1;
                --guide-code-bg: #0f172a;
                --guide-code-text: #f8fafc;

                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: var(--guide-overlay-bg);
                backdrop-filter: blur(4px);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
                animation: swpGuideFadeIn 0.18s ease-out;
            }

            /* Tema Scuro Modale */
            html.dark-mode .swp-guide-overlay,
            body.dark-mode .swp-guide-overlay {
                --guide-overlay-bg: rgba(0, 0, 0, 0.75);
                --guide-bg: #181818;
                --guide-card-bg: #202020;
                --guide-card-hover: #262626;
                --guide-border: #383838;
                --guide-border-light: #2d2d2d;
                --guide-text: #f5f5f5;
                --guide-text-muted: #94a3b8;
                --guide-primary: #38bdf8;
                --guide-primary-hover: #7dd3fc;
                --guide-badge-bg: #1e293b;
                --guide-badge-text: #38bdf8;
                --guide-code-bg: #111111;
                --guide-code-text: #f1f5f9;
            }

            @keyframes swpGuideFadeIn {
                from { opacity: 0; transform: scale(0.98); }
                to { opacity: 1; transform: scale(1); }
            }

            .swp-guide-window {
                width: 720px;
                max-width: 95vw;
                height: 680px;
                max-height: 88vh;
                background: var(--guide-bg);
                color: var(--guide-text);
                border: 1px solid var(--guide-border);
                border-radius: 10px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                box-sizing: border-box;
            }

            /* Header della Modale */
            .swp-guide-header {
                padding: 14px 18px;
                border-bottom: 1px solid var(--guide-border);
                background: var(--guide-card-bg);
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-shrink: 0;
                box-sizing: border-box;
            }

            .swp-guide-header-title {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 15px;
                font-weight: 700;
            }

            .swp-guide-count-chip {
                font-size: 11px;
                font-weight: 600;
                padding: 2px 8px;
                border-radius: 10px;
                background: var(--guide-primary);
                color: #ffffff;
            }

            .swp-guide-header-actions {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .swp-guide-btn-icon {
                background: none;
                border: 1px solid transparent;
                color: var(--guide-text-muted);
                cursor: pointer;
                font-size: 15px;
                padding: 4px 8px;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
            }

            .swp-guide-btn-icon:hover {
                color: var(--guide-text);
                background: var(--guide-border-light);
            }

            .swp-guide-btn-back {
                font-size: 13px;
                font-weight: 600;
                color: var(--guide-primary);
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                border: 1px solid var(--guide-border);
                border-radius: 6px;
                background: var(--guide-bg);
                cursor: pointer;
                transition: all 0.15s ease;
            }

            .swp-guide-btn-back:hover {
                background: var(--guide-card-hover);
                border-color: var(--guide-primary);
            }

            /* Corpo della Modale (Scrollabile) */
            .swp-guide-body {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                padding: 16px 20px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .swp-guide-body::-webkit-scrollbar {
                width: 6px;
            }
            .swp-guide-body::-webkit-scrollbar-thumb {
                background: var(--guide-border);
                border-radius: 3px;
            }

            /* --- VISTA 1: LISTA MASTER ALFABETICA DEI PLUGIN --- */
            .swp-guide-empty {
                padding: 50px 20px;
                text-align: center;
                color: var(--guide-text-muted);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
            }

            .swp-guide-card {
                background: var(--guide-card-bg);
                border: 1px solid var(--guide-border-light);
                border-radius: 8px;
                padding: 14px 16px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: pointer;
                transition: all 0.15s ease;
                user-select: none;
                box-sizing: border-box;
                gap: 14px;
            }

            .swp-guide-card:hover {
                background: var(--guide-card-hover);
                border-color: var(--guide-primary);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            }

            .swp-guide-card-left {
                display: flex;
                align-items: flex-start;
                gap: 14px;
                flex: 1;
                min-width: 0;
            }

            .swp-guide-card-icon {
                width: 38px;
                height: 38px;
                border-radius: 8px;
                background: var(--guide-badge-bg);
                color: var(--guide-badge-text);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .swp-guide-card-icon svg {
                width: 22px;
                height: 22px;
                stroke: currentColor;
            }

            .swp-guide-card-info {
                display: flex;
                flex-direction: column;
                gap: 4px;
                flex: 1;
                min-width: 0;
            }

            .swp-guide-card-title-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .swp-guide-card-name {
                font-size: 14px;
                font-weight: 700;
                color: var(--guide-text);
            }

            .swp-guide-version-badge {
                font-size: 10px;
                font-weight: 600;
                padding: 1px 6px;
                border-radius: 4px;
                background: var(--guide-badge-bg);
                color: var(--guide-badge-text);
            }

            .swp-guide-card-desc {
                font-size: 12px;
                line-height: 1.4;
                color: var(--guide-text-muted);
                margin: 0;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }

            .swp-guide-card-shortcuts {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-top: 4px;
            }

            .swp-guide-kbd-chip {
                font-size: 10px;
                font-weight: 600;
                padding: 1px 6px;
                border-radius: 3px;
                background: var(--guide-bg);
                border: 1px solid var(--guide-border);
                color: var(--guide-text-muted);
                font-family: inherit;
            }

            .swp-guide-card-arrow {
                font-size: 16px;
                color: var(--guide-text-muted);
                transition: transform 0.15s ease, color 0.15s ease;
                flex-shrink: 0;
            }

            .swp-guide-card:hover .swp-guide-card-arrow {
                transform: translateX(3px);
                color: var(--guide-primary);
            }

            /* --- VISTA 2: DETTAGLIO MANUALE D'USO --- */
            .swp-guide-detail-header {
                display: flex;
                align-items: flex-start;
                gap: 16px;
                padding-bottom: 14px;
                border-bottom: 1px solid var(--guide-border-light);
            }

            .swp-guide-detail-icon {
                width: 44px;
                height: 44px;
                border-radius: 10px;
                background: var(--guide-badge-bg);
                color: var(--guide-badge-text);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .swp-guide-detail-icon svg {
                width: 26px;
                height: 26px;
                stroke: currentColor;
            }

            .swp-guide-detail-titles {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .swp-guide-detail-name {
                font-size: 16px;
                font-weight: 700;
                margin: 0;
            }

            .swp-guide-detail-summary {
                font-size: 13px;
                line-height: 1.4;
                color: var(--guide-text-muted);
                margin: 0;
            }

            /* Sezione Scorciatoie */
            .swp-guide-shortcuts-box {
                background: var(--guide-card-bg);
                border: 1px solid var(--guide-border-light);
                border-radius: 6px;
                padding: 10px 14px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .swp-guide-shortcuts-title {
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--guide-text-muted);
            }

            .swp-guide-shortcuts-list {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            .swp-guide-shortcut-pill {
                font-size: 11px;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: var(--guide-bg);
                border: 1px solid var(--guide-border);
                padding: 3px 8px;
                border-radius: 4px;
            }

            .swp-guide-shortcut-pill kbd {
                font-size: 10px;
                font-weight: 700;
                background: var(--guide-card-bg);
                border: 1px solid var(--guide-border);
                border-radius: 3px;
                padding: 1px 4px;
                font-family: inherit;
            }

            /* Rendering Markdown Dettaglio */
            .swp-guide-markdown-content {
                font-size: 13px;
                line-height: 1.6;
                color: var(--guide-text);
            }

            .swp-guide-markdown-content h3.guide-heading-3 {
                font-size: 15px;
                font-weight: 700;
                margin: 16px 0 8px 0;
                border-bottom: 1px solid var(--guide-border-light);
                padding-bottom: 4px;
            }

            .swp-guide-markdown-content h4.guide-heading-4 {
                font-size: 13px;
                font-weight: 700;
                margin: 12px 0 6px 0;
            }

            .swp-guide-markdown-content p.guide-paragraph {
                margin: 0 0 10px 0;
            }

            .swp-guide-markdown-content ul.guide-list {
                margin: 0 0 12px 18px;
                padding: 0;
            }

            .swp-guide-markdown-content li.guide-list-item {
                margin-bottom: 4px;
            }

            .swp-guide-markdown-content code.guide-code-inline {
                background: var(--guide-card-bg);
                border: 1px solid var(--guide-border-light);
                padding: 1px 5px;
                border-radius: 3px;
                font-family: Consolas, Monaco, monospace;
                font-size: 12px;
                color: var(--guide-primary);
            }

            .swp-guide-markdown-content pre.guide-code-block {
                background: var(--guide-code-bg);
                color: var(--guide-code-text);
                padding: 10px 12px;
                border-radius: 6px;
                font-family: Consolas, Monaco, monospace;
                font-size: 12px;
                line-height: 1.4;
                overflow-x: auto;
                margin: 10px 0;
            }

            .swp-guide-markdown-content .guide-alert {
                padding: 8px 12px;
                border-radius: 6px;
                margin: 10px 0;
                border-left: 4px solid var(--guide-primary);
                background: var(--guide-badge-bg);
                font-size: 12px;
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================================================
    // 5. RENDERING E MONTAGGIO DOM ACTIVITY BAR
    // =========================================================================
    function mountActivityBar() {
        if (document.getElementById(CONFIG.BAR_ID)) return;

        const bar = document.createElement("aside");
        bar.id = CONFIG.BAR_ID;
        bar.className = "swagger-activity-bar";
        bar.setAttribute("aria-label", "Swagger Activity Bar");

        bar.innerHTML = `
            <div class="swagger-activity-bar-section swagger-activity-bar-top" id="swagger-activity-bar-top"></div>
            <div class="swagger-activity-bar-section swagger-activity-bar-bottom" id="swagger-activity-bar-bottom">
                <span class="swagger-activity-indicator" title="Swagger Activity Bar">⚡</span>
            </div>
        `;

        document.body.appendChild(bar);
        isMounted = true;

        // Registra automaticamente il pulsante di sistema Extensions Guide in fondo (section: bottom)
        registerSystemGuideButton();

        // Renderizza tutti gli item registrati
        renderAllItems();
    }

    /**
     * Registra il pulsante di sistema per l'Extensions Guide in fondo all'Activity Bar.
     */
    function registerSystemGuideButton() {
        api.registerItem({
            id: "extensions-guide",
            title: "Swagger UI Plugins Suite — Plugin & Guida Interattiva",
            ariaLabel: "Plugin e Guida Interattiva",
            iconHtml: `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.5 2.5 0 0 1 0 5H2V20a2 2 0 0 0 2 2h4v-1.5a2.5 2.5 0 0 1 5 0V22h4a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/>
                </svg>
            `,
            onClick: () => toggleGuideModal(),
            section: "bottom",
            order: 99
        });
    }

    /**
     * Renderizza o riordina tutti gli item registrati nella barra.
     */
    function renderAllItems() {
        if (!isMounted) return;

        const topContainer = document.getElementById("swagger-activity-bar-top");
        const bottomContainer = document.getElementById("swagger-activity-bar-bottom");
        if (!topContainer || !bottomContainer) return;

        topContainer.innerHTML = "";
        const oldBottomItems = bottomContainer.querySelectorAll(".swagger-activity-btn");
        oldBottomItems.forEach((el) => el.remove());

        const itemsList = Array.from(registeredItems.values()).sort((a, b) => (a.order || 100) - (b.order || 100));

        itemsList.forEach((item) => {
            const btn = createItemButton(item);
            if (item.section === "bottom") {
                const indicator = bottomContainer.querySelector(".swagger-activity-indicator");
                if (indicator) bottomContainer.insertBefore(btn, indicator);
                else bottomContainer.appendChild(btn);
            } else {
                topContainer.appendChild(btn);
            }
        });
    }

    /**
     * Crea l'elemento pulsante per un singolo item.
     * @param {Object} item
     * @returns {HTMLButtonElement}
     */
    function createItemButton(item) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = `activity-btn-${item.id}`;
        btn.className = `swagger-activity-btn activity-btn-${item.id}${item.isActive ? " is-active" : ""}`;
        btn.title = item.title || "";
        btn.setAttribute("aria-label", item.ariaLabel || item.title || item.id);
        btn.innerHTML = item.iconHtml || "";

        btn.addEventListener("click", (e) => {
            if (typeof item.onClick === "function") {
                item.onClick(e, btn);
            }
        });

        return btn;
    }

    // =========================================================================
    // 6. GESTIONE MODALE EXTENSIONS GUIDE (ID 27 - Master-Detail)
    // =========================================================================

    /**
     * Mostra o nasconde la modale della guida plugin.
     * @param {boolean} [forceState]
     */
    function toggleGuideModal(forceState) {
        const nextState = typeof forceState === "boolean" ? forceState : !isGuideModalOpen;
        isGuideModalOpen = nextState;

        // Se chiudiamo, rimuovi la modale dal DOM
        if (!nextState) {
            currentDetailGuideId = null;
            document.getElementById(CONFIG.MODAL_ID)?.remove();
            api.setItemActive("extensions-guide", false);
            return;
        }

        api.setItemActive("extensions-guide", true);
        renderGuideModalDom();
    }

    /**
     * Monta o ri-renderizza il DOM della modale.
     */
    function renderGuideModalDom() {
        let overlay = document.getElementById(CONFIG.MODAL_ID);
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = CONFIG.MODAL_ID;
            overlay.className = "swp-guide-overlay";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");

            // Chiusura al click sul backdrop sfocato esterno
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) {
                    toggleGuideModal(false);
                }
            });

            // Gestione tasto ESC: se in dettaglio torna a lista; se in lista chiude
            window.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && isGuideModalOpen) {
                    if (currentDetailGuideId) {
                        currentDetailGuideId = null;
                        renderGuideModalContent();
                    } else {
                        toggleGuideModal(false);
                    }
                }
            });

            document.body.appendChild(overlay);
        }

        renderGuideModalContent();
    }

    let renderModalRafId = null;

    /**
     * Pianifica un aggiornamento asincrono della modale via requestAnimationFrame.
     * Previene deadlock, loop infiniti e thrashing in caso di registrazioni consecutive.
     */
    function scheduleGuideModalRender() {
        if (renderModalRafId) return;
        renderModalRafId = window.requestAnimationFrame(() => {
            renderModalRafId = null;
            if (isGuideModalOpen) {
                renderGuideModalContent();
            }
        });
    }

    /**
     * Renderizza il contenuto della modale (Vista Master o Vista Detail).
     */
    function renderGuideModalContent() {
        const overlay = document.getElementById(CONFIG.MODAL_ID);
        if (!overlay) return;

        const guides = api.getRegisteredGuides();

        if (currentDetailGuideId) {
            const guide = registeredGuides.get(currentDetailGuideId);
            if (guide) {
                renderDetailView(overlay, guide);
                return;
            }
        }

        // Vista Master (Lista Alfabetica)
        renderMasterView(overlay, guides);
    }

    /**
     * Renderizza la vista Master con l'elenco alfabetico delle schede.
     * @param {HTMLElement} overlay
     * @param {Array<Object>} guides
     */
    function renderMasterView(overlay, guides) {
        overlay.innerHTML = `
            <div class="swp-guide-window" onclick="event.stopPropagation();">
                <!-- Header Master -->
                <div class="swp-guide-header">
                    <div class="swp-guide-header-title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.5 2.5 0 0 1 0 5H2V20a2 2 0 0 0 2 2h4v-1.5a2.5 2.5 0 0 1 5 0V22h4a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/>
                        </svg>
                        <span>Swagger UI Plugins Suite — Plugin & Guida</span>
                        <span class="swp-guide-count-chip">${guides.length} attivi</span>
                    </div>
                    <div class="swp-guide-header-actions">
                        <button type="button" class="swp-guide-btn-icon swp-guide-btn-close" title="Chiudi modale (Esc)">✕</button>
                    </div>
                </div>

                <!-- Body Lista Master -->
                <div class="swp-guide-body">
                    ${guides.length === 0 ? `
                        <div class="swp-guide-empty">
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <p><strong>Nessun plugin ha ancora registrato la propria guida.</strong></p>
                            <span>I plugin della suite espongono la documentazione tramite <code>window.SwaggerActivityBar.registerPluginGuide()</code>.</span>
                        </div>
                    ` : guides.map((g) => `
                        <div class="swp-guide-card" data-guide-id="${escapeHtml(g.id)}">
                            <div class="swp-guide-card-left">
                                <div class="swp-guide-card-icon">
                                    ${g.iconHtml || `
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                                        </svg>
                                    `}
                                </div>
                                <div class="swp-guide-card-info">
                                    <div class="swp-guide-card-title-row">
                                        <span class="swp-guide-card-name">${escapeHtml(g.name)}</span>
                                        <span class="swp-guide-version-badge">v${escapeHtml(g.version)}</span>
                                    </div>
                                    <p class="swp-guide-card-desc">${escapeHtml(g.description)}</p>
                                    ${g.shortcuts && g.shortcuts.length > 0 ? `
                                        <div class="swp-guide-card-shortcuts">
                                            ${g.shortcuts.slice(0, 3).map((s) => {
                                                const parsed = parseShortcut(s);
                                                return `<span class="swp-guide-kbd-chip"><kbd>${escapeHtml(parsed.key)}</kbd></span>`;
                                            }).join("")}
                                        </div>
                                    ` : ""}
                                </div>
                            </div>
                            <div class="swp-guide-card-arrow">→</div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;

        // Event listener chiusura
        overlay.querySelector(".swp-guide-btn-close")?.addEventListener("click", () => toggleGuideModal(false));

        // Click su card per aprire la vista di dettaglio
        overlay.querySelectorAll(".swp-guide-card").forEach((card) => {
            card.addEventListener("click", () => {
                const guideId = card.getAttribute("data-guide-id");
                if (guideId) {
                    currentDetailGuideId = guideId;
                    renderGuideModalContent();
                }
            });
        });
    }

    /**
     * Renderizza la vista Detail con pulsante [← Indietro] e il manuale Markdown.
     * @param {HTMLElement} overlay
     * @param {Object} guide
     */
    function renderDetailView(overlay, guide) {
        const renderedManual = renderMarkdownToHtml(guide.manual || guide.description);

        overlay.innerHTML = `
            <div class="swp-guide-window" onclick="event.stopPropagation();">
                <!-- Header Detail con tasto Indietro -->
                <div class="swp-guide-header">
                    <button type="button" class="swp-guide-btn-back" title="Torna alla lista dei plugin">
                        ← Indietro
                    </button>
                    <div class="swp-guide-header-title">
                        <span>${escapeHtml(guide.name)}</span>
                        <span class="swp-guide-version-badge">v${escapeHtml(guide.version)}</span>
                    </div>
                    <div class="swp-guide-header-actions">
                        <button type="button" class="swp-guide-btn-icon swp-guide-btn-close" title="Chiudi modale (Esc)">✕</button>
                    </div>
                </div>

                <!-- Body Detail -->
                <div class="swp-guide-body">
                    <!-- Intestazione Plugin -->
                    <div class="swp-guide-detail-header">
                        <div class="swp-guide-detail-icon">
                            ${guide.iconHtml || `
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                                </svg>
                            `}
                        </div>
                        <div class="swp-guide-detail-titles">
                            <h3 class="swp-guide-detail-name">${escapeHtml(guide.name)}</h3>
                            <p class="swp-guide-detail-summary">${escapeHtml(guide.description)}</p>
                        </div>
                    </div>

                    <!-- Box Scorciatoie da tastiera (se presenti) -->
                    ${guide.shortcuts && guide.shortcuts.length > 0 ? `
                        <div class="swp-guide-shortcuts-box">
                            <span class="swp-guide-shortcuts-title">Scorciatoie & Comandi Rapidi:</span>
                            <div class="swp-guide-shortcuts-list">
                                ${guide.shortcuts.map((sc) => {
                                    const parsed = parseShortcut(sc);
                                    if (parsed.desc) {
                                        return `<div class="swp-guide-shortcut-pill"><kbd>${escapeHtml(parsed.key)}</kbd> <span>${escapeHtml(parsed.desc)}</span></div>`;
                                    }
                                    return `<div class="swp-guide-shortcut-pill"><kbd>${escapeHtml(parsed.key)}</kbd></div>`;
                                }).join("")}
                            </div>
                        </div>
                    ` : ""}

                    <!-- Manuale d'uso renderizzato da Markdown -->
                    <div class="swp-guide-markdown-content">
                        ${renderedManual}
                    </div>
                </div>
            </div>
        `;

        // Event listener tasto indietro
        overlay.querySelector(".swp-guide-btn-back")?.addEventListener("click", () => {
            currentDetailGuideId = null;
            renderGuideModalContent();
        });

        // Event listener chiusura
        overlay.querySelector(".swp-guide-btn-close")?.addEventListener("click", () => toggleGuideModal(false));
    }

    // =========================================================================
    // 7. API PUBBLICA WINDOW.SWAGGERACTIVITYBAR
    // =========================================================================
    const api = {
        /**
         * Ritorna true per confermare che l'Activity Bar è disponibile.
         * @returns {boolean}
         */
        isAvailable() {
            return true;
        },

        /**
         * Registra un nuovo pulsante nella barra laterale.
         * @param {Object} options
         * @param {string} options.id - Identificativo univoco
         * @param {string} [options.title] - Testo tooltip al passaggio del mouse
         * @param {string} options.iconHtml - Markup HTML dell'icona (preferibilmente SVG per alta nitidezza)
         * @param {Function} options.onClick - Callback click
         * @param {"top"|"bottom"} [options.section="top"] - Sezione di collocamento
         * @param {number} [options.order=100] - Priorità di ordinamento (valori bassi in alto)
         * @param {string} [options.ariaLabel] - Descrizione accessibilità
         * @param {boolean} [options.isActive=false] - Stato attivo iniziale
         * @returns {HTMLElement|null}
         */
        registerItem(options) {
            if (!options || !options.id) {
                console.warn("[SwaggerActivityBar] Impossibile registrare item privo di 'id'.", options);
                return null;
            }

            const item = {
                id: options.id,
                title: options.title || "",
                iconHtml: options.iconHtml || "",
                onClick: options.onClick || null,
                section: options.section === "bottom" ? "bottom" : "top",
                order: typeof options.order === "number" ? options.order : 100,
                ariaLabel: options.ariaLabel || options.title || options.id,
                isActive: Boolean(options.isActive)
            };

            registeredItems.set(item.id, item);

            if (isMounted) {
                renderAllItems();
                return document.getElementById(`activity-btn-${item.id}`);
            }
            return null;
        },

        /**
         * Alias di convenienza per `registerItem`.
         * @param {Object} options
         * @returns {HTMLElement|null}
         */
        registerButton(options) {
            return this.registerItem(options);
        },

        /**
         * Rimuove un elemento registrato dall'Activity Bar.
         * @param {string} id
         */
        unregisterItem(id) {
            if (registeredItems.delete(id)) {
                if (isMounted) {
                    const btn = document.getElementById(`activity-btn-${id}`);
                    if (btn) btn.remove();
                }
            }
        },

        /**
         * Modifica lo stato attivo (evidenziato/selezionato) di un pulsante.
         * @param {string} id
         * @param {boolean} isActive
         */
        setItemActive(id, isActive) {
            const item = registeredItems.get(id);
            if (item) {
                item.isActive = Boolean(isActive);
            }
            const btn = document.getElementById(`activity-btn-${id}`);
            if (btn) {
                btn.classList.toggle("is-active", Boolean(isActive));
            }
        },

        /**
         * Aggiorna parzialmente il markup o il titolo di un elemento registrato.
         * @param {string} id
         * @param {Object} updates
         */
        updateItem(id, updates) {
            const item = registeredItems.get(id);
            if (!item) return;

            if (updates.title !== undefined) item.title = updates.title;
            if (updates.iconHtml !== undefined) item.iconHtml = updates.iconHtml;
            if (updates.isActive !== undefined) item.isActive = Boolean(updates.isActive);

            const btn = document.getElementById(`activity-btn-${id}`);
            if (btn) {
                if (updates.title !== undefined) btn.title = item.title;
                if (updates.iconHtml !== undefined) btn.innerHTML = item.iconHtml;
                if (updates.isActive !== undefined) btn.classList.toggle("is-active", item.isActive);
            }
        },

        /**
         * Restituisce l'elemento DOM del pulsante registrato.
         * @param {string} id
         * @returns {HTMLElement|null}
         */
        getItemElement(id) {
            return document.getElementById(`activity-btn-${id}`);
        },

        /**
         * Registra la documentazione/guida d'uso di un plugin per la modale Extensions Guide (ID 27).
         * @param {Object} guideOptions
         * @param {string} guideOptions.id - Identificativo univoco del plugin
         * @param {string} guideOptions.name - Nome visualizzato
         * @param {string} [guideOptions.version="1.0.0"] - Versione del plugin
         * @param {string} [guideOptions.description=""] - Sintesi in 1-2 frasi
         * @param {string} [guideOptions.manual=""] - Testo dettagliato formattato in Markdown
         * @param {Array<string>} [guideOptions.shortcuts=[]] - Elenco scorciatoie (es. ["Ctrl + K: Cerca", "Esc: Chiudi"])
         * @param {string} [guideOptions.iconHtml=""] - Icona SVG rappresentativa
         */
        registerPluginGuide(guideOptions) {
            if (!guideOptions || !guideOptions.id) {
                console.warn("[SwaggerActivityBar] Impossibile registrare guida plugin priva di 'id'.", guideOptions);
                return;
            }

            // Evita registrazioni duplicate o chiamate cicliche
            if (registeredGuides.has(guideOptions.id)) {
                return;
            }

            registeredGuides.set(guideOptions.id, {
                id: guideOptions.id,
                name: guideOptions.name || guideOptions.id,
                version: guideOptions.version || "1.0.0",
                description: guideOptions.description || "",
                manual: guideOptions.manual || guideOptions.description || "",
                shortcuts: Array.isArray(guideOptions.shortcuts) ? guideOptions.shortcuts : [],
                iconHtml: guideOptions.iconHtml || ""
            });

            // Se la modale è correntemente aperta, pianifica un aggiornamento asincrono debouncato
            if (isGuideModalOpen) {
                scheduleGuideModalRender();
            }
        },

        /**
         * Restituisce l'elenco ordinato alfabeticamente di tutte le guide registrate.
         * @returns {Array<Object>}
         */
        getRegisteredGuides() {
            return Array.from(registeredGuides.values()).sort((a, b) => a.name.localeCompare(b.name));
        },

        /**
         * Apre o chiude programmaticamente la modale Extensions Guide.
         * @param {boolean} [forceState]
         */
        toggleGuideModal(forceState) {
            toggleGuideModal(forceState);
        }
    };

    // Espone l'API globale
    window.SwaggerActivityBar = api;

    // Registra la documentazione dell'Activity Bar stessa nella Guida Estensioni
    api.registerPluginGuide({
        id: "swp-activity-bar",
        name: "Activity Bar & Extension Host",
        version: "1.0.0",
        description: "Barra laterale verticale stile VS Code per ospitare pulsanti, badge, pannelli e la guida interattiva delle estensioni Swagger UI.",
        iconHtml: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="3" x2="9" y2="21"></line>
        </svg>`,
        shortcuts: [
            "Esc: Chiude qualsiasi pannello dock aperto o la modale della guida"
        ],
        manual: `### Cos'è l'Activity Bar?
L'**Activity Bar** è l'host centrale dell'architettura a plugin per Swagger UI.
Ispirata alla barra delle attività di moderni IDE (es. Visual Studio Code), fornisce:
- Una barra laterale compatta ad alto contrasto con supporto automatico sia al tema chiaro che scuro.
- Slot per registrare pulsanti con icone vettoriali SVG, tooltip e contatori/badge dinamici.
- Supporto a pannelli docked a comparsa laterale (es. *Network History*, *SignalR Tester*).
- Gestione coordinata dello z-index, prevenzione delle sovrapposizioni e pulsante fisso in basso per la **Guida Estensioni** (icona 🧩).

### Come registrare un pulsante con pannello
I plugin possono agganciarsi all'Activity Bar tramite l'oggetto globale \`window.SwaggerActivityBar\`:

\`\`\`javascript
window.SwaggerActivityBar.registerItem({
    id: "mio-plugin",
    title: "Mio Plugin",
    iconHtml: "<svg>...</svg>",
    badge: 0,
    section: "top", // "top" oppure "bottom"
    order: 10,
    onClick: (e, btn) => { ... }
});
\`\`\`

### Come registrare la guida di un plugin
Tutti i plugin possono documentare funzionalità e shortcut registrandosi nella guida:

\`\`\`javascript
window.SwaggerActivityBar.registerPluginGuide({
    id: "mio-plugin",
    name: "Mio Plugin",
    version: "1.0.0",
    description: "Breve sommario",
    shortcuts: ["Ctrl + K: Esempio scorciatoia"],
    manual: "Guida in formato Markdown..."
});
\`\`\`

### Evento di sincronizzazione
Se un plugin viene caricato prima dell'Activity Bar, può registrarsi non appena scatta l'evento:
\`\`\`javascript
window.addEventListener("swagger-activity-bar:ready", (e) => {
    const activityBar = e.detail;
    // Registra pulsanti e documentazione
});
\`\`\``
    });

    // Notifica eventuali listener in ascolto che l'API è disponibile
    window.dispatchEvent(new CustomEvent("swagger-activity-bar:ready", { detail: api }));

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
                mountActivityBar();

                // Observer per mantenere l'Activity Bar in caso di re-render completo di Swagger UI
                const observer = new MutationObserver(() => {
                    if (!document.getElementById(CONFIG.BAR_ID)) {
                        mountActivityBar();
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });

                console.info("[Swagger Activity Bar] Modulo Activity Bar & Extensions Guide inizializzato con successo.");
            }

            if (Date.now() - startTime >= 30000) {
                window.clearInterval(checkInterval);
            }
        }, 200);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
})();
