(() => {
    "use strict";

    // Host configuration support
    const userConfig = window.SwaggerPrettyJsonConfig || {};
    const INDENT_SPACES = typeof userConfig.indent === "number" ? userConfig.indent : 2;
    const INITIAL_EXPAND_DEPTH = typeof userConfig.initialExpandDepth === "number" ? userConfig.initialExpandDepth : 2;
    const LONG_STRING_THRESHOLD = typeof userConfig.truncateStringLength === "number" ? userConfig.truncateStringLength : 250;
    const TRUNCATE_PREVIEW_LENGTH = Math.min(120, Math.max(30, Math.floor(LONG_STRING_THRESHOLD / 2)));

    const ROOT_CLASS = "custom-json-view";
    const STYLE_ID = "custom-json-view-style";

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;

        style.textContent = `
      .${ROOT_CLASS} {
        --json-method-color: #64748b;
        --json-method-background: rgba(100, 116, 139, 0.1);

        --json-background: var(--json-method-background);
        --json-foreground: #202124;
        --json-border: var(--json-method-color);
        --json-toolbar: var(--json-method-background);
        --json-hover: var(--json-method-background);
        --json-copy-btn-bg: rgba(0, 0, 0, 0.05);
        --json-copy-btn-hover: rgba(0, 0, 0, 0.12);

        --json-key: #922;
        --json-string: #067d17;
        --json-number: #075985;
        --json-boolean: #6d28d9;
        --json-null: #777777;
        --json-punctuation: #555555;

        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        margin: 8px 0;
        overflow: hidden;
        border: 1px solid var(--json-border);
        border-radius: 4px;
        background: var(--json-background);
        color: var(--json-foreground);
        font-family: Consolas, Monaco, "Courier New", monospace;
        font-size: 12px;
        line-height: 1.6;
        color-scheme: light;
      }

      .${ROOT_CLASS} *,
      .${ROOT_CLASS} *::before,
      .${ROOT_CLASS} *::after {
        box-sizing: border-box;
      }

      .${ROOT_CLASS}--get {
        --json-method-color: #61affe;
        --json-method-background: rgba(97, 175, 254, 0.1);
      }

      .${ROOT_CLASS}--post {
        --json-method-color: #49cc90;
        --json-method-background: rgba(73, 204, 144, 0.1);
      }

      .${ROOT_CLASS}--put {
        --json-method-color: #fca130;
        --json-method-background: rgba(252, 161, 48, 0.1);
      }

      .${ROOT_CLASS}--delete {
        --json-method-color: #f93e3e;
        --json-method-background: rgba(249, 62, 62, 0.1);
      }

      .${ROOT_CLASS}--patch {
        --json-method-color: #50e3c2;
        --json-method-background: rgba(80, 227, 194, 0.1);
      }

      .${ROOT_CLASS}--head {
        --json-method-color: #9012fe;
        --json-method-background: rgba(144, 18, 254, 0.1);
      }

      .${ROOT_CLASS}--options {
        --json-method-color: #0d5aa7;
        --json-method-background: rgba(13, 90, 167, 0.1);
      }

      .${ROOT_CLASS}--trace {
        --json-method-color: #9012fe;
        --json-method-background: rgba(144, 18, 254, 0.1);
      }

      .${ROOT_CLASS}--default {
        --json-method-color: #64748b;
        --json-method-background: rgba(100, 116, 139, 0.1);
      }

      html.dark-mode .${ROOT_CLASS},
      body.dark-mode .${ROOT_CLASS},
      .${ROOT_CLASS}--dark {
        --json-background: color-mix(
          in srgb,
          var(--json-method-color) 12%,
          #101010
        );
        --json-foreground: #e5e7eb;
        --json-toolbar: color-mix(
          in srgb,
          var(--json-method-color) 50%,
          #202020
        );
        --json-hover: color-mix(
          in srgb,
          var(--json-method-color) 30%,
          #303030
        );
        --json-copy-btn-bg: rgba(255, 255, 255, 0.1);
        --json-copy-btn-hover: rgba(255, 255, 255, 0.22);

        --json-key: #93c5fd;
        --json-string: #86efac;
        --json-number: #67e8f9;
        --json-boolean: #c4b5fd;
        --json-null: #cbd5e1;
        --json-punctuation: #cbd5e1;

        color-scheme: dark;
      }

      .${ROOT_CLASS}__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        border-bottom: 1px solid var(--json-border);
        background: var(--json-toolbar);
        color: var(--json-foreground);
        font-family: Arial, sans-serif;
        font-size: 12px;
      }

      .${ROOT_CLASS}__label {
        color: var(--json-foreground);
        font-weight: 600;
      }

      .${ROOT_CLASS}__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .${ROOT_CLASS}__button {
        cursor: pointer;
        padding: 3px 8px;
        border: 1px solid var(--json-border);
        border-radius: 3px;
        background: var(--json-background);
        color: var(--json-foreground);
        font-family: Arial, sans-serif;
        font-size: 12px;
      }

      .${ROOT_CLASS}__button:hover {
        background: var(--json-hover);
      }

      .${ROOT_CLASS}__body {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        max-height: 520px;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 8px 10px;
        background: var(--json-background);
        color: var(--json-foreground);
      }

      .${ROOT_CLASS}__tree {
        margin: 0;
        padding: 0;
      }

      .${ROOT_CLASS}__node {
        margin: 0;
        padding: 0 0 0 16px;
      }

      .${ROOT_CLASS}__node > summary {
        position: relative;
        cursor: pointer;
        list-style: none;
        outline: none;
        padding-right: 50px;
        color: var(--json-foreground);
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
      }

      .${ROOT_CLASS}__node > summary::-webkit-details-marker {
        display: none;
      }

      .${ROOT_CLASS}__node > summary::marker {
        display: none;
      }

      .${ROOT_CLASS}__node > summary::before {
        display: inline-block;
        width: 14px;
        color: var(--json-foreground);
        content: "▸";
      }

      .${ROOT_CLASS}__node[open] > summary::before {
        content: "▾";
      }

      .${ROOT_CLASS}__node > summary:hover {
        background: var(--json-hover);
      }

      .${ROOT_CLASS}__children {
        margin-left: 8px;
        padding-left: 8px;
        border-left: 1px dotted var(--json-border);
      }

      .${ROOT_CLASS}__property {
        position: relative;
        min-height: 1.6em;
        margin: 1px 0;
        padding-left: 16px;
        padding-right: 50px;
        color: var(--json-foreground);
        white-space: pre-wrap;
        word-break: break-all;
        overflow-wrap: anywhere;
      }

      .${ROOT_CLASS}__key {
        color: var(--json-key) !important;
        word-break: break-word;
        overflow-wrap: anywhere;
      }

      .${ROOT_CLASS}__string {
        color: var(--json-string) !important;
        white-space: pre-wrap;
        word-break: break-all;
        overflow-wrap: anywhere;
      }

      .${ROOT_CLASS}__number {
        color: var(--json-number) !important;
      }

      .${ROOT_CLASS}__boolean {
        color: var(--json-boolean) !important;
      }

      .${ROOT_CLASS}__null {
        color: var(--json-null) !important;
        font-style: italic;
      }

      .${ROOT_CLASS}__punctuation {
        color: var(--json-punctuation) !important;
      }

      .${ROOT_CLASS}__preview {
        color: var(--json-punctuation) !important;
        opacity: 0.85;
      }

      /* Single-line value copy button */
      .${ROOT_CLASS}__copy-btn {
        position: absolute;
        right: 4px;
        top: 1px;
        opacity: 0;
        cursor: pointer;
        padding: 1px 6px;
        border: 1px solid var(--json-border);
        border-radius: 3px;
        background: var(--json-copy-btn-bg);
        color: var(--json-foreground);
        font-family: Arial, sans-serif;
        font-size: 10px;
        line-height: 1.3;
        transition: opacity 0.15s ease, background 0.15s ease;
        user-select: none;
        z-index: 2;
      }

      .${ROOT_CLASS}__property:hover > .${ROOT_CLASS}__copy-btn,
      .${ROOT_CLASS}__node > summary:hover > .${ROOT_CLASS}__copy-btn {
        opacity: 0.85;
      }

      .${ROOT_CLASS}__copy-btn:hover {
        opacity: 1 !important;
        background: var(--json-copy-btn-hover);
      }

      /* Show all toggle for long strings */
      .${ROOT_CLASS}__toggle-expand {
        cursor: pointer;
        margin-left: 6px;
        padding: 0 4px;
        font-size: 10px;
        border-radius: 3px;
        border: 1px solid var(--json-border);
        background: var(--json-copy-btn-bg);
        color: var(--json-foreground);
        opacity: 0.85;
        vertical-align: middle;
      }

      .${ROOT_CLASS}__toggle-expand:hover {
        opacity: 1;
        background: var(--json-hover);
      }

      /* Protection for Swagger UI table against horizontal overflow */
      .swagger-ui .responses-table .response-col_description {
        max-width: 0;
        width: 100%;
        overflow-wrap: anywhere;
      }

      /* Vista originale Swagger */
      .${ROOT_CLASS}__original {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        max-height: 520px;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 10px;
        background: rgb(51, 51, 51) !important;
        background-color: rgb(51, 51, 51) !important;
        color: white !important;
      }

      .${ROOT_CLASS}__original > * {
        display: block !important;
        background: rgb(51, 51, 51) !important;
        background-color: rgb(51, 51, 51) !important;
        color: white !important;
      }

      .${ROOT_CLASS}__original .${ROOT_CLASS}__original-swagger {
        display: block !important;
      }

      .${ROOT_CLASS}__original pre,
      .${ROOT_CLASS}__original code,
      .${ROOT_CLASS}__original .microlight {
        display: block !important;
        margin: 0 !important;
        white-space: pre-wrap !important;
        word-break: break-all !important;
        overflow-wrap: anywhere !important;
        background: rgb(51, 51, 51) !important;
        background-color: rgb(51, 51, 51) !important;
        color: white !important;
      }

      .${ROOT_CLASS}__original pre span,
      .${ROOT_CLASS}__original code span,
      .${ROOT_CLASS}__original .microlight span {
        background-color: transparent !important;
      }

      /* Nasconde i pulsanti duplicati/flottanti originali di Swagger UI nel riquadro scuro */
      .${ROOT_CLASS}__original .copy-to-clipboard,
      .${ROOT_CLASS}__original .download-contents,
      .${ROOT_CLASS}__original .copy-to-clipboard__btn,
      .${ROOT_CLASS}__original .download-contents__btn {
        display: none !important;
      }
    `;

        document.head.appendChild(style);
    }

    function createSpan(className, text) {
        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        return span;
    }

    function formatPrimitive(value) {
        if (typeof value === "string") {
            const escaped = JSON.stringify(value);

            if (value.length <= LONG_STRING_THRESHOLD) {
                return createSpan(`${ROOT_CLASS}__string`, escaped);
            }

            // Gestione stringhe molto lunghe (es. Base64 di immagini, token JWT)
            const container = document.createElement("span");
            container.className = `${ROOT_CLASS}__string-wrapper`;

            const textSpan = createSpan(`${ROOT_CLASS}__string`, "");
            const truncatedEscaped = JSON.stringify(value.slice(0, TRUNCATE_PREVIEW_LENGTH))
                .replace(/"$/, "…\"");

            let isExpanded = false;
            textSpan.textContent = truncatedEscaped;

            const toggleBtn = document.createElement("button");
            toggleBtn.type = "button";
            toggleBtn.className = `${ROOT_CLASS}__toggle-expand`;

            const sizeKB = (value.length / 1024).toFixed(1);
            const sizeLabel = parseFloat(sizeKB) > 0 ? `${sizeKB} KB` : `${value.length} car.`;
            toggleBtn.textContent = `[+ ${sizeLabel} - Show all]`;
            toggleBtn.title = "Espandi/Comprimi testo completo";

            toggleBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                isExpanded = !isExpanded;
                if (isExpanded) {
                    textSpan.textContent = escaped;
                    toggleBtn.textContent = "[Collapse]";
                } else {
                    textSpan.textContent = truncatedEscaped;
                    toggleBtn.textContent = `[+ ${sizeLabel} - Show full]`;
                }
            });

            container.appendChild(textSpan);
            container.appendChild(toggleBtn);
            return container;
        }

        if (typeof value === "number") {
            return createSpan(
                `${ROOT_CLASS}__number`,
                String(value)
            );
        }

        if (typeof value === "boolean") {
            return createSpan(
                `${ROOT_CLASS}__boolean`,
                String(value)
            );
        }

        if (value === null) {
            return createSpan(
                `${ROOT_CLASS}__null`,
                "null"
            );
        }

        return createSpan(
            `${ROOT_CLASS}__string`,
            JSON.stringify(value)
        );
    }

    function getPreview(value) {
        if (Array.isArray(value)) {
            const count = value.length;
            return `(${count} item${count === 1 ? "" : "s"})`;
        }

        if (value !== null && typeof value === "object") {
            const count = Object.keys(value).length;
            return `(${count} propert${count === 1 ? "y" : "ies"})`;
        }

        return "";
    }

    function createInlineCopyButton(getValueCallback, tooltip = "Copy value") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `${ROOT_CLASS}__copy-btn`;
        btn.title = tooltip;
        btn.textContent = "Copy";
        btn.setAttribute("aria-label", tooltip);

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            const val = getValueCallback();
            copyText(val, btn, "✓");
        });

        return btn;
    }

    function renderNode(value, name, initiallyOpen, isRoot = false, path = []) {
        const isObject =
            value !== null &&
            typeof value === "object";

        if (!isObject) {
            const row = document.createElement("div");
            row.className = `${ROOT_CLASS}__property`;

            if (name !== null) {
                row.appendChild(
                    createSpan(
                        `${ROOT_CLASS}__key`,
                        `"${name}"`
                    )
                );

                row.appendChild(
                    createSpan(
                        `${ROOT_CLASS}__punctuation`,
                        ": "
                    )
                );
            }

            row.appendChild(formatPrimitive(value));

            // Copy raw primitive value (without extra quotes)
            const rawValue = typeof value === "string" ? value : String(value);
            row.appendChild(createInlineCopyButton(() => rawValue, "Copy value"));

            return row;
        }

        const details = document.createElement("details");
        details.className = `${ROOT_CLASS}__node`;
        details.open = isRoot ? (INITIAL_EXPAND_DEPTH > 0 ? initiallyOpen : false) : initiallyOpen;

        const currentPath = isRoot
            ? []
            : [...path, name];

        details.dataset.jsonPath =
            JSON.stringify(currentPath);

        const summary = document.createElement("summary");

        if (!isRoot && name !== null) {
            summary.appendChild(
                createSpan(
                    `${ROOT_CLASS}__key`,
                    `"${name}"`
                )
            );

            summary.appendChild(
                createSpan(
                    `${ROOT_CLASS}__punctuation`,
                    ": "
                )
            );
        }

        summary.appendChild(
            createSpan(
                `${ROOT_CLASS}__punctuation`,
                Array.isArray(value) ? "[" : "{"
            )
        );

        summary.appendChild(
            createSpan(
                `${ROOT_CLASS}__preview`,
                ` ${getPreview(value)}`
            )
        );

        // Copia intero sotto-albero serializzato come JSON formattato
        summary.appendChild(
            createInlineCopyButton(
                () => JSON.stringify(value, null, INDENT_SPACES),
                "Copy subtree JSON"
            )
        );

        details.appendChild(summary);

        const children = document.createElement("div");
        children.className = `${ROOT_CLASS}__children`;

        const entries = Array.isArray(value)
            ? value.map((item, index) => [
                String(index),
                item
            ])
            : Object.entries(value);

        for (const [childName, childValue] of entries) {
            const childDepth = currentPath.length + 1;
            const childInitiallyOpen = childDepth < INITIAL_EXPAND_DEPTH;
            children.appendChild(
                renderNode(
                    childValue,
                    childName,
                    childInitiallyOpen,
                    false,
                    currentPath
                )
            );
        }

        details.appendChild(children);

        const closing = document.createElement("div");
        closing.className = `${ROOT_CLASS}__property`;

        closing.appendChild(
            createSpan(
                `${ROOT_CLASS}__punctuation`,
                Array.isArray(value) ? "]" : "}"
            )
        );

        details.appendChild(closing);

        return details;
    }

    function decodeHtmlEntities(value) {
        const textarea = document.createElement("textarea");
        textarea.innerHTML = value;
        return textarea.value;
    }

    function parseJson(text) {
        if (!text || typeof text !== "string") {
            return null;
        }

        // 1. Pulizia BOM e trim
        let source = text.replace(/^\uFEFF/, "").trim();
        if (!source) return null;

        // If string does not start with { or [, locate start of JSON block
        if (!source.startsWith("{") && !source.startsWith("[")) {
            const firstBrace = source.indexOf("{");
            const firstBracket = source.indexOf("[");
            let startIdx = -1;
            if (firstBrace !== -1 && firstBracket !== -1) {
                startIdx = Math.min(firstBrace, firstBracket);
            } else {
                startIdx = Math.max(firstBrace, firstBracket);
            }
            if (startIdx !== -1) {
                source = source.substring(startIdx).trim();
            } else {
                return null;
            }
        }

        // Tentativo standard 1
        try {
            return JSON.parse(source);
        } catch {
            // Prova con normalizzazioni progressive
        }

        // 2. Normalizzazione spazi Unicode (\u00A0 non-breaking space, zero-width space, ecc.)
        source = source.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, " ");

        try {
            return JSON.parse(source);
        } catch {
            // Continua
        }

        // 3. Decodifica entità HTML (&quot;, &amp;, &lt;, &gt;, &nbsp;)
        source = decodeHtmlEntities(source);
        source = source.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, " ");

        try {
            return JSON.parse(source);
        } catch {
            // Continua
        }

        // 4. Rimozione virgole finali (trailing commas prima di } o ]) tipiche di mockup Swagger
        const noTrailing = source.replace(/,\s*([}\]])/g, "$1");
        try {
            return JSON.parse(noTrailing);
        } catch {
            // Continua
        }

        // 5. Fallback valutatore rilassato JavaScript (apici singoli, chiavi unquoted)
        try {
            const evaluated = Function("return (" + noTrailing + ")")();
            if (evaluated && typeof evaluated === "object") {
                return evaluated;
            }
        } catch {
            return null;
        }

        return null;
    }

    function copyText(text, button, successLabel = "Copied!") {
        if (text === undefined || text === null) {
            return;
        }

        const stringToCopy = typeof text === "string" ? text : String(text);
        const oldText = button.textContent;
        let timerId = null;

        const setFeedback = (msg) => {
            button.textContent = msg;
            if (timerId) {
                window.clearTimeout(timerId);
            }
            timerId = window.setTimeout(() => {
                button.textContent = oldText;
            }, 1300);
        };

        const fallbackCopy = () => {
            try {
                const textarea = document.createElement("textarea");
                textarea.value = stringToCopy;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.top = "0";
                textarea.style.left = "0";
                textarea.style.width = "1px";
                textarea.style.height = "1px";
                textarea.style.padding = "0";
                textarea.style.border = "none";
                textarea.style.outline = "none";
                textarea.style.boxShadow = "none";
                textarea.style.background = "transparent";
                textarea.style.opacity = "0";

                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);

                const successful = document.execCommand("copy");
                document.body.removeChild(textarea);
                setFeedback(successful ? successLabel : "Error");
            } catch (err) {
                console.error("Clipboard copy failed:", err);
                setFeedback("Error");
            }
        };

        if (navigator.clipboard && window.isSecureContext && typeof navigator.clipboard.writeText === "function") {
            navigator.clipboard
                .writeText(stringToCopy)
                .then(() => setFeedback(successLabel))
                .catch(() => fallbackCopy());
        } else {
            fallbackCopy();
        }
    }

    function downloadJsonFile(content, filename = "response.json") {
        if (!content) {
            return;
        }

        try {
            const blob = new Blob([content], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            window.setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 500);
        } catch (err) {
            console.error("Download non riuscito:", err);
        }
    }

    function getHttpMethod(responseElement) {
        const operationBlock =
            responseElement.closest(".opblock");

        if (!operationBlock) {
            return "default";
        }

        const methodClass =
            Array.from(operationBlock.classList)
                .find(className =>
                    className.startsWith("opblock-") &&
                    className !== "opblock"
                );

        if (!methodClass) {
            return "default";
        }

        const method = methodClass
            .replace("opblock-", "")
            .toLowerCase();

        const supportedMethods = [
            "get",
            "post",
            "put",
            "delete",
            "patch",
            "head",
            "options",
            "trace"
        ];

        return supportedMethods.includes(method)
            ? method
            : "default";
    }

    function forceOriginalBackground(element) {
        element
            .querySelectorAll("pre, code, .microlight")
            .forEach(node => {
                node.style.setProperty(
                    "background",
                    "rgb(51, 51, 51)",
                    "important"
                );

                node.style.setProperty(
                    "background-color",
                    "rgb(51, 51, 51)",
                    "important"
                );

                node.style.setProperty(
                    "color",
                    "white",
                    "important"
                );
            });
    }

    function findSwaggerCodeElement(container) {
        // Search first within code containers (model-example, highlight-code, pre)
        const elements = container.querySelectorAll(".model-example pre, .highlight-code pre, pre.microlight, pre.example, pre, code");

        // First pass: find first element whose content is valid JSON
        for (const el of elements) {
            if (el.closest(`.${ROOT_CLASS}`)) {
                continue;
            }
            const parsed = parseJson(el.textContent);
            if (parsed !== null && typeof parsed === "object") {
                return el;
            }
        }

        // Secondo passaggio (fallback): se non ancora parsato, restituisci il primo pre/code non appartenente al viewer
        for (const el of elements) {
            if (!el.closest(`.${ROOT_CLASS}`)) {
                return el;
            }
        }
        return null;
    }

    function updateJsonViewer(viewer, codeElement) {
        const parsed = parseJson(codeElement.textContent);

        if (parsed === null) {
            return;
        }

        const json = JSON.stringify(parsed, null, INDENT_SPACES);

        const customBody = viewer.querySelector(
            `.${ROOT_CLASS}__body`
        );

        const oldTree = customBody?.querySelector(
            `.${ROOT_CLASS}__tree`
        );

        const originalBody = viewer.querySelector(
            `.${ROOT_CLASS}__original`
        );

        if (!customBody || !oldTree || !originalBody) {
            return;
        }

        /*
         * Record open nodes.
         * Key is constructed using the JSON path.
         */
        const openPaths = new Set();

        oldTree
            .querySelectorAll("details[open]")
            .forEach(details => {
                const path = details.dataset.jsonPath;
                if (path) {
                    openPaths.add(path);
                }
            });

        /*
         * Reconstruct tree keeping the same paths expanded.
         */
        const newTree = renderNode(
            parsed,
            null,
            true,
            true,
            []
        );

        newTree.classList.add(
            `${ROOT_CLASS}__tree`
        );

        newTree
            .querySelectorAll("details")
            .forEach(details => {
                const path = details.dataset.jsonPath;
                if (path && openPaths.has(path)) {
                    details.open = true;
                } else if (path) {
                    details.open = false;
                }
            });

        oldTree.replaceWith(newTree);

        /*
         * Update copy of the original view.
         */
        const originalContainer = codeElement.closest(".highlight-code") || codeElement.parentElement || codeElement;

        if (originalContainer) {
            const oldOriginalCopy =
                originalBody.querySelector(
                    `.${ROOT_CLASS}__original-swagger`
                );

            const newOriginalCopy =
                originalContainer.cloneNode(true);

            newOriginalCopy.hidden = false;
            newOriginalCopy.style.display = "";

            newOriginalCopy.classList.add(
                `${ROOT_CLASS}__original-swagger`
            );

            forceOriginalBackground(newOriginalCopy);
            newOriginalCopy
                .querySelectorAll(".copy-to-clipboard, .download-contents, .copy-to-clipboard__btn, .download-contents__btn")
                .forEach(el => el.remove());

            if (oldOriginalCopy) {
                oldOriginalCopy.replaceWith(
                    newOriginalCopy
                );
            } else {
                originalBody.appendChild(
                    newOriginalCopy
                );
            }
        }

        viewer._jsonText = json;
        viewer.dataset.json = json;
    }

    function enhanceResponse(responseElement) {
        if (responseElement.querySelector(`.${ROOT_CLASS}`)) {
            return;
        }

        const codeElement = findSwaggerCodeElement(responseElement);

        if (!codeElement) {
            return;
        }

        const parsed = parseJson(codeElement.textContent);

        if (parsed === null) {
            return;
        }

        const json = JSON.stringify(parsed, null, INDENT_SPACES);
        const originalContainer = codeElement.closest(".highlight-code") || codeElement.parentElement || codeElement;
        if (!originalContainer || !originalContainer.parentElement) {
            return;
        }

        const method = getHttpMethod(responseElement);

        const viewer = document.createElement("div");
        viewer.className =
            `${ROOT_CLASS} ${ROOT_CLASS}--${method}`;

        viewer._jsonText = json;
        viewer.dataset.json = json;

        const toolbar = document.createElement("div");
        toolbar.className = `${ROOT_CLASS}__toolbar`;

        const label = document.createElement("span");
        label.className = `${ROOT_CLASS}__label`;
        label.textContent = "JSON";

        const actions = document.createElement("div");
        actions.className = `${ROOT_CLASS}__actions`;

        const expandButton = document.createElement("button");
        expandButton.type = "button";
        expandButton.className = `${ROOT_CLASS}__button`;
        expandButton.textContent = "Expand all";

        const collapseButton = document.createElement("button");
        collapseButton.type = "button";
        collapseButton.className = `${ROOT_CLASS}__button`;
        collapseButton.textContent = "Collapse all";

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = `${ROOT_CLASS}__button`;
        copyButton.textContent = "Copy";

        const downloadButton = document.createElement("button");
        downloadButton.type = "button";
        downloadButton.className = `${ROOT_CLASS}__button`;
        downloadButton.textContent = "Download";
        downloadButton.title = "Download JSON payload (.json)";

        const originalButton = document.createElement("button");
        originalButton.type = "button";
        originalButton.className = `${ROOT_CLASS}__button`;
        originalButton.textContent = "Raw";
        originalButton.setAttribute(
            "aria-pressed",
            "false"
        );

        const customBody = document.createElement("div");
        customBody.className = `${ROOT_CLASS}__body`;

        const tree = renderNode(
            parsed,
            null,
            true,
            true
        );

        tree.classList.add(`${ROOT_CLASS}__tree`);
        customBody.appendChild(tree);

        const originalBody = document.createElement("div");
        originalBody.className = `${ROOT_CLASS}__original`;
        originalBody.hidden = true;

        const originalCopy =
            originalContainer.cloneNode(true);

        originalCopy.hidden = false;
        originalCopy.style.display = "";
        originalCopy.classList.add(
            `${ROOT_CLASS}__original-swagger`
        );

        forceOriginalBackground(originalCopy);
        originalCopy
            .querySelectorAll(".copy-to-clipboard, .download-contents, .copy-to-clipboard__btn, .download-contents__btn")
            .forEach(el => el.remove());
        originalBody.appendChild(originalCopy);

        function showCustomView() {
            customBody.hidden = false;
            originalBody.hidden = true;

            expandButton.hidden = false;
            collapseButton.hidden = false;
            copyButton.hidden = false;
            downloadButton.hidden = false;

            originalButton.textContent = "Raw";
            originalButton.setAttribute(
                "aria-pressed",
                "false"
            );

            originalContainer.hidden = true;
        }

        function showOriginalView() {
            customBody.hidden = true;
            originalBody.hidden = false;

            const originalCopyEl = originalBody.querySelector(`.${ROOT_CLASS}__original-swagger`);
            if (originalCopyEl) {
                originalCopyEl.hidden = false;
                originalCopyEl.style.display = "";
                forceOriginalBackground(originalCopyEl);
            }

            expandButton.hidden = true;
            collapseButton.hidden = true;
            copyButton.hidden = false;
            downloadButton.hidden = false;

            originalButton.textContent = "JSON formattato";
            originalButton.setAttribute(
                "aria-pressed",
                "true"
            );

            originalContainer.hidden = true;
        }

        expandButton.addEventListener("click", () => {
            customBody
                .querySelectorAll("details")
                .forEach(node => {
                    node.open = true;
                });
        });

        collapseButton.addEventListener("click", () => {
            customBody
                .querySelectorAll("details")
                .forEach(node => {
                    node.open = false;
                });
        });

        copyButton.addEventListener("click", () => {
            const textToCopy = viewer._jsonText || viewer.dataset.json || codeElement.textContent;
            copyText(textToCopy, copyButton, "Copiato!");
        });

        downloadButton.addEventListener("click", () => {
            const textToDownload = viewer._jsonText || viewer.dataset.json || codeElement.textContent;
            downloadJsonFile(textToDownload);
        });

        originalButton.addEventListener("click", () => {
            if (originalBody.hidden) {
                showOriginalView();
            } else {
                showCustomView();
            }
        });

        actions.append(
            expandButton,
            collapseButton,
            copyButton,
            downloadButton,
            originalButton
        );

        toolbar.append(label, actions);

        viewer.append(
            toolbar,
            customBody,
            originalBody
        );

        originalContainer.parentElement.insertBefore(
            viewer,
            originalContainer
        );

        originalContainer.hidden = true;

        showCustomView();

        const responseObserver =
            new MutationObserver(() => {
                updateJsonViewer(
                    viewer,
                    codeElement
                );
            });

        responseObserver.observe(codeElement, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    function scan() {
        injectStyles();

        document
            .querySelectorAll(".response-col_description")
            .forEach(responseElement => {
                const viewer =
                    responseElement.querySelector(
                        `.${ROOT_CLASS}`
                    );

                const codeElement = findSwaggerCodeElement(responseElement);

                if (!codeElement) {
                    return;
                }

                if (viewer) {
                    const origCont = codeElement.closest(".highlight-code") || codeElement.parentElement || codeElement;
                    if (origCont && !viewer.classList.contains("is-showing-original")) {
                        origCont.hidden = true;
                    }

                    const currentJson =
                        viewer._jsonText || viewer.dataset.json || "";

                    const parsed =
                        parseJson(codeElement.textContent);

                    if (parsed === null) {
                        return;
                    }

                    const newJson =
                        JSON.stringify(parsed, null, 2);

                    if (currentJson !== newJson) {
                        updateJsonViewer(
                            viewer,
                            codeElement
                        );
                    }

                    return;
                }

                enhanceResponse(responseElement);
            });
    }

    let scanScheduled = false;

    function scheduleScan() {
        if (scanScheduled) {
            return;
        }

        scanScheduled = true;

        window.setTimeout(() => {
            scanScheduled = false;
            scan();
        }, 150);
    }

    function applyTheme() {
        const dark =
            document.documentElement.classList.contains("dark-mode") ||
            document.body.classList.contains("dark-mode");

        document
            .querySelectorAll(`.${ROOT_CLASS}`)
            .forEach(viewer => {
                viewer.classList.toggle(
                    `${ROOT_CLASS}--dark`,
                    dark
                );
            });
    }

    function observeThemeChanges() {
        const observer = new MutationObserver(
            mutations => {
                const classChanged = mutations.some(
                    mutation =>
                        mutation.type === "attributes" &&
                        mutation.attributeName === "class"
                );

                if (classChanged) {
                    applyTheme();
                }
            }
        );

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"]
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ["class"]
        });

        applyTheme();
    }

    function start() {
        injectStyles();

        const domObserver =
            new MutationObserver(scheduleScan);

        domObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        observeThemeChanges();
        scan();
        registerGuideDocumentation();
        window.addEventListener("swagger-activity-bar:ready", registerGuideDocumentation);
    }

    let isGuideRegistered = false;

    /**
     * Publishes plugin metadata and documentation to the interactive Activity Bar guide.
     */
    function registerGuideDocumentation() {
        if (isGuideRegistered) return;
        if (window.SwaggerActivityBar && typeof window.SwaggerActivityBar.registerPluginGuide === "function") {
            isGuideRegistered = true;
            window.SwaggerActivityBar.registerPluginGuide({
                id: "pretty-json-view",
                name: "Pretty JSON & Tree View",
                version: "1.0.0",
                description: "Interactive collapsible tree viewer for JSON payloads with HTTP method color-coding, copy, download, and raw toggle.",
                shortcuts: [
                    "Expand all: Open all nested nodes and objects",
                    "Collapse all: Close all child nodes",
                    "Copy: Copy formatted JSON to clipboard",
                    "Download: Save payload as .json file",
                    "Raw: Toggle between interactive tree and raw Swagger text"
                ],
                iconHtml: `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="16 18 22 12 16 6"/>
                        <polyline points="8 6 2 12 8 18"/>
                    </svg>
                `,
                manual: `
### Overview
Enhances readability of JSON payloads in server responses and Swagger UI documentation examples.

### Features
- **Interactive Tree**: navigate and expand nested objects, arrays, and primitive values.
- **HTTP Method Color Theme**: the viewer toolbar matches HTTP method colors (\`GET\` blue, \`POST\` green, \`PUT\` orange, \`DELETE\` red).
- **Toolbar Actions**:
  - **Expand / Collapse all**: instant control over large response trees.
  - **Copy & Download**: 1-click clipboard copy or download as \`.json\`.
  - **Raw Toggle**: switch back and forth to Swagger's original raw text representation.
`
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            start,
            { once: true }
        );
    } else {
        start();
    }
})();