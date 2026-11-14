import { KbView } from './components/kb-view.js';

document.addEventListener('DOMContentLoaded', () => {
    // ====================================================
    // 0. SPLITTERS / REDIMENSIONNEMENT & TOGGLES DES PANNEAUX
    // ====================================================
    const resizerLeft = document.getElementById('resizer-left');
    const resizerRight = document.getElementById('resizer-right');
    const mainGrid = document.querySelector('.ide-main-grid');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const btnToggleAgent = document.getElementById('btn-toggle-agent');
    const sidebarPane = document.querySelector('.ide-sidebar-pane');
    const agentPane = document.querySelector('.ide-agent-pane');

    let isSidebarCollapsed = false;
    let isAgentCollapsed = false;
    let savedSidebarWidth = '280px';
    let savedAgentWidth = '420px';

    function toggleSidebar(forceState) {
        if (typeof forceState === 'boolean') {
            isSidebarCollapsed = !forceState;
        } else {
            isSidebarCollapsed = !isSidebarCollapsed;
        }

        if (isSidebarCollapsed) {
            mainGrid.style.setProperty('--sidebar-width', '0px');
            if (sidebarPane) sidebarPane.style.display = 'none';
            if (resizerLeft) resizerLeft.style.display = 'none';
            if (btnToggleSidebar) btnToggleSidebar.style.opacity = '0.6';
        } else {
            mainGrid.style.setProperty('--sidebar-width', savedSidebarWidth);
            if (sidebarPane) sidebarPane.style.display = 'flex';
            if (resizerLeft) resizerLeft.style.display = 'block';
            if (btnToggleSidebar) btnToggleSidebar.style.opacity = '1';
        }
        if (editorInstance) editorInstance.layout();
        if (diffEditorInstance) diffEditorInstance.layout();
    }

    function toggleAgent(forceState) {
        if (typeof forceState === 'boolean') {
            isAgentCollapsed = !forceState;
        } else {
            isAgentCollapsed = !isAgentCollapsed;
        }

        if (isAgentCollapsed) {
            mainGrid.style.setProperty('--agent-width', '0px');
            if (agentPane) agentPane.style.display = 'none';
            if (resizerRight) resizerRight.style.display = 'none';
            if (btnToggleAgent) btnToggleAgent.style.opacity = '0.6';
        } else {
            mainGrid.style.setProperty('--agent-width', savedAgentWidth);
            if (agentPane) agentPane.style.display = 'flex';
            if (resizerRight) resizerRight.style.display = 'block';
            if (btnToggleAgent) btnToggleAgent.style.opacity = '1';
        }
        if (editorInstance) editorInstance.layout();
        if (diffEditorInstance) diffEditorInstance.layout();
    }

    if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', () => toggleSidebar());
    if (btnToggleAgent) btnToggleAgent.addEventListener('click', () => toggleAgent());

    if (resizerLeft && mainGrid) {
        let isDraggingLeft = false;
        resizerLeft.addEventListener('mousedown', (e) => {
            isDraggingLeft = true;
            resizerLeft.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingLeft) return;
            const newWidth = Math.max(160, Math.min(600, e.clientX - 50));
            savedSidebarWidth = `${newWidth}px`;
            mainGrid.style.setProperty('--sidebar-width', savedSidebarWidth);
            if (editorInstance) editorInstance.layout();
            if (diffEditorInstance) diffEditorInstance.layout();
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingLeft) {
                isDraggingLeft = false;
                resizerLeft.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                if (editorInstance) editorInstance.layout();
            }
        });
    }

    if (resizerRight && mainGrid) {
        let isDraggingRight = false;
        resizerRight.addEventListener('mousedown', (e) => {
            isDraggingRight = true;
            resizerRight.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingRight) return;
            const newWidth = Math.max(260, Math.min(750, window.innerWidth - e.clientX));
            savedAgentWidth = `${newWidth}px`;
            mainGrid.style.setProperty('--agent-width', savedAgentWidth);
            if (editorInstance) editorInstance.layout();
            if (diffEditorInstance) diffEditorInstance.layout();
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingRight) {
                isDraggingRight = false;
                resizerRight.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                if (editorInstance) editorInstance.layout();
            }
        });
    }

    // État global de Earnest IDE
    const state = {
        currentProjectId: 'earnest',
        currentProjectName: 'Earnest',
        currentRoot: '.',
        projects: [],
        openTabs: [],
        activeTabPath: null,
        isDiffMode: false,
        models: [],
        expandedDirs: new Set(['.']),
        activeSidebarTab: 'explorer', // 'explorer' | 'search' | 'git' | 'diagnostics'
        activeBottomTab: 'term-1',   // 'term-1' | 'term-2' | 'problems'
        allProjectFiles: [],
        diagnosticsList: [],
        gitStatus: { branch: 'master', files: [] }
    };

    let editorInstance = null;
    let diffEditorInstance = null;

    // DOM Elements - Sidebar Activity Bar
    const actBtnExplorer = document.getElementById('act-btn-explorer');
    const actBtnSearch = document.getElementById('act-btn-search');
    const actBtnGit = document.getElementById('act-btn-git');
    const actBtnDiagnostics = document.getElementById('act-btn-diagnostics');
    const actBtnKb = document.getElementById('act-btn-kb');
    const actBtnSettings = document.getElementById('act-btn-settings');
    const btnOpenSettings = document.getElementById('btn-open-settings');

    const viewExplorer = document.getElementById('view-explorer');
    const viewSearch = document.getElementById('view-search');
    const viewGit = document.getElementById('view-git');
    const viewDiagnostics = document.getElementById('view-diagnostics');
    const viewKb = document.getElementById('view-kb');
    const viewSettings = document.getElementById('view-settings');

    let kbViewInstance = null;

    // DOM Elements - Preferences & Models Management
    const prefDefaultModel = document.getElementById('pref-default-model');
    const prefPythonPath = document.getElementById('pref-python-path');
    const prefEditorFontSize = document.getElementById('pref-editor-fontsize');
    const prefEditorTabSize = document.getElementById('pref-editor-tabsize');
    const btnSavePreferences = document.getElementById('btn-save-preferences');
    const prefStatusMsg = document.getElementById('pref-status-msg');

    const modelsCardsList = document.getElementById('models-cards-list');
    const btnToggleAddModel = document.getElementById('btn-toggle-add-model');
    const modelFormPane = document.getElementById('model-form-pane');
    const modelFormId = document.getElementById('model-form-id');
    const modelFormName = document.getElementById('model-form-name');
    const modelFormType = document.getElementById('model-form-type');
    const modelFormUrl = document.getElementById('model-form-url');
    const modelFormModel = document.getElementById('model-form-model');
    const modelFormKey = document.getElementById('model-form-key');
    const btnSaveModelItem = document.getElementById('btn-save-model-item');
    const btnCancelModelItem = document.getElementById('btn-cancel-model-item');

    // DOM Elements - Editor & Monaco
    const monacoEditorContainer = document.getElementById('monaco-editor-container');
    const monacoDiffContainer = document.getElementById('monaco-diff-container');
    const editorTabsContainer = document.getElementById('editor-tabs');
    const btnToggleDiff = document.getElementById('btn-toggle-diff');
    const btnSaveFile = document.getElementById('btn-save-file');
    const inlineAiWidget = document.getElementById('inline-ai-widget');
    const inlineAiInput = document.getElementById('inline-ai-input');
    const btnInlineAiSubmit = document.getElementById('btn-inline-ai-submit');
    const btnInlineAiCancel = document.getElementById('btn-inline-ai-cancel');
    const btnTriggerInlineAi = document.getElementById('btn-trigger-inline-ai');

    // DOM Elements - Bottom Panel & Terminals
    const centerPane = document.getElementById('center-pane');
    const btnToggleBottom = document.getElementById('btn-toggle-bottom');
    const btnCloseBottom = document.getElementById('btn-close-bottom');
    const btnClearTerminal = document.getElementById('btn-clear-terminal');
    const btnTabTerm1 = document.getElementById('btn-tab-term-1');
    const btnTabTerm2 = document.getElementById('btn-tab-term-2');
    const btnTabProblems = document.getElementById('btn-tab-problems');
    const paneTerm1 = document.getElementById('pane-term-1');
    const paneTerm2 = document.getElementById('pane-term-2');
    const paneProblems = document.getElementById('pane-problems');
    const terminalOutput1 = document.getElementById('terminal-output-1');
    const terminalInput1 = document.getElementById('terminal-input-1');
    const terminalOutput2 = document.getElementById('terminal-output-2');
    const terminalInput2 = document.getElementById('terminal-input-2');
    const bottomProblemsContent = document.getElementById('bottom-problems-content');

    // DOM Elements - Palette & Quick Open (Ctrl+P)
    const paletteModal = document.getElementById('palette-modal');
    const paletteInput = document.getElementById('palette-input');
    const paletteList = document.getElementById('palette-list');
    const btnQuickOpenTop = document.getElementById('btn-quick-open-top');

    // DOM Elements - Git & Search Views
    const globalSearchInput = document.getElementById('global-search-input');
    const searchResultsList = document.getElementById('search-results-list');
    const gitBranchBadge = document.getElementById('git-branch-badge');
    const gitCommitMsg = document.getElementById('git-commit-msg');
    const btnGitCommit = document.getElementById('btn-git-commit');
    const gitFilesList = document.getElementById('git-files-list');
    const diagnosticsListEl = document.getElementById('diagnostics-list');
    const btnRefreshDiagnostics = document.getElementById('btn-refresh-diagnostics');

    // DOM Elements - Agent Copilote
    const agentPrompt = document.getElementById('agent-prompt');
    const btnAgentSend = document.getElementById('btn-agent-send');
    const chatStream = document.getElementById('agent-chat-stream');
    const btnClearAgent = document.getElementById('btn-clear-agent');

    // DOM Elements - Status Bar
    const statusCursor = document.getElementById('status-cursor');
    const statusLang = document.getElementById('status-lang');
    const statusGitBranch = document.getElementById('status-git-branch');
    const statusProblemsCount = document.getElementById('status-problems-count');
    const statusActiveModel = document.getElementById('status-active-model');

    // ====================================================
    // 1. INITIALISATION DE MONACO EDITOR
    // ====================================================
    function getMonacoLanguage(filePath) {
        if (!filePath) return 'plaintext';
        const ext = filePath.split('.').pop().toLowerCase();
        const map = {
            'rs': 'rust', 'py': 'python', 'js': 'javascript', 'ts': 'typescript',
            'tsx': 'typescript', 'jsx': 'javascript', 'html': 'html', 'css': 'css',
            'json': 'json', 'sh': 'shell', 'bash': 'shell', 'sql': 'sql',
            'md': 'markdown', 'toml': 'ini', 'yaml': 'yaml', 'yml': 'yaml'
        };
        return map[ext] || 'plaintext';
    }

    function initMonaco(callback) {
        const origin = window.location.origin;
        window.MonacoEnvironment = {
            getWorkerUrl: function (moduleId, label) {
                if (label === 'typescript' || label === 'javascript') {
                    const tsWorker = `
                        self.MonacoEnvironment = { baseUrl: '${origin}/js/vendor/monaco/' };
                        importScripts('${origin}/js/vendor/monaco/vs/language/typescript/tsWorker.js');
                    `;
                    return URL.createObjectURL(new Blob([tsWorker], { type: 'application/javascript' }));
                }
                const proxyWorker = `
                    self.MonacoEnvironment = {
                        baseUrl: '${origin}/js/vendor/monaco/'
                    };
                    importScripts('${origin}/js/vendor/monaco/vs/base/worker/workerMain.js');
                `;
                return URL.createObjectURL(new Blob([proxyWorker], { type: 'application/javascript' }));
            }
        };

        require.config({ paths: { 'vs': '/js/vendor/monaco/vs' } });
        require(['vs/editor/editor.main'], function () {
            // Configuration TypeScript / JavaScript avancée (IntelliSense, JSX, ESNext)
            if (monaco.languages.typescript) {
                monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: false,
                    noSyntaxValidation: false
                });
                monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: false,
                    noSyntaxValidation: false
                });
                monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                    target: monaco.languages.typescript.ScriptTarget.ESNext,
                    allowNonTextExtensions: true,
                    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
                    module: monaco.languages.typescript.ModuleKind.CommonJS,
                    noEmit: true,
                    esModuleInterop: true,
                    jsx: monaco.languages.typescript.JsxEmit.React,
                    allowJs: true,
                    typeRoots: ["node_modules/@types"]
                });
            }

            // Enregistrement des providers LSP pour Python, Rust et langages courants
            registerUniversalLspProviders();

            // S'assurer que le container a une géométrie calculée avant l'instanciation de Monaco
            requestAnimationFrame(() => {
                editorInstance = monaco.editor.create(monacoEditorContainer, {
                    value: '// Earnest IDE Pro • Monaco Editor Active\n',
                    language: 'rust',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                    minimap: { enabled: true },
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    tabSize: 4,
                    inlineSuggest: { enabled: true }
                });

                editorInstance.onDidChangeCursorPosition((e) => {
                    statusCursor.textContent = `Ligne ${e.position.lineNumber}, Col ${e.position.column}`;
                });

                editorInstance.onDidChangeModelContent(() => {
                    const tab = getActiveTab();
                    if (tab && !tab._suppressEvents) {
                        tab.content = editorInstance.getValue();
                        tab.isModified = tab.content !== tab.originalContent;
                        renderTabs();
                        if (state.isDiffMode) updateDiffModels();
                    }
                });

                // Action raccourci Ctrl+K dans Monaco
                editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
                    showInlineAiWidget();
                });

                diffEditorInstance = monaco.editor.createDiffEditor(monacoDiffContainer, {
                    theme: 'vs-dark',
                    automaticLayout: true,
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                    originalEditable: false
                });

                if (callback) callback();
            });
        });
    }

    function registerUniversalLspProviders() {
        // P2 : Ghost Text / Inline Completion IA (Cursor-like)
        let ghostDebounceTimer = null;
        monaco.languages.registerInlineCompletionsProvider({ pattern: '**' }, {
            provideInlineCompletions: function (model, position, context, token) {
                return new Promise((resolve) => {
                    if (ghostDebounceTimer) clearTimeout(ghostDebounceTimer);
                    ghostDebounceTimer = setTimeout(async () => {
                        if (token.isCancellationRequested) return resolve({ items: [] });
                        try {
                            const lineText = model.getLineContent(position.lineNumber);
                            const prefix = lineText.slice(0, position.column - 1);
                            if (prefix.trim().length < 3) return resolve({ items: [] });

                            const tab = getActiveTab();
                            const startLine = Math.max(1, position.lineNumber - 25);
                            const contextCode = model.getValueInRange({
                                startLineNumber: startLine,
                                startColumn: 1,
                                endLineNumber: position.lineNumber,
                                endColumn: position.column
                            });

                            const res = await fetch('/api/ide/ai/inline_edit', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    prompt: 'Complete the code right after the cursor. Output ONLY the missing code continuation (1-3 lines max), no markdown fences, no explanation.',
                                    file_path: tab ? tab.path : 'snippet.txt',
                                    selected_code: '',
                                    entire_content: contextCode
                                })
                            });
                            if (token.isCancellationRequested) return resolve({ items: [] });
                            const data = await res.json();
                            if (data.status === 'success' && data.replacement) {
                                const clean = data.replacement.replace(/^```[\w]*\n?/, '').replace(/```$/, '');
                                if (clean.trim().length > 0) {
                                    return resolve({
                                        items: [{
                                            insertText: clean,
                                            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
                                        }]
                                    });
                                }
                            }
                        } catch (e) { }
                        resolve({ items: [] });
                    }, 500);
                });
            },
            freeInlineCompletions: function () { }
        });

        const supportedLangs = ['python', 'rust', 'html', 'css', 'json', 'shell', 'sql', 'markdown'];

        supportedLangs.forEach(lang => {
            // 1. Completion Provider (Autocomplétion intelligente via backend LSP & indexer)
            monaco.languages.registerCompletionItemProvider(lang, {
                triggerCharacters: ['.', ':', '>', '/', '_'],
                provideCompletionItems: async function (model, position) {
                    const tab = getActiveTab();
                    const filePath = tab ? tab.path : `file.${lang}`;
                    const code = model.getValue();
                    const line = position.lineNumber;
                    const column = position.column;

                    try {
                        const res = await fetch('/api/ide/lsp/complete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                language: lang,
                                path: filePath,
                                code,
                                line,
                                column
                            })
                        });
                        const data = await res.json();
                        const suggestions = (data.items || []).map(item => {
                            let itemKind = monaco.languages.CompletionItemKind.Property;
                            if (item.kind === 'function' || item.kind === 'statement') itemKind = monaco.languages.CompletionItemKind.Function;
                            else if (item.kind === 'class' || item.kind === 'type') itemKind = monaco.languages.CompletionItemKind.Class;
                            else if (item.kind === 'module') itemKind = monaco.languages.CompletionItemKind.Module;
                            else if (item.kind === 'keyword') itemKind = monaco.languages.CompletionItemKind.Keyword;
                            else if (item.kind === 'variable' || item.kind === 'param') itemKind = monaco.languages.CompletionItemKind.Variable;

                            const word = model.getWordUntilPosition(position);
                            const range = {
                                startLineNumber: position.lineNumber,
                                endLineNumber: position.lineNumber,
                                startColumn: word.startColumn,
                                endColumn: word.endColumn
                            };

                            return {
                                label: item.label,
                                kind: itemKind,
                                detail: item.detail || '',
                                documentation: item.doc ? { value: item.doc } : undefined,
                                insertText: item.label,
                                range
                            };
                        });

                        return { suggestions };
                    } catch (e) {
                        return { suggestions: [] };
                    }
                }
            });

            // 2. Hover Provider (Documentation au survol)
            monaco.languages.registerHoverProvider(lang, {
                provideHover: async function (model, position) {
                    const tab = getActiveTab();
                    const filePath = tab ? tab.path : `file.${lang}`;
                    const code = model.getValue();

                    try {
                        const res = await fetch('/api/ide/lsp/hover', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                language: lang,
                                path: filePath,
                                code,
                                line: position.lineNumber,
                                column: position.column
                            })
                        });
                        const data = await res.json();
                        if (data.contents && data.contents.length > 0) {
                            return {
                                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                                contents: data.contents.map(c => ({ value: c }))
                            };
                        }
                    } catch (e) { }
                    return null;
                }
            });

            // 3. Definition Provider (F12 / Ctrl+Click Aller à la définition)
            monaco.languages.registerDefinitionProvider(lang, {
                provideDefinition: async function (model, position) {
                    const tab = getActiveTab();
                    const filePath = tab ? tab.path : `file.${lang}`;
                    const code = model.getValue();
                    const word = model.getWordAtPosition(position);
                    const symbol = word ? word.word : '';

                    try {
                        const res = await fetch('/api/ide/lsp/definition', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                language: lang,
                                root: state.currentRoot,
                                path: filePath,
                                symbol,
                                code,
                                line: position.lineNumber,
                                column: position.column
                            })
                        });
                        const data = await res.json();
                        if (data.definitions && data.definitions.length > 0) {
                            const def = data.definitions[0];
                            const targetFile = def.file;
                            const targetLine = def.line || 1;
                            const targetCol = def.column || 1;

                            // Ouvrir le fichier cible s'il est différent
                            if (targetFile && targetFile !== filePath && !targetFile.endsWith('unknown')) {
                                await openFile(targetFile);
                            }

                            return {
                                uri: (editorInstance && editorInstance.getModel()) ? editorInstance.getModel().uri : model.uri,
                                range: new monaco.Range(targetLine, targetCol, targetLine, targetCol + symbol.length)
                            };
                        }
                    } catch (e) { }
                    return null;
                }
            });

            // 4. Signature Help Provider (Assistance aux paramètres lors de la frappe d'appels '(' ou ',')
            monaco.languages.registerSignatureHelpProvider(lang, {
                signatureHelpTriggerCharacters: ['(', ','],
                provideSignatureHelp: async function (model, position) {
                    const tab = getActiveTab();
                    const filePath = tab ? tab.path : `file.${lang}`;
                    const code = model.getValue();

                    try {
                        const res = await fetch('/api/ide/lsp/signatures', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                language: lang,
                                path: filePath,
                                code,
                                line: position.lineNumber,
                                column: position.column
                            })
                        });
                        const data = await res.json();
                        if (data.signatures && data.signatures.length > 0) {
                            return {
                                value: {
                                    activeSignature: 0,
                                    activeParameter: data.signatures[0].activeParameter || 0,
                                    signatures: data.signatures.map(s => ({
                                        label: s.label,
                                        parameters: (s.parameters || []).map(p => ({ label: p }))
                                    }))
                                },
                                dispose: () => { }
                            };
                        }
                    } catch (e) { }
                    return null;
                }
            });
        });
    }

    function updateDiffModels() {
        if (!diffEditorInstance || !window.monaco) return;
        const tab = getActiveTab();
        if (!tab) return;
        const lang = getMonacoLanguage(tab.path);
        diffEditorInstance.setModel({
            original: monaco.editor.createModel(tab.originalContent, lang),
            modified: monaco.editor.createModel(tab.content, lang)
        });
    }

    // ====================================================
    // 2. INLINE AI EDIT (CTRL + K - STYLE CURSOR)
    // ====================================================
    function showInlineAiWidget() {
        if (!editorInstance) return;
        const selection = editorInstance.getSelection();
        const selectedText = editorInstance.getModel().getValueInRange(selection);
        if (!selectedText.trim()) {
            alert('Veuillez d\'abord sélectionner un bloc de code pour utiliser Inline AI (Ctrl+K).');
            return;
        }

        // Positionnement au-dessus ou dans la zone sélectionnée
        inlineAiWidget.classList.add('visible');
        inlineAiWidget.style.top = '60px';
        inlineAiWidget.style.left = '320px';
        inlineAiInput.value = '';
        inlineAiInput.focus();
    }

    btnTriggerInlineAi.addEventListener('click', showInlineAiWidget);
    btnInlineAiCancel.addEventListener('click', () => {
        inlineAiWidget.classList.remove('visible');
    });

    btnInlineAiSubmit.addEventListener('click', async () => {
        const prompt = inlineAiInput.value.trim();
        if (!prompt || !editorInstance) return;

        const selection = editorInstance.getSelection();
        const selectedText = editorInstance.getModel().getValueInRange(selection);
        const entireContent = editorInstance.getValue();
        const tab = getActiveTab();

        btnInlineAiSubmit.textContent = 'Génération...';
        btnInlineAiSubmit.disabled = true;

        try {
            const res = await fetch('/api/ide/ai/inline_edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    file_path: tab ? tab.path : 'unknown.rs',
                    selected_code: selectedText,
                    entire_content: entireContent
                })
            });
            const data = await res.json();
            if (data.status === 'success' && data.replacement) {
                // Remplacement chirurgical dans Monaco avec revue Accepter / Rejeter (P3)
                const originalText = selectedText;
                editorInstance.executeEdits('inline-ai', [{
                    range: selection,
                    text: data.replacement,
                    forceMoveMarkers: true
                }]);
                inlineAiWidget.classList.remove('visible');
                showInlineDiffReviewBar(originalText);
            } else {
                alert(`Erreur IA Inline : ${data.error || 'Aucun remplacement généré'}`);
            }
        } catch (err) {
            alert(`Erreur réseau IA : ${err.message}`);
        } finally {
            btnInlineAiSubmit.textContent = 'Générer';
            btnInlineAiSubmit.disabled = false;
        }
    });

    function showInlineDiffReviewBar() {
        let bar = document.getElementById('inline-diff-review-bar');
        if (bar) bar.remove();
        bar = document.createElement('div');
        bar.id = 'inline-diff-review-bar';
        bar.style.cssText = `
            position: absolute; top: 46px; right: 24px; z-index: 950;
            background: #161b22; border: 1px solid var(--accent-cyan);
            border-radius: 6px; padding: 6px 10px; display: flex; align-items: center; gap: 8px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.5); font-size: 0.76rem;
        `;
        bar.innerHTML = `
            <span style="color: var(--accent-cyan); font-weight: 600;">⚡ Modification IA appliquée</span>
            <button id="btn-review-accept" style="background: rgba(16,185,129,0.2); color: #34d399; border: 1px solid #34d399; border-radius: 4px; padding: 2px 8px; cursor: pointer;">✓ Accepter</button>
            <button id="btn-review-reject" style="background: rgba(244,63,94,0.2); color: #fb7185; border: 1px solid #fb7185; border-radius: 4px; padding: 2px 8px; cursor: pointer;">✕ Rejeter (Ctrl+Z)</button>
        `;
        const wrapper = document.getElementById('editor-section-wrapper');
        if (wrapper) wrapper.appendChild(bar);

        bar.querySelector('#btn-review-accept').addEventListener('click', () => bar.remove());
        bar.querySelector('#btn-review-reject').addEventListener('click', () => {
            if (editorInstance) editorInstance.trigger('inline-ai', 'undo', null);
            bar.remove();
        });
    }

    inlineAiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnInlineAiSubmit.click();
        if (e.key === 'Escape') inlineAiWidget.classList.remove('visible');
    });

    // ====================================================
    // 3. GESTION DES ONGLETS & FICHIERS
    // ====================================================
    function getActiveTab() {
        return state.openTabs.find(t => t.path === state.activeTabPath) || null;
    }

    function renderTabs() {
        editorTabsContainer.innerHTML = '';
        state.openTabs.forEach(tab => {
            const tabEl = document.createElement('div');
            tabEl.className = `editor-tab ${tab.path === state.activeTabPath ? 'active' : ''} ${tab.isModified ? 'modified' : ''}`;

            const titleSpan = document.createElement('span');
            titleSpan.textContent = tab.name;
            titleSpan.title = tab.path;
            tabEl.appendChild(titleSpan);

            const closeBtn = document.createElement('span');
            closeBtn.className = 'editor-tab-close';
            closeBtn.textContent = '✕';
            closeBtn.title = 'Fermer (Ctrl+W)';
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(tab.path);
            });
            tabEl.appendChild(closeBtn);

            tabEl.addEventListener('click', () => {
                switchTab(tab.path);
            });

            editorTabsContainer.appendChild(tabEl);
        });
    }

    async function openFile(filePath) {
        // Normaliser les antislashs pour Windows
        const normalizedPath = filePath.replace(/\\/g, '/');
        let existing = state.openTabs.find(t => t.path === normalizedPath || t.path.replace(/\\/g, '/') === normalizedPath);
        if (!existing) {
            try {
                const res = await fetch(`/api/ide/file?path=${encodeURIComponent(normalizedPath)}`);
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                const fileName = normalizedPath.split('/').pop();
                const lang = getMonacoLanguage(normalizedPath);

                let monacoModel = null;
                if (window.monaco) {
                    monacoModel = monaco.editor.createModel(data.content || '', lang);
                }

                existing = {
                    path: normalizedPath,
                    name: fileName,
                    content: data.content || '',
                    originalContent: data.content || '',
                    isModified: false,
                    lastMtime: data.mtime || 0,
                    monacoModel
                };
                state.openTabs.push(existing);
            } catch (err) {
                alert(`Erreur lecture: ${err.message}`);
                return;
            }
        }
        switchTab(existing.path);
        saveSessionState();
    }

    function switchTab(filePath) {
        // Si la vue KB ou Gouvernance plein écran était active, la masquer
        if (centralKbView && centralKbView.style.display === 'block') {
            centralKbView.style.display = 'none';
            monacoEditorContainer.style.display = 'block';
            if (btnOpenKbTab) btnOpenKbTab.style.background = 'rgba(244, 63, 94, 0.1)';
        }
        if (centralGovView && centralGovView.style.display === 'block') {
            centralGovView.style.display = 'none';
            monacoEditorContainer.style.display = 'block';
        }

        state.activeTabPath = filePath;
        const tab = getActiveTab();
        if (tab && editorInstance && window.monaco) {
            if (!tab.monacoModel) {
                const lang = getMonacoLanguage(tab.path);
                tab.monacoModel = monaco.editor.createModel(tab.content, lang);
            }
            editorInstance.setModel(tab.monacoModel);
            editorInstance.layout();
            statusLang.textContent = getMonacoLanguage(tab.path).toUpperCase();
            if (state.isDiffMode) updateDiffModels();
        }
        renderTabs();
    }

    function closeTab(filePath) {
        const idx = state.openTabs.findIndex(t => t.path === filePath);
        if (idx === -1) return;
        const tab = state.openTabs[idx];
        if (tab.isModified) {
            if (!confirm(`Fermer "${tab.name}" sans sauvegarder ?`)) return;
        }
        if (tab.monacoModel) tab.monacoModel.dispose();
        state.openTabs.splice(idx, 1);
        if (state.activeTabPath === filePath) {
            if (state.openTabs.length > 0) {
                switchTab(state.openTabs[Math.max(0, idx - 1)].path);
            } else {
                state.activeTabPath = null;
                if (editorInstance) editorInstance.setValue('');
                renderTabs();
            }
        } else {
            renderTabs();
        }
        saveSessionState();
    }

    async function saveCurrentFile() {
        const tab = getActiveTab();
        if (!tab || !editorInstance) return;

        btnSaveFile.disabled = true;
        btnSaveFile.textContent = 'Sauvegarde...';

        const resetBtn = () => {
            btnSaveFile.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline></svg> Sauvegarder (Ctrl+S)`;
            btnSaveFile.disabled = false;
        };

        const val = editorInstance.getValue();
        try {
            const res = await fetch('/api/ide/save_file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: tab.path, content: val })
            });
            const data = await res.json();
            if (data.status === 'success') {
                tab.originalContent = val;
                tab.content = val;
                tab.isModified = false;
                if (data.mtime) tab.lastMtime = data.mtime;
                renderTabs();
                if (state.isDiffMode) updateDiffModels();
                refreshGitStatus();
                refreshDiagnostics();
                runIdeHooks('on_after_save', tab.path);

                btnSaveFile.textContent = 'Sauvegardé ✓';
                setTimeout(resetBtn, 1000);
            } else {
                alert(`Erreur sauvegarde: ${data.error || 'Erreur inconnue'}`);
                resetBtn();
            }
        } catch (e) {
            alert(`Erreur réseau: ${e.message}`);
            resetBtn();
        }
    }

    btnSaveFile.addEventListener('click', saveCurrentFile);

    async function runIdeHooks(eventName, filePath) {
        try {
            const res = await fetch('/api/ide/file?path=.ide/hooks.json');
            if (!res.ok) return;
            const data = await res.json();
            if (!data.content) return;
            const hooksConfig = JSON.parse(data.content);
            const hooks = hooksConfig[eventName];
            if (!Array.isArray(hooks)) return;

            for (const hook of hooks) {
                if (hook.pattern && !new RegExp(hook.pattern).test(filePath)) continue;
                if (!hook.command) continue;
                const cmd = hook.command.replace(/\{file\}/g, filePath);
                if (terminalOutput1) {
                    const info = document.createElement('div');
                    info.style.color = 'var(--accent-amber)';
                    info.textContent = `[Hook ${eventName}] > ${cmd}`;
                    terminalOutput1.appendChild(info);
                }
                const execRes = await fetch('/api/ide/terminal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: cmd })
                });
                const execData = await execRes.json();
                if (terminalOutput1 && (execData.stdout || execData.stderr)) {
                    const out = document.createElement('pre');
                    out.style.cssText = 'margin:2px 0; white-space:pre-wrap; font-size:0.72rem; color:var(--text-secondary);';
                    out.textContent = (execData.stdout || '') + (execData.stderr || '');
                    terminalOutput1.appendChild(out);
                    terminalOutput1.scrollTop = terminalOutput1.scrollHeight;
                }
            }
        } catch (_) { }
    }

    btnToggleDiff.addEventListener('click', () => {
        state.isDiffMode = !state.isDiffMode;
        if (state.isDiffMode) {
            btnToggleDiff.style.color = 'var(--accent-cyan)';
            monacoEditorContainer.style.display = 'none';
            monacoDiffContainer.style.display = 'block';
            updateDiffModels();
            if (diffEditorInstance) diffEditorInstance.layout();
        } else {
            btnToggleDiff.style.color = 'var(--text-muted)';
            monacoEditorContainer.style.display = 'block';
            monacoDiffContainer.style.display = 'none';
            if (editorInstance) editorInstance.layout();
        }
    });

    // ====================================================
    // 4. ACTIVITY BAR & COMMUTATION DES VUES LATÉRALES
    // ====================================================
    function switchSidebarView(viewName) {
        state.activeSidebarTab = viewName;
        [actBtnExplorer, actBtnSearch, actBtnGit, actBtnDiagnostics, actBtnKb, actBtnSettings].forEach(btn => btn && btn.classList.remove('active'));
        [viewExplorer, viewSearch, viewGit, viewDiagnostics, viewKb, viewSettings].forEach(v => v && v.classList.remove('active'));

        if (viewName === 'explorer') {
            actBtnExplorer.classList.add('active');
            viewExplorer.classList.add('active');
        } else if (viewName === 'search') {
            actBtnSearch.classList.add('active');
            viewSearch.classList.add('active');
            globalSearchInput.focus();
        } else if (viewName === 'git') {
            actBtnGit.classList.add('active');
            viewGit.classList.add('active');
            refreshGitStatus();
        } else if (viewName === 'diagnostics') {
            actBtnDiagnostics.classList.add('active');
            viewDiagnostics.classList.add('active');
            refreshDiagnostics();
        } else if (viewName === 'kb') {
            if (actBtnKb) actBtnKb.classList.add('active');
            if (viewKb) {
                viewKb.classList.add('active');
                if (!kbViewInstance) {
                    kbViewInstance = new KbView('view-kb');
                } else {
                    kbViewInstance.loadEntries();
                }
            }
        } else if (viewName === 'settings') {
            if (actBtnSettings) actBtnSettings.classList.add('active');
            if (viewSettings) viewSettings.classList.add('active');
            loadPreferences();
        }
    }

    actBtnExplorer.addEventListener('click', () => switchSidebarView('explorer'));
    actBtnSearch.addEventListener('click', () => switchSidebarView('search'));
    actBtnGit.addEventListener('click', () => switchSidebarView('git'));
    actBtnDiagnostics.addEventListener('click', () => switchSidebarView('diagnostics'));
    const btnOpenKbTab = document.getElementById('btn-open-kb-tab');
    const centralKbView = document.getElementById('central-kb-view');
    const centralGovView = document.getElementById('central-gov-view');
    const btnCentralRunInvariants = document.getElementById('btn-central-run-invariants');
    const centralGovLockStatus = document.getElementById('central-gov-lock-status');
    const centralGovModeDisplay = document.getElementById('central-gov-mode-display');
    const centralGovContractsCount = document.getElementById('central-gov-contracts-count');
    const centralGovInvariantsList = document.getElementById('central-gov-invariants-list');
    let centralKbInstance = null;

    async function openCentralGovernanceView() {
        if (!centralGovView) return;
        if (centralKbView) centralKbView.style.display = 'none';
        if (monacoEditorContainer) monacoEditorContainer.style.display = 'none';
        if (monacoDiffContainer) monacoDiffContainer.style.display = 'none';
        centralGovView.style.display = 'block';

        // Charger et afficher les invariants
        refreshCentralGovernance();
    }

    async function refreshCentralGovernance() {
        if (!centralGovInvariantsList) return;
        centralGovInvariantsList.innerHTML = '<div style="color:var(--text-muted); padding:0.5rem;">Chargement des données de gouvernance...</div>';

        try {
            const res = await fetch(`/api/ide/governance/status?root=${encodeURIComponent(state.currentRoot || '.')}`);
            const data = await res.json();

            if (centralGovLockStatus) {
                const isLocked = data.integrity && data.integrity.status === 'locked';
                centralGovLockStatus.textContent = isLocked ? 'VERROUILLÉ ✓' : 'NON VERROUILLÉ';
                centralGovLockStatus.style.color = isLocked ? 'var(--accent-emerald)' : 'var(--accent-amber)';
            }
            if (centralGovModeDisplay) {
                centralGovModeDisplay.textContent = `Mode ${data.mode || 'normal'}`;
            }
            if (centralGovContractsCount) {
                const count = (data.contracts && data.contracts.count) ? data.contracts.count : 10;
                centralGovContractsCount.textContent = `${count} Invariants`;
            }

            // Récupérer la liste des invariants détaillés
            const invRes = await fetch(`/api/ide/invariants?root=${encodeURIComponent(state.currentRoot || '.')}`);
            const invData = await invRes.json();
            const contracts = (invData && (invData.invariants || invData.contracts)) ? (invData.invariants || invData.contracts) : [];

            if (contracts.length === 0) {
                centralGovInvariantsList.innerHTML = '<div style="color:var(--text-muted); padding:0.5rem;">Aucun contrat défini dans .ide/invariants.json</div>';
                return;
            }

            centralGovInvariantsList.innerHTML = '';
            contracts.forEach(c => {
                const item = document.createElement('div');
                item.style.cssText = 'background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center;';
                item.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:0.25rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="color:var(--accent-cyan); font-weight:700;">[${escapeHtml(c.id)}]</span>
                            <span style="color:#fff; font-weight:600;">${escapeHtml(c.title || c.statement || c.description || '')}</span>
                        </div>
                        <div style="color:var(--text-muted); font-size:0.72rem;">${escapeHtml(c.statement || c.description || '')}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="color:var(--accent-emerald); font-size:0.72rem; border:1px solid rgba(16,185,129,0.3); background:rgba(16,185,129,0.1); padding:2px 8px; border-radius:4px;">Actif (Exit 0)</span>
                    </div>
                `;
                centralGovInvariantsList.appendChild(item);
            });
        } catch (e) {
            centralGovInvariantsList.innerHTML = `<div style="color:var(--accent-rose); padding:0.5rem;">Erreur chargement gouvernance : ${e.message}</div>`;
        }
    }

    if (btnCentralRunInvariants) {
        btnCentralRunInvariants.addEventListener('click', async () => {
            btnCentralRunInvariants.disabled = true;
            btnCentralRunInvariants.textContent = 'Validation en cours...';
            try {
                const res = await fetch('/api/ide/governance/check_invariants', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ root: state.currentRoot || '.' })
                });
                const data = await res.json();
                alert(`Résultat Invariants :\nSuccès : ${data.success ? '100% PASS' : 'ÉCHEC'}\n${data.output || ''}`);
                refreshCentralGovernance();
            } catch (err) {
                alert(`Erreur : ${err.message}`);
            } finally {
                btnCentralRunInvariants.disabled = false;
                btnCentralRunInvariants.textContent = '⚡ Revalider les Invariants';
            }
        });
    }

    if (btnOpenKbTab) {
        btnOpenKbTab.addEventListener('click', () => {
            const isKbActive = centralKbView && centralKbView.style.display === 'block';
            if (isKbActive) {
                // Fermer la KB et restaurer Monaco
                centralKbView.style.display = 'none';
                if (centralGovView) centralGovView.style.display = 'none';
                monacoEditorContainer.style.display = 'block';
                btnOpenKbTab.style.background = 'rgba(244, 63, 94, 0.1)';
                if (editorInstance) editorInstance.layout();
            } else {
                // Afficher la KB en plein panneau central
                monacoEditorContainer.style.display = 'none';
                if (monacoDiffContainer) monacoDiffContainer.style.display = 'none';
                if (centralGovView) centralGovView.style.display = 'none';
                centralKbView.style.display = 'block';
                btnOpenKbTab.style.background = 'rgba(244, 63, 94, 0.35)';
                if (!centralKbInstance) {
                    centralKbInstance = new KbView('central-kb-view');
                } else {
                    centralKbInstance.loadEntries();
                }
            }
        });
    }

    if (actBtnKb) {
        actBtnKb.addEventListener('click', () => {
            if (btnOpenKbTab) btnOpenKbTab.click();
        });
    }
    if (actBtnSettings) actBtnSettings.addEventListener('click', () => switchSidebarView('settings'));
    if (btnOpenSettings) btnOpenSettings.addEventListener('click', () => switchSidebarView('settings'));

    async function loadPreferences() {
        try {
            // 1. Charger la liste complète des fournisseurs de modèles
            const modelsRes = await fetch('/api/ide/models');
            state.models = await modelsRes.json();
            renderModelsList();

            // 2. Charger les paramètres généraux
            const res = await fetch('/api/ide/settings');
            const data = await res.json();
            if (data.default_model) prefDefaultModel.value = data.default_model;
            if (data.python_interpreter) prefPythonPath.value = data.python_interpreter;
            if (data.editor_font_size) {
                prefEditorFontSize.value = data.editor_font_size;
                if (editorInstance) editorInstance.updateOptions({ fontSize: parseInt(data.editor_font_size) });
            }
            if (data.editor_tab_size) {
                prefEditorTabSize.value = data.editor_tab_size;
                if (editorInstance) editorInstance.updateOptions({ tabSize: parseInt(data.editor_tab_size) });
            }
        } catch (e) { }
    }

    function renderModelsList() {
        if (!modelsCardsList) return;
        modelsCardsList.innerHTML = '';
        prefDefaultModel.innerHTML = '';

        if (!state.models || state.models.length === 0) {
            modelsCardsList.innerHTML = '<div style="color:var(--text-muted); font-size:0.72rem; text-align:center; padding:0.5rem;">Aucun modèle configuré</div>';
            return;
        }

        state.models.forEach(m => {
            // Remplir le select du modèle par défaut
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.name} (${m.model || m.provider_type})`;
            prefDefaultModel.appendChild(opt);

            // Carte du modèle dans la liste
            const card = document.createElement('div');
            card.style.cssText = `
                background: ${m.is_enabled ? 'rgba(30, 41, 59, 0.7)' : 'rgba(15, 23, 42, 0.4)'};
                border: 1px solid ${m.is_enabled ? 'var(--border-subtle)' : 'rgba(255,255,255,0.05)'};
                border-radius: 4px;
                padding: 0.5rem 0.6rem;
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
                font-size: 0.72rem;
            `;

            const keyBadge = m.has_key ? '<span style="color:var(--accent-emerald); font-size:0.65rem;">🔑 Clé active</span>' : '<span style="color:var(--text-muted); font-size:0.65rem;">Pas de clé</span>';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; color:${m.is_enabled ? 'var(--text-primary)' : 'var(--text-muted)'};">${escapeHtml(m.name)}</span>
                    <div style="display:flex; gap:4px; align-items:center;">
                        <button class="icon-btn btn-toggle-m" title="${m.is_enabled ? 'Désactiver' : 'Activer'}" style="font-size:0.68rem; color:${m.is_enabled ? 'var(--accent-emerald)' : 'var(--text-muted)'};">
                            ${m.is_enabled ? '● Actif' : '○ Inactif'}
                        </button>
                        <button class="icon-btn btn-edit-m" title="Modifier" style="font-size:0.68rem;">✏️</button>
                        <button class="icon-btn btn-del-m" title="Supprimer" style="font-size:0.68rem; color:var(--accent-rose);">✕</button>
                    </div>
                </div>
                <div style="color:var(--text-secondary); font-size:0.68rem; word-break:break-all;">
                    ${escapeHtml(m.base_url)} • <span style="color:var(--accent-cyan);">${escapeHtml(m.model || 'default')}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
                    <span style="text-transform:uppercase; font-size:0.65rem; color:var(--accent-amber);">${escapeHtml(m.provider_type)}</span>
                    ${keyBadge}
                </div>
            `;

            // Toggle actif/inactif
            card.querySelector('.btn-toggle-m').addEventListener('click', async () => {
                await fetch('/api/ide/model_providers/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: m.id })
                });
                loadPreferences();
            });

            // Édition
            card.querySelector('.btn-edit-m').addEventListener('click', () => {
                modelFormId.value = m.id;
                modelFormName.value = m.name;
                modelFormType.value = m.provider_type || 'openai';
                modelFormUrl.value = m.base_url;
                modelFormModel.value = m.model;
                modelFormKey.value = '';
                modelFormKey.placeholder = m.has_key ? '(Inchangée - déjà enregistrée)' : 'Optionnel';
                modelFormPane.style.display = 'flex';
            });

            // Suppression
            card.querySelector('.btn-del-m').addEventListener('click', async () => {
                if (!confirm(`Supprimer le modèle "${m.name}" ?`)) return;
                await fetch('/api/ide/model_providers/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: m.id })
                });
                loadPreferences();
            });

            modelsCardsList.appendChild(card);
        });
    }

    // Gestion du formulaire d'ajout / édition de modèle
    if (btnToggleAddModel) {
        btnToggleAddModel.addEventListener('click', () => {
            modelFormId.value = '';
            modelFormName.value = '';
            modelFormType.value = 'openai';
            modelFormUrl.value = 'http://127.0.0.1:1234';
            modelFormModel.value = 'default';
            modelFormKey.value = '';
            modelFormKey.placeholder = 'Optionnel (laisser vide si local)';
            modelFormPane.style.display = modelFormPane.style.display === 'flex' ? 'none' : 'flex';
        });
    }

    if (btnCancelModelItem) {
        btnCancelModelItem.addEventListener('click', () => {
            modelFormPane.style.display = 'none';
        });
    }

    if (btnSaveModelItem) {
        btnSaveModelItem.addEventListener('click', async () => {
            const name = modelFormName.value.trim();
            const baseUrl = modelFormUrl.value.trim();
            const model = modelFormModel.value.trim();
            const apiKey = modelFormKey.value.trim();
            const providerType = modelFormType.value;
            const existingId = modelFormId.value;

            if (!name || !baseUrl) {
                alert('Veuillez spécifier au moins un nom et une URL.');
                return;
            }

            btnSaveModelItem.disabled = true;
            try {
                const payload = {
                    id: existingId || undefined,
                    name,
                    provider_type: providerType,
                    base_url: baseUrl,
                    model: model || 'default',
                    api_key: apiKey || undefined,
                    is_enabled: true
                };
                await fetch('/api/ide/model_providers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                modelFormPane.style.display = 'none';
                await loadPreferences();
            } catch (err) {
                alert(`Erreur enregistrement modèle: ${err.message}`);
            } finally {
                btnSaveModelItem.disabled = false;
            }
        });
    }

    if (btnSavePreferences) {
        btnSavePreferences.addEventListener('click', async () => {
            btnSavePreferences.disabled = true;
            try {
                const payload = {
                    default_model: prefDefaultModel.value,
                    python_interpreter: prefPythonPath.value.trim(),
                    editor_font_size: prefEditorFontSize.value,
                    editor_tab_size: prefEditorTabSize.value
                };
                await fetch('/api/ide/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (editorInstance) {
                    editorInstance.updateOptions({
                        fontSize: parseInt(payload.editor_font_size) || 13,
                        tabSize: parseInt(payload.editor_tab_size) || 4
                    });
                }
                const modelBadge = document.getElementById('status-active-model');
                if (modelBadge) modelBadge.textContent = `Modèle : ${payload.default_model}`;
                if (prefStatusMsg) {
                    prefStatusMsg.style.display = 'block';
                    setTimeout(() => { prefStatusMsg.style.display = 'none'; }, 2000);
                }
            } catch (e) {
                alert(`Erreur sauvegarde préférences: ${e.message}`);
            } finally {
                btnSavePreferences.disabled = false;
            }
        });
    }

    // ====================================================
    // 5. COMMAND PALETTE & QUICK FILE OPEN (CTRL + P)
    // ====================================================
    async function loadAllProjectFiles() {
        try {
            const res = await fetch(`/api/ide/all_files?root=${encodeURIComponent(state.currentRoot)}`);
            const data = await res.json();
            state.allProjectFiles = (data.files || []).filter(f => !f.is_dir);
        } catch (e) { }
    }

    function openQuickOpenPalette() {
        loadAllProjectFiles();
        paletteModal.classList.add('open');
        paletteInput.value = '';
        paletteInput.focus();
        filterPalette('');
    }

    function closeQuickOpenPalette() {
        paletteModal.classList.remove('open');
    }

    btnQuickOpenTop.addEventListener('click', openQuickOpenPalette);

    function filterPalette(query) {
        paletteList.innerHTML = '';
        const q = query.toLowerCase().trim();
        const filtered = state.allProjectFiles
            .filter(f => f.path.toLowerCase().includes(q))
            .slice(0, 30);

        if (filtered.length === 0) {
            paletteList.innerHTML = `<div style="color:var(--text-muted); padding:0.5rem; text-align:center;">Aucun fichier correspondant</div>`;
            return;
        }

        filtered.forEach((f, idx) => {
            const item = document.createElement('div');
            item.className = `palette-item ${idx === 0 ? 'active' : ''}`;
            item.innerHTML = `
                <div style="font-weight:600; color:var(--text-primary);">${f.name}</div>
                <div style="font-size:0.72rem; color:var(--text-muted);">${f.path}</div>
            `;
            item.addEventListener('click', () => {
                openFile(f.path);
                closeQuickOpenPalette();
            });
            paletteList.appendChild(item);
        });
    }

    paletteInput.addEventListener('input', (e) => filterPalette(e.target.value));
    paletteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeQuickOpenPalette();
        if (e.key === 'Enter') {
            const first = paletteList.querySelector('.palette-item');
            if (first) first.click();
        }
    });

    // ====================================================
    // 6. RECHERCHE GLOBALE REGEX (CTRL + SHIFT + F)
    // ====================================================
    let searchDebounce = null;
    globalSearchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(performGlobalSearch, 300);
    });

    async function performGlobalSearch() {
        const query = globalSearchInput.value.trim();
        if (!query) {
            searchResultsList.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:1rem;">Tapez une requête</div>`;
            return;
        }
        searchResultsList.innerHTML = `<div style="color:var(--accent-cyan); font-size:0.75rem; padding:0.5rem;">Recherche en cours...</div>`;

        try {
            const res = await fetch('/api/ide/grep', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, root: state.currentRoot })
            });
            const data = await res.json();
            searchResultsList.innerHTML = '';

            if (data.matches && data.matches.length > 0) {
                searchResultsList.innerHTML = `<div style="font-size:0.72rem; color:var(--accent-emerald); margin-bottom:0.4rem;">${data.count} correspondances trouvées :</div>`;
                data.matches.forEach(m => {
                    const row = document.createElement('div');
                    row.className = 'palette-item';
                    row.style.flexDirection = 'column';
                    row.style.alignItems = 'flex-start';
                    row.innerHTML = `
                        <div style="font-weight:600; color:var(--accent-cyan);">${m.file.split('\\').pop()}:${m.line}</div>
                        <div style="font-size:0.72rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${escapeHtml(m.text)}</div>
                    `;
                    row.addEventListener('click', async () => {
                        await openFile(m.file);
                        if (editorInstance) {
                            editorInstance.revealLineInCenter(m.line);
                            editorInstance.setPosition({ lineNumber: m.line, column: 1 });
                        }
                    });
                    searchResultsList.appendChild(row);
                });
            } else {
                searchResultsList.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:1rem;">Aucun résultat pour "${query}"</div>`;
            }
        } catch (e) {
            searchResultsList.innerHTML = `<div style="color:var(--accent-rose); font-size:0.75rem;">Erreur recherche: ${e.message}</div>`;
        }
    }

    // ====================================================
    // 7. SOURCE CONTROL GIT INTÉGRÉ
    // ====================================================
    async function refreshGitStatus() {
        try {
            const res = await fetch(`/api/ide/git/status?root=${encodeURIComponent(state.currentRoot)}`);
            const data = await res.json();
            state.gitStatus = data;
            gitBranchBadge.textContent = data.branch || 'master';
            statusGitBranch.textContent = `Git: ${data.branch || 'master'}`;

            gitFilesList.innerHTML = '';
            if (!data.files || data.files.length === 0) {
                gitFilesList.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:1rem;">Arbre de travail propre (aucun changement)</div>`;
                return;
            }

            data.files.forEach(f => {
                const row = document.createElement('div');
                row.className = 'palette-item';
                const statusColor = f.status === 'modified' ? 'var(--accent-amber)' : (f.status === 'added' ? 'var(--accent-emerald)' : 'var(--accent-rose)');
                row.innerHTML = `
                    <div style="overflow:hidden; text-overflow:ellipsis;">${f.path}</div>
                    <span style="color:${statusColor}; font-weight:700; font-size:0.72rem;">${f.raw_code}</span>
                `;
                row.addEventListener('click', async () => {
                    await openFile(f.path);
                    // Basculer sur Monaco Diff
                    btnToggleDiff.click();
                });
                gitFilesList.appendChild(row);
            });
            // Monaco Markers: Appliquer les marqueurs (soulignements ondulés)
            if (window.monaco && editorInstance && editorInstance.getModel()) {
                const model = editorInstance.getModel();
                const currentFilePath = (state.activeFile || '').replace(/\\/g, '/');
                const fileMarkers = state.diagnosticsList
                    .filter(d => (d.file.replace(/\\/g, '/')).endsWith(currentFilePath) || currentFilePath.endsWith(d.file.replace(/\\/g, '/')))
                    .map(d => ({
                        severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
                        message: d.message,
                        startLineNumber: d.line || 1,
                        startColumn: d.column || 1,
                        endLineNumber: d.line || 1,
                        endColumn: (d.column || 1) + 10
                    }));
                monaco.editor.setModelMarkers(model, 'earnest-linter', fileMarkers);
            }
        } catch (e) { }
    }

    btnGitCommit.addEventListener('click', async () => {
        const msg = gitCommitMsg.value.trim();
        if (!msg) {
            alert('Veuillez entrer un message de commit.');
            return;
        }
        btnGitCommit.disabled = true;
        try {
            const res = await fetch('/api/ide/git/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ root: state.currentRoot, message: msg })
            });
            const data = await res.json();
            if (data.status === 'success') {
                gitCommitMsg.value = '';
                refreshGitStatus();
            } else {
                alert(`Erreur git: ${data.error}`);
            }
        } finally {
            btnGitCommit.disabled = false;
        }
    });

    // ====================================================
    // 8. DIAGNOSTICS & LINTER RUST/PYTHON
    // ====================================================
    async function refreshDiagnostics() {
        try {
            const res = await fetch(`/api/ide/diagnostics?root=${encodeURIComponent(state.currentRoot)}`);
            const data = await res.json();
            state.diagnosticsList = data.diagnostics || [];
            statusProblemsCount.textContent = `${state.diagnosticsList.length} Problèmes`;

            diagnosticsListEl.innerHTML = '';
            bottomProblemsContent.innerHTML = '';

            if (state.diagnosticsList.length === 0) {
                diagnosticsListEl.innerHTML = `<div style="color:var(--accent-emerald); font-size:0.75rem; text-align:center; padding:1rem;">✓ Aucun problème détecté</div>`;
                bottomProblemsContent.innerHTML = `<div style="color:var(--accent-emerald); text-align:center; padding:1rem;">✓ Tout compile parfaitement</div>`;
                return;
            }

            state.diagnosticsList.forEach(diag => {
                const color = diag.severity === 'error' ? 'var(--accent-rose)' : 'var(--accent-amber)';
                const item = document.createElement('div');
                item.className = 'palette-item';
                item.style.flexDirection = 'column';
                item.style.alignItems = 'flex-start';
                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div style="color:${color}; font-weight:700;">[${diag.severity.toUpperCase()}] ${diag.file.split('/').pop()}:${diag.line}</div>
                        <button class="btn-fix-with-ai" style="background:rgba(99,102,241,0.2); border:1px solid var(--accent-cyan); color:var(--accent-cyan); font-size:0.65rem; padding:1px 6px; border-radius:3px; cursor:pointer;" title="Demander au Pair Programmer de corriger ce problème">⚡ Corriger</button>
                    </div>
                    <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:2px;">${escapeHtml(diag.message)}</div>
                    <div style="font-size:0.65rem; color:var(--text-muted); font-family:var(--font-mono); margin-top:1px;">${escapeHtml(diag.file)}</div>
                `;

                const attachEvents = (element) => {
                    // Clic n'importe où sur l'élément : Ouvre le fichier et saute à la ligne
                    element.addEventListener('click', async (e) => {
                        if (e.target.classList.contains('btn-fix-with-ai')) return;
                        await openFile(diag.file);
                        if (editorInstance) {
                            editorInstance.revealLineInCenter(diag.line);
                            editorInstance.setPosition({ lineNumber: diag.line, column: diag.column });
                        }
                    });

                    // Clic sur "⚡ Corriger" : Ouvre le fichier ET envoie la consigne au Copilote
                    const btnFix = element.querySelector('.btn-fix-with-ai');
                    if (btnFix) {
                        btnFix.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            await openFile(diag.file);
                            if (editorInstance) {
                                editorInstance.revealLineInCenter(diag.line);
                                editorInstance.setPosition({ lineNumber: diag.line, column: diag.column });
                            }
                            if (agentPrompt) {
                                agentPrompt.value = `Corrige ce problème détecté dans ${diag.file} à la ligne ${diag.line} :\n[${diag.severity}] ${diag.message}`;
                                agentPrompt.focus();
                            }
                        });
                    }
                };

                const itemClone = item.cloneNode(true);
                attachEvents(item);
                attachEvents(itemClone);

                diagnosticsListEl.appendChild(item);
                bottomProblemsContent.appendChild(itemClone);
            });
            // Monaco Markers: Appliquer les marqueurs (soulignements ondulés)
            if (window.monaco && editorInstance && editorInstance.getModel()) {
                const model = editorInstance.getModel();
                const currentFilePath = (state.activeFile || '').replace(/\\/g, '/');
                const fileMarkers = state.diagnosticsList
                    .filter(d => (d.file.replace(/\\/g, '/')).endsWith(currentFilePath) || currentFilePath.endsWith(d.file.replace(/\\/g, '/')))
                    .map(d => ({
                        severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
                        message: d.message,
                        startLineNumber: d.line || 1,
                        startColumn: d.column || 1,
                        endLineNumber: d.line || 1,
                        endColumn: (d.column || 1) + 10
                    }));
                monaco.editor.setModelMarkers(model, 'earnest-linter', fileMarkers);
            }
        } catch (e) { }
    }

    btnRefreshDiagnostics.addEventListener('click', refreshDiagnostics);

    // ====================================================
    // 9. MULTI-TERMINAUX (SHELL 1 & SHELL 2)
    // ====================================================
    function switchBottomTab(tabName) {
        state.activeBottomTab = tabName;
        [btnTabTerm1, btnTabTerm2, btnTabProblems].forEach(b => b.classList.remove('active'));
        [paneTerm1, paneTerm2, paneProblems].forEach(p => p.classList.remove('active'));

        if (tabName === 'term-1') {
            btnTabTerm1.classList.add('active');
            paneTerm1.classList.add('active');
            terminalInput1.focus();
        } else if (tabName === 'term-2') {
            btnTabTerm2.classList.add('active');
            paneTerm2.classList.add('active');
            terminalInput2.focus();
        } else if (tabName === 'problems') {
            btnTabProblems.classList.add('active');
            paneProblems.classList.add('active');
            refreshDiagnostics();
        }
    }

    btnTabTerm1.addEventListener('click', () => switchBottomTab('term-1'));
    btnTabTerm2.addEventListener('click', () => switchBottomTab('term-2'));
    btnTabProblems.addEventListener('click', () => switchBottomTab('problems'));

    function bindTerminal(inputEl, outputEl) {
        inputEl.addEventListener('keydown', async (e) => {
            if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
                // Interruption de commande style Ctrl+C
                const cancelLine = document.createElement('div');
                cancelLine.style.color = 'var(--accent-amber)';
                cancelLine.textContent = '^C (Interrompu)';
                outputEl.appendChild(cancelLine);
                outputEl.scrollTop = outputEl.scrollHeight;
                inputEl.value = '';
                return;
            }

            if (e.key === 'Enter') {
                const cmd = inputEl.value.trim();
                if (!cmd) return;
                inputEl.value = '';
                const line = document.createElement('div');
                line.style.color = 'var(--accent-cyan)';
                line.textContent = `> ${cmd}`;
                outputEl.appendChild(line);

                const runningLine = document.createElement('div');
                runningLine.style.color = 'var(--text-muted)';
                runningLine.style.fontStyle = 'italic';
                runningLine.textContent = '⏳ Exécution en cours... (Ctrl+C pour annuler)';
                outputEl.appendChild(runningLine);
                outputEl.scrollTop = outputEl.scrollHeight;

                try {
                    const res = await fetch('/api/ide/terminal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ command: cmd, timeout_secs: 60 })
                    });
                    const data = await res.json();
                    runningLine.remove();

                    if (data.stdout) {
                        const outDiv = document.createElement('div');
                        outDiv.style.whiteSpace = 'pre-wrap';
                        outDiv.textContent = data.stdout.trimEnd();
                        outputEl.appendChild(outDiv);
                    }
                    if (data.stderr) {
                        const errDiv = document.createElement('div');
                        errDiv.style.whiteSpace = 'pre-wrap';
                        errDiv.style.color = 'var(--accent-rose)';
                        errDiv.textContent = data.stderr.trimEnd();
                        outputEl.appendChild(errDiv);
                    }

                    const footerLine = document.createElement('div');
                    footerLine.style.fontSize = '0.68rem';
                    footerLine.style.color = data.exit_code === 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)';
                    footerLine.textContent = `[Exit ${data.exit_code} en ${data.duration_ms}ms]`;
                    outputEl.appendChild(footerLine);

                    outputEl.scrollTop = outputEl.scrollHeight;
                } catch (err) {
                    runningLine.remove();
                    const errDiv = document.createElement('div');
                    errDiv.style.color = 'var(--accent-rose)';
                    errDiv.textContent = `Erreur exécution: ${err.message}`;
                    outputEl.appendChild(errDiv);
                }
            }
        });
    }

    bindTerminal(terminalInput1, terminalOutput1);
    bindTerminal(terminalInput2, terminalOutput2);

    btnToggleBottom.addEventListener('click', () => {
        centerPane.classList.toggle('bottom-panel-closed');
        if (editorInstance) editorInstance.layout();
        if (diffEditorInstance) diffEditorInstance.layout();
    });
    btnCloseBottom.addEventListener('click', () => {
        centerPane.classList.add('bottom-panel-closed');
        if (editorInstance) editorInstance.layout();
    });

    btnClearTerminal.addEventListener('click', () => {
        if (state.activeBottomTab === 'term-1') terminalOutput1.innerHTML = '';
        if (state.activeBottomTab === 'term-2') terminalOutput2.innerHTML = '';
    });

    // ====================================================
    // 10. RACCOURCIS CLAVIER GLOBAUX & MENU BAR DESKTOP
    // ====================================================
    // Fermeture de tous les menus déroulants lors d'un clic extérieur
    window.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-dropdown')) {
            document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
            document.querySelectorAll('.menu-bar-btn').forEach(b => b.classList.remove('active'));
        }
    });

    function setupMenuDropdown(btnId, dropdownId) {
        const btn = document.getElementById(btnId);
        const dropdown = document.getElementById(dropdownId);
        if (!btn || !dropdown) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('show');
            document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
            document.querySelectorAll('.menu-bar-btn').forEach(b => b.classList.remove('active'));
            if (!isOpen) {
                dropdown.classList.add('show');
                btn.classList.add('active');
            }
        });
    }

    setupMenuDropdown('menu-btn-file', 'menu-dropdown-file');
    setupMenuDropdown('menu-btn-edit', 'menu-dropdown-edit');
    setupMenuDropdown('menu-btn-view', 'menu-dropdown-view');
    setupMenuDropdown('menu-btn-gov', 'menu-dropdown-gov');

    // Câblage des items du menu Fichier
    const mFileNew = document.getElementById('m-file-new');
    const mFileOpen = document.getElementById('m-file-open');
    const mFileSave = document.getElementById('m-file-save');
    const mFileClose = document.getElementById('m-file-close');
    const mFileProjects = document.getElementById('m-file-projects');

    if (mFileNew) mFileNew.addEventListener('click', () => {
        const btnNewFile = document.getElementById('btn-new-file');
        if (btnNewFile) btnNewFile.click();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mFileOpen) mFileOpen.addEventListener('click', () => {
        openQuickOpenPalette();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mFileSave) mFileSave.addEventListener('click', () => {
        saveCurrentFile();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mFileClose) mFileClose.addEventListener('click', () => {
        if (state.activeTabPath) closeTab(state.activeTabPath);
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mFileProjects) mFileProjects.addEventListener('click', () => {
        const btnProj = document.getElementById('btn-project-manager');
        if (btnProj) btnProj.click();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });

    // Câblage des items du menu Édition
    const mEditAi = document.getElementById('m-edit-ai');
    const mEditSearch = document.getElementById('m-edit-search');
    const mEditDiff = document.getElementById('m-edit-diff');

    if (mEditAi) mEditAi.addEventListener('click', () => {
        showInlineAiWidget();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mEditSearch) mEditSearch.addEventListener('click', () => {
        switchSidebarView('search');
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mEditDiff) mEditDiff.addEventListener('click', () => {
        btnToggleDiff.click();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });

    // Câblage des items du menu Affichage
    const mViewExplorer = document.getElementById('m-view-explorer');
    const mViewTerminal = document.getElementById('m-view-terminal');
    const mViewAgent = document.getElementById('m-view-agent');
    const mViewKbFull = document.getElementById('m-view-kb-full');
    const mViewDiagnostics = document.getElementById('m-view-diagnostics');

    if (mViewExplorer) mViewExplorer.addEventListener('click', () => {
        toggleSidebar(true);
        switchSidebarView('explorer');
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mViewTerminal) mViewTerminal.addEventListener('click', () => {
        centerPane.classList.toggle('bottom-panel-closed');
        if (editorInstance) editorInstance.layout();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mViewAgent) mViewAgent.addEventListener('click', () => {
        toggleAgent();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mViewKbFull) mViewKbFull.addEventListener('click', () => {
        if (btnOpenKbTab) btnOpenKbTab.click();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mViewDiagnostics) mViewDiagnostics.addEventListener('click', () => {
        toggleSidebar(true);
        switchSidebarView('diagnostics');
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });

    // Câblage des items du menu Gouvernance
    const mGovCockpit = document.getElementById('m-gov-cockpit');
    const mGovKb = document.getElementById('m-gov-kb');
    const mGovRefresh = document.getElementById('m-gov-refresh');

    if (mGovCockpit) mGovCockpit.addEventListener('click', () => {
        openCentralGovernanceView();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mGovKb) mGovKb.addEventListener('click', () => {
        if (btnOpenKbTab) btnOpenKbTab.click();
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
    });
    if (mGovRefresh) mGovRefresh.addEventListener('click', async () => {
        document.querySelectorAll('.menu-dropdown-content').forEach(d => d.classList.remove('show'));
        openCentralGovernanceView();
        if (btnCentralRunInvariants) btnCentralRunInvariants.click();
    });

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            openQuickOpenPalette();
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
            e.preventDefault();
            toggleSidebar(true);
            switchSidebarView('search');
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
            e.preventDefault();
            toggleSidebar();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
            e.preventDefault();
            toggleAgent();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.key === '~')) {
            e.preventDefault();
            centerPane.classList.toggle('bottom-panel-closed');
            if (editorInstance) editorInstance.layout();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveCurrentFile();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            e.preventDefault();
            if (state.activeTabPath) closeTab(state.activeTabPath);
        }
    });

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ====================================================
    // 11. RESTAURATION DE SESSION & INITIALISATION
    // ====================================================
    function saveSessionState() {
        const sessionData = {
            currentRoot: state.currentRoot,
            openTabsPaths: state.openTabs.map(t => t.path),
            activeTabPath: state.activeTabPath
        };
        try { localStorage.setItem('earnest_ide_session', JSON.stringify(sessionData)); } catch (e) { }
    }

    async function restoreSessionState() {
        try {
            const raw = localStorage.getItem('earnest_ide_session');
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (data.currentRoot) state.currentRoot = data.currentRoot;
            if (Array.isArray(data.openTabsPaths) && data.openTabsPaths.length > 0) {
                for (const p of data.openTabsPaths) await openFile(p);
                if (data.activeTabPath) switchTab(data.activeTabPath);
                return true;
            }
        } catch (e) { }
        return false;
    }

    // Explorateur de base récursif (dossiers extensibles / refermables)
    async function loadTree() {
        const treeRoot = document.getElementById('tree-root');
        treeRoot.innerHTML = '';
        await renderDirectoryNode(treeRoot, state.currentRoot, 0);
    }

    async function renderDirectoryNode(containerEl, dirPath, depth) {
        try {
            const res = await fetch(`/api/ide/tree?root=${encodeURIComponent(dirPath)}`);
            const data = await res.json();
            const entries = data.entries || [];

            // Trier les dossiers en premier puis fichiers
            entries.sort((a, b) => {
                if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                return a.is_dir ? -1 : 1;
            });

            entries.forEach(entry => {
                const nodeWrapper = document.createElement('div');
                nodeWrapper.className = 'tree-item-group';

                const row = document.createElement('div');
                row.className = 'tree-node-row';
                row.style.paddingLeft = `${depth * 14 + 10}px`;

                const isExpanded = state.expandedDirs.has(entry.path);

                row.innerHTML = `
                    <span class="tree-icon">${entry.is_dir ? (isExpanded ? '📂' : '📁') : '📄'}</span>
                    <span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${entry.name}</span>
                `;

                row.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showTreeContextMenu(e.clientX, e.clientY, entry);
                });

                if (entry.is_dir) {
                    const childrenContainer = document.createElement('div');
                    childrenContainer.className = 'tree-children';
                    childrenContainer.style.display = isExpanded ? 'block' : 'none';

                    row.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (state.expandedDirs.has(entry.path)) {
                            state.expandedDirs.delete(entry.path);
                            childrenContainer.style.display = 'none';
                            row.querySelector('.tree-icon').textContent = '📁';
                        } else {
                            state.expandedDirs.add(entry.path);
                            childrenContainer.style.display = 'block';
                            row.querySelector('.tree-icon').textContent = '📂';
                            if (childrenContainer.children.length === 0) {
                                childrenContainer.innerHTML = '<div style="padding-left:24px; color:var(--text-muted); font-size:0.7rem;">Chargement...</div>';
                                childrenContainer.innerHTML = '';
                                await renderDirectoryNode(childrenContainer, entry.path, depth + 1);
                            }
                        }
                    });

                    nodeWrapper.appendChild(row);
                    nodeWrapper.appendChild(childrenContainer);

                    if (isExpanded) {
                        renderDirectoryNode(childrenContainer, entry.path, depth + 1);
                    }
                } else {
                    row.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openFile(entry.path);
                    });
                    nodeWrapper.appendChild(row);
                }

                containerEl.appendChild(nodeWrapper);
            });
        } catch (e) {
            containerEl.innerHTML = `<div style="color:var(--accent-rose); font-size:0.75rem; padding:0.5rem;">Erreur dossier: ${e.message}</div>`;
        }
    }

    document.getElementById('btn-refresh-tree').addEventListener('click', loadTree);

    // Menu contextuel de l'arborescence (P1)
    let treeCtxMenu = null;
    function hideTreeContextMenu() {
        if (treeCtxMenu) {
            treeCtxMenu.remove();
            treeCtxMenu = null;
        }
    }
    document.addEventListener('click', hideTreeContextMenu);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideTreeContextMenu();
    });

    function showTreeContextMenu(x, y, entry) {
        hideTreeContextMenu();
        const menu = document.createElement('div');
        menu.id = 'tree-context-menu';
        menu.style.cssText = `
            position: fixed; left: ${x}px; top: ${y}px; z-index: 9999;
            background: #161b22; border: 1px solid var(--border-subtle);
            border-radius: 6px; padding: 4px 0; min-width: 185px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.45); font-size: 0.78rem;
            color: var(--text-primary); font-family: var(--font-sans);
        `;

        const normPath = entry.path.replace(/\\/g, '/');
        const parentDir = entry.is_dir ? normPath : (normPath.includes('/') ? normPath.slice(0, normPath.lastIndexOf('/')) : '.');

        const addItem = (label, icon, onClick, danger = false) => {
            const btn = document.createElement('div');
            btn.style.cssText = `
                padding: 6px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;
                color: ${danger ? 'var(--accent-rose)' : 'var(--text-primary)'};
            `;
            btn.innerHTML = `<span>${icon}</span><span>${label}</span>`;
            btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(99, 102, 241, 0.15)');
            btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
            btn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                hideTreeContextMenu();
                await onClick();
            });
            menu.appendChild(btn);
        };

        const addSep = () => {
            const sep = document.createElement('div');
            sep.style.cssText = 'height: 1px; background: var(--border-subtle); margin: 4px 0;';
            menu.appendChild(sep);
        };

        addItem('Nouveau fichier', '📄', async () => {
            const name = prompt(`Nom du nouveau fichier dans "${parentDir}" :`);
            if (!name || !name.trim()) return;
            const target = parentDir === '.' ? name.trim() : `${parentDir}/${name.trim()}`;
            const res = await fetch('/api/ide/create_item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: target, is_dir: false })
            });
            const data = await res.json();
            if (data.error) return alert(`Erreur: ${data.error}`);
            if (entry.is_dir) state.expandedDirs.add(entry.path);
            await loadTree();
            await openFile(target);
        });

        addItem('Nouveau dossier', '📁', async () => {
            const name = prompt(`Nom du nouveau dossier dans "${parentDir}" :`);
            if (!name || !name.trim()) return;
            const target = parentDir === '.' ? name.trim() : `${parentDir}/${name.trim()}`;
            const res = await fetch('/api/ide/create_item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: target, is_dir: true })
            });
            const data = await res.json();
            if (data.error) return alert(`Erreur: ${data.error}`);
            if (entry.is_dir) state.expandedDirs.add(entry.path);
            await loadTree();
        });

        addSep();

        addItem('Renommer', '✏️', async () => {
            const newName = prompt('Nouveau nom :', entry.name);
            if (!newName || !newName.trim() || newName.trim() === entry.name) return;
            const target = parentDir === '.' ? newName.trim() : `${parentDir}/${newName.trim()}`;
            const res = await fetch('/api/ide/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_path: normPath, new_path: target })
            });
            const data = await res.json();
            if (data.error) return alert(`Erreur: ${data.error}`);
            const openTab = state.openTabs.find(t => t.path === normPath);
            if (openTab) {
                openTab.path = target;
                openTab.name = newName.trim();
                if (state.activeTabPath === normPath) state.activeTabPath = target;
                renderTabs();
            }
            await loadTree();
        });

        addItem('Copier le chemin', '📋', async () => {
            try {
                await navigator.clipboard.writeText(normPath);
            } catch (e) {
                prompt('Chemin :', normPath);
            }
        });

        addSep();

        addItem('Supprimer', '🗑️', async () => {
            if (!confirm(`Supprimer définitivement "${normPath}" ?`)) return;
            const res = await fetch('/api/ide/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: normPath })
            });
            const data = await res.json();
            if (data.error) return alert(`Erreur: ${data.error}`);
            if (state.openTabs.some(t => t.path === normPath)) {
                closeTab(normPath);
            }
            await loadTree();
        }, true);

        document.body.appendChild(menu);
        treeCtxMenu = menu;
    }

    // ====================================================
    // 10. ASSISTANT RE-ACT COPILOTE / PAIR PROGRAMMER
    // ====================================================
    async function executeAgentPrompt() {
        const text = agentPrompt.value.trim();
        if (!text) return;

        agentPrompt.value = '';
        btnAgentSend.disabled = true;

        // Bulle utilisateur
        const userBubble = document.createElement('div');
        userBubble.className = 'chat-bubble user';
        userBubble.style.cssText = `
            background: rgba(99, 102, 241, 0.15);
            border: 1px solid var(--accent-cyan);
            padding: 0.65rem 0.75rem;
            border-radius: 4px;
            font-size: 0.78rem;
            align-self: flex-end;
            max-width: 90%;
        `;
        userBubble.textContent = text;
        chatStream.appendChild(userBubble);

        // Bulle réponse assistant
        const assistantBubble = document.createElement('div');
        assistantBubble.className = 'chat-bubble assistant';
        assistantBubble.style.cssText = `
            background: rgba(30, 41, 59, 0.5);
            border: 1px solid var(--border-subtle);
            padding: 0.75rem;
            border-radius: 4px;
            font-size: 0.78rem;
            line-height: 1.45;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        `;
        assistantBubble.innerHTML = `<div style="color:var(--accent-cyan); font-weight:600;">⚡ Earnest Copilote réfléchit...</div>`;
        const hbEl = document.createElement('div');
        hbEl.className = 'agent-heartbeat';
        hbEl.style.cssText = 'font-size:0.75rem; color:var(--text-muted); font-style:italic; margin-top:0.25rem;';
        hbEl.textContent = '⏳ En cours… (0s)';
        assistantBubble.appendChild(hbEl);
        const hbStart = Date.now();
        const hbTimer = setInterval(() => {
            const sec = Math.floor((Date.now() - hbStart) / 1000);
            if (!hbEl.isConnected) {
                assistantBubble.appendChild(hbEl);
            }
            hbEl.textContent = `⏳ En cours… (${sec}s)`;
        }, 1000);
        chatStream.appendChild(assistantBubble);
        chatStream.scrollTop = chatStream.scrollHeight;

        try {
            // P5 : Résolution des @mentions de fichiers dans le prompt
            let enrichedPrompt = text;
            const mentionMatches = [...text.matchAll(/@([^\s@]+)/g)].map(m => m[1]);
            if (mentionMatches.length > 0) {
                const uniqueMentions = [...new Set(mentionMatches)];
                const attachedContexts = [];
                for (const mPath of uniqueMentions) {
                    try {
                        const fRes = await fetch(`/api/ide/file?path=${encodeURIComponent(mPath)}`);
                        if (fRes.ok) {
                            const fData = await fRes.json();
                            if (fData.content !== undefined) {
                                attachedContexts.push(`\n--- Contenu de @${mPath} ---\n\`\`\`\n${fData.content.slice(0, 12000)}\n\`\`\``);
                            }
                        }
                    } catch (_) { }
                }
                if (attachedContexts.length > 0) {
                    enrichedPrompt = `${text}\n\n[Fichiers mentionnés]${attachedContexts.join('\n')}`;
                }
            }

            const res = await fetch('/api/ide/run/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: enrichedPrompt, project: state.currentRoot || 'earnest_ide_workspace' })
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n\n');
                buffer = lines.pop(); // Conserver le reliquat

                for (const chunk of lines) {
                    const dataLine = chunk.split('\n').find(l => l.startsWith('data: '));
                    if (!dataLine) continue;
                    try {
                        const payload = JSON.parse(dataLine.replace('data: ', ''));
                        if (payload.backend) {
                            const modelBadge = document.getElementById('status-active-model');
                            if (modelBadge) modelBadge.textContent = `Modèle : ${payload.backend}`;
                        }

                        // Événement d'exécution d'outil ou étape de pensée
                        if (payload.step_type === 'thought') {
                            const thoughtDiv = document.createElement('div');
                            thoughtDiv.style.color = 'var(--text-muted)';
                            thoughtDiv.style.fontStyle = 'italic';
                            const rawThought = `💭 ${payload.payload || ''}`;
                            const contentEl = document.createElement('div');
                            contentEl.className = 'markdown-body';
                            contentEl.innerHTML = typeof marked !== 'undefined' ? marked.parse(rawThought) : escapeHtml(rawThought);
                            thoughtDiv.appendChild(contentEl);

                            if (rawThought.split('\n').length > 10 || rawThought.length > 600) {
                                contentEl.style.maxHeight = '14em';
                                contentEl.style.overflow = 'hidden';
                                const toggleBtn = document.createElement('button');
                                toggleBtn.textContent = '+ Voir plus';
                                toggleBtn.style.cssText = 'background:none; border:1px solid var(--border-subtle); color:var(--accent-cyan); font-size:0.72rem; padding:2px 8px; border-radius:4px; cursor:pointer; margin-top:4px;';
                                toggleBtn.addEventListener('click', () => {
                                    const expanded = contentEl.style.maxHeight === 'none';
                                    contentEl.style.maxHeight = expanded ? '14em' : 'none';
                                    toggleBtn.textContent = expanded ? '+ Voir plus' : '- Réduire';
                                });
                                thoughtDiv.appendChild(toggleBtn);
                            }
                            assistantBubble.appendChild(thoughtDiv);
                        } else if (payload.step_type === 'tool_call' || payload.step_type === 'action') {
                            const actionDiv = document.createElement('div');
                            actionDiv.style.cssText = 'color:#fde68a; font-weight:500; font-size:0.8rem; padding:4px 8px; background:rgba(253,230,138,0.06); border-left:2px solid rgba(253,230,138,0.35); border-radius:3px;';
                            const rawAction = `⚙️ Outil : ${payload.tool_name} (${payload.payload || ''})`;
                            const actionText = document.createElement('div');
                            actionText.textContent = rawAction;
                            actionDiv.appendChild(actionText);

                            if (rawAction.length > 220 || rawAction.split('\n').length > 3) {
                                actionText.style.maxHeight = '4.5em';
                                actionText.style.overflow = 'hidden';
                                const toggleBtn = document.createElement('button');
                                toggleBtn.textContent = '+ Voir plus';
                                toggleBtn.style.cssText = 'background:none; border:1px solid rgba(253,230,138,0.3); color:#fde68a; font-size:0.7rem; padding:1px 7px; border-radius:4px; cursor:pointer; margin-top:4px;';
                                toggleBtn.addEventListener('click', () => {
                                    const expanded = actionText.style.maxHeight === 'none';
                                    actionText.style.maxHeight = expanded ? '4.5em' : 'none';
                                    toggleBtn.textContent = expanded ? '+ Voir plus' : '- Réduire';
                                });
                                actionDiv.appendChild(toggleBtn);
                            }
                            assistantBubble.appendChild(actionDiv);
                        } else if (payload.step_type === 'tool_output') {
                            // Interception des interruptions d'approbation asynchrone (Contrainte 5)
                            try {
                                const outObj = JSON.parse(payload.payload);
                                if (outObj.merged_to_workspace && typeof loadTree === 'function') {
                                    loadTree();
                                }
                                if (outObj.status === 'awaiting_approval') {
                                    if (outObj.action === 'architecture_review') {
                                        openGovernanceApproval({
                                            type: 'architecture_review',
                                            summary: outObj.summary,
                                            invariants_hash: outObj.invariants_hash
                                        });
                                    } else if (outObj.action === 'contract_mutation') {
                                        openGovernanceApproval({
                                            type: 'contract_mutation',
                                            target_contract_id: outObj.target_contract_id,
                                            reason: outObj.reason,
                                            diff: outObj.diff,
                                            updated_probes: outObj.updated_probes
                                        });
                                    } else if (outObj.action === 'checkpoint_status') {
                                        openGovernanceApproval({
                                            type: 'checkpoint_status',
                                            failed_probe_id: outObj.failed_probe_id,
                                            root_cause_analysis: outObj.root_cause_analysis,
                                            next_attempt_strategy: outObj.next_attempt_strategy
                                        });
                                    }
                                }
                            } catch (_) { }
                        } else if (payload.status === 'completed' || (payload.status && payload.status.startsWith('awaiting_approval'))) {
                            // Réponse finale terminée ou interrompue pour approbation
                            const finalAnswer = document.createElement('div');
                            finalAnswer.className = 'markdown-body';
                            finalAnswer.style.color = 'var(--text-primary)';
                            const ansText = payload.answer || 'Tâche terminée avec succès.';
                            finalAnswer.innerHTML = typeof marked !== 'undefined' ? marked.parse(ansText) : escapeHtml(ansText);
                            assistantBubble.appendChild(finalAnswer);

                            const metaDiv = document.createElement('div');
                            metaDiv.style.cssText = 'font-size:0.68rem; color:var(--text-muted); margin-top:4px; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;';
                            metaDiv.textContent = `Durée: ${payload.duration_ms}ms • Tokens: ${payload.tokens}`;
                            assistantBubble.appendChild(metaDiv);

                            // Actualiser les vues au cas où des fichiers ont été modifiés
                            refreshGitStatus();
                            refreshDiagnostics();
                            loadTree();
                        } else if (payload.error) {
                            const errDiv = document.createElement('div');
                            errDiv.style.color = 'var(--accent-rose)';
                            errDiv.textContent = `⚠️ Erreur : ${payload.error}`;
                            assistantBubble.appendChild(errDiv);
                        }
                    } catch (e) { }
                    chatStream.scrollTop = chatStream.scrollHeight;
                }
            }
        } catch (err) {
            assistantBubble.innerHTML = `<div style="color:var(--accent-rose);">❌ Erreur d'exécution Copilote: ${escapeHtml(err.message)}</div>`;
        } finally {
            clearInterval(hbTimer);
            hbEl.remove();
            btnAgentSend.disabled = false;
        }
    }

    if (btnAgentSend) {
        btnAgentSend.addEventListener('click', executeAgentPrompt);
    }
    if (agentPrompt) {
        let mentionPopup = null;
        function closeMentionPopup() {
            if (mentionPopup) {
                mentionPopup.remove();
                mentionPopup = null;
            }
        }

        agentPrompt.addEventListener('input', () => {
            const val = agentPrompt.value;
            const cursor = agentPrompt.selectionStart || val.length;
            const before = val.slice(0, cursor);
            const match = before.match(/@([^\s@]*)$/);
            if (!match) return closeMentionPopup();

            const query = match[1].toLowerCase();
            const matches = (state.allProjectFiles || [])
                .filter(f => f.path.toLowerCase().includes(query))
                .slice(0, 8);

            if (matches.length === 0) return closeMentionPopup();

            closeMentionPopup();
            mentionPopup = document.createElement('div');
            mentionPopup.id = 'agent-mention-popup';
            const rect = agentPrompt.getBoundingClientRect();
            mentionPopup.style.cssText = `
                position: fixed; left: ${rect.left}px; bottom: ${window.innerHeight - rect.top + 6}px;
                width: ${Math.max(rect.width, 280)}px; max-height: 220px; overflow-y: auto;
                background: #161b22; border: 1px solid var(--accent-cyan); border-radius: 6px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 9999; font-size: 0.75rem;
            `;
            matches.forEach(f => {
                const item = document.createElement('div');
                item.style.cssText = 'padding: 6px 10px; cursor: pointer; color: var(--text-primary); border-bottom: 1px solid rgba(255,255,255,0.04);';
                item.textContent = `📄 ${f.path.replace(/\\/g, '/')}`;
                item.addEventListener('mouseenter', () => item.style.background = 'rgba(99,102,241,0.2)');
                item.addEventListener('mouseleave', () => item.style.background = 'transparent');
                item.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    const cleanPath = f.path.replace(/\\/g, '/');
                    const prefix = before.slice(0, match.index);
                    const suffix = val.slice(cursor);
                    agentPrompt.value = `${prefix}@${cleanPath} ${suffix}`;
                    closeMentionPopup();
                    agentPrompt.focus();
                });
                mentionPopup.appendChild(item);
            });
            document.body.appendChild(mentionPopup);
        });

        agentPrompt.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMentionPopup();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                closeMentionPopup();
                executeAgentPrompt();
            }
        });
    }
    const btnToggleHistory = document.getElementById('btn-toggle-history');
    const agentHistoryPane = document.getElementById('agent-history-pane');

    if (agentHistoryPane) {
        document.addEventListener('click', (e) => {
            if (agentHistoryPane.style.display !== 'none'
                && !agentHistoryPane.contains(e.target)
                && (!btnToggleHistory || !btnToggleHistory.contains(e.target))) {
                agentHistoryPane.style.display = 'none';
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && agentHistoryPane.style.display !== 'none') {
                agentHistoryPane.style.display = 'none';
            }
        });
    }

    async function loadAgentHistory() {
        if (!agentHistoryPane) return;
        agentHistoryPane.innerHTML = '<div style="color:var(--text-muted); padding:0.25rem;">Chargement historique...</div>';
        try {
            const projKey = encodeURIComponent(state.currentRoot || state.currentProjectName || 'earnest_ide_workspace');
            const res = await fetch(`/api/ide/history?project=${projKey}`);
            const runs = await res.json();
            agentHistoryPane.innerHTML = '';

            if (!runs || runs.length === 0) {
                agentHistoryPane.innerHTML = '<div style="color:var(--text-muted); padding:0.25rem;">Aucune session précédente enregistrée</div>';
                return;
            }

            runs.forEach(r => {
                const item = document.createElement('div');
                item.className = 'palette-item';
                item.style.cssText = 'padding: 0.35rem 0.5rem; border-radius: 4px; font-size: 0.72rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
                item.innerHTML = `
                    <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px;">
                        <span style="color: var(--accent-cyan); font-weight: 600;">[${r.status}]</span> ${escapeHtml(r.prompt)}
                    </div>
                    <span style="color: var(--text-muted); font-size: 0.65rem; flex-shrink: 0;">${r.created_at || ''}</span>
                `;
                item.addEventListener('click', async () => {
                    await restoreRunTraces(r.id, r.prompt);
                    agentHistoryPane.style.display = 'none';
                });
                agentHistoryPane.appendChild(item);
            });
        } catch (e) {
            agentHistoryPane.innerHTML = `<div style="color:var(--accent-rose); font-size:0.7rem;">Erreur historique: ${e.message}</div>`;
        }
    }

    async function restoreRunTraces(runId, promptText) {
        try {
            const res = await fetch(`/api/ide/run_detail?run_id=${encodeURIComponent(runId)}`);
            const data = await res.json();
            chatStream.innerHTML = '';

            // 1. Bulle prompt restaurée
            const userBubble = document.createElement('div');
            userBubble.className = 'chat-bubble user';
            userBubble.style.cssText = `
                background: rgba(99, 102, 241, 0.15);
                border: 1px solid var(--accent-cyan);
                padding: 0.65rem 0.75rem;
                border-radius: 4px;
                font-size: 0.78rem;
                align-self: flex-end;
                max-width: 90%;
            `;
            userBubble.textContent = promptText;
            chatStream.appendChild(userBubble);

            // 2. Bulle assistant restaurée
            const assistantBubble = document.createElement('div');
            assistantBubble.className = 'chat-bubble assistant';
            assistantBubble.style.cssText = `
                background: rgba(30, 41, 59, 0.5);
                border: 1px solid var(--border-subtle);
                padding: 0.75rem;
                border-radius: 4px;
                font-size: 0.78rem;
                line-height: 1.45;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            `;

            (data.traces || []).forEach(tr => {
                if (tr.step_type === 'thought') {
                    const d = document.createElement('div');
                    d.style.color = 'var(--text-muted)';
                    d.style.fontStyle = 'italic';
                    d.textContent = `💭 ${tr.payload}`;
                    assistantBubble.appendChild(d);
                } else if (tr.step_type === 'tool_call') {
                    const d = document.createElement('div');
                    d.style.cssText = 'color:var(--accent-amber); font-weight:600; padding:2px 6px; background:rgba(245,158,11,0.1); border-radius:3px;';
                    d.textContent = `⚙️ Outil : ${tr.tool_name || 'action'} (${tr.payload})`;
                    assistantBubble.appendChild(d);
                } else if (tr.step_type === 'answer') {
                    const d = document.createElement('div');
                    d.style.color = 'var(--text-primary)';
                    d.style.whiteSpace = 'pre-wrap';
                    d.textContent = tr.payload;
                    assistantBubble.appendChild(d);
                }
            });

            chatStream.appendChild(assistantBubble);
            chatStream.scrollTop = chatStream.scrollHeight;
        } catch (e) {
            alert(`Impossible de charger les traces du run: ${e.message}`);
        }
    }

    if (btnToggleHistory) {
        btnToggleHistory.addEventListener('click', () => {
            const isVisible = agentHistoryPane.style.display === 'flex';
            agentHistoryPane.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) loadAgentHistory();
        });
    }

    if (btnClearAgent) {
        btnClearAgent.addEventListener('click', () => {
            chatStream.innerHTML = `
                <div class="chat-bubble assistant" style="background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-subtle); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.8rem; line-height: 1.45;">
                    👋 Prêt pour une nouvelle consigne. Vous pouvez également cliquer sur <strong>📜 Reprendre</strong> pour recharger une session passée.
                </div>
            `;
            if (agentHistoryPane) agentHistoryPane.style.display = 'none';
        });
    }

    // ====================================================
    // 12. GESTIONNAIRE DE PROJETS MULTI-ESPACES
    // ====================================================
    const btnProjectManager = document.getElementById('btn-project-manager');
    const projectModal = document.getElementById('project-modal');
    const projectList = document.getElementById('project-list');
    const btnToggleNewProject = document.getElementById('btn-toggle-new-project');
    const newProjectForm = document.getElementById('new-project-form');
    const projNameInput = document.getElementById('proj-name-input');
    const projRootInput = document.getElementById('proj-root-input');
    const btnSubmitNewProject = document.getElementById('btn-submit-new-project');
    const btnCancelNewProject = document.getElementById('btn-cancel-new-project');
    const btnCloseProjectModal = document.getElementById('btn-close-project-modal');
    const topProjectName = document.getElementById('top-project-name');

    async function loadProjectsList() {
        try {
            const res = await fetch('/api/ide/projects');
            state.projects = await res.json();
            renderProjectsModal();
            if (!state.currentProjectId && Array.isArray(state.projects)) {
                const lastId = localStorage.getItem('earnest_last_project_id');
                const saved = lastId && state.projects.find(p => p.id === lastId || p.name === lastId);
                if (saved) {
                    switchProject(saved);
                }
            }
        } catch (e) { }
    }

    function renderProjectsModal() {
        if (!projectList) return;
        projectList.innerHTML = '';

        if (!state.projects || state.projects.length === 0) {
            // Projet par défaut si base vide
            state.projects = [{
                id: 'earnest',
                name: 'Earnest',
                root_path: '.',
                description: 'Workspace principal'
            }];
        }

        state.projects.forEach(p => {
            const isCurrent = p.id === state.currentProjectId;
            const item = document.createElement('div');
            item.className = `palette-item ${isCurrent ? 'active' : ''}`;
            item.style.cssText = 'padding: 0.6rem 0.8rem; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;';
            item.innerHTML = `
                <div style="flex: 1; cursor: pointer;">
                    <div style="font-weight: 700; color: ${isCurrent ? 'var(--accent-cyan)' : 'var(--text-primary)'}; font-size: 0.82rem;">
                        📁 ${escapeHtml(p.name)} ${isCurrent ? '<span style="font-size:0.68rem; color:var(--accent-emerald);">● Actif</span>' : ''}
                    </div>
                    <div style="color: var(--text-muted); font-size: 0.7rem; font-family: var(--font-mono);">${escapeHtml(p.root_path)}</div>
                </div>
                <div style="display: flex; gap: 6px;">
                    ${!isCurrent ? `<button class="icon-btn btn-del-proj" title="Supprimer" style="color:var(--accent-rose); font-size:0.75rem;">✕</button>` : ''}
                </div>
            `;

            item.querySelector('div').addEventListener('click', () => {
                switchProject(p);
                closeProjectModal();
            });

            const delBtn = item.querySelector('.btn-del-proj');
            if (delBtn) {
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Supprimer le projet "${p.name}" ?`)) return;
                    await fetch('/api/ide/projects/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: p.id })
                    });
                    if (state.currentProjectId === p.id) {
                        state.currentProjectId = null;
                        state.currentProjectName = null;
                        state.currentRoot = '.';
                        if (topProjectName) topProjectName.textContent = 'Aucun projet';
                    }
                    loadProjectsList();
                });
            }

            projectList.appendChild(item);
        });
    }

    async function switchProject(proj) {
        state.currentProjectId = proj.id;
        state.currentProjectName = proj.name;
        state.currentRoot = proj.root_path || '.';
        localStorage.setItem('earnest_last_project_id', proj.id || proj.name);
        fetch('/api/ide/kv_state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'earnest_last_project_id', value: String(proj.id || proj.name) })
        }).catch(() => {});
        if (topProjectName) topProjectName.textContent = `Projet : ${proj.name}`;

        // Fermer tous les onglets du projet précédent
        state.openTabs.forEach(t => { if (t.monacoModel) t.monacoModel.dispose(); });
        state.openTabs = [];
        state.activeTabPath = null;
        if (editorInstance) editorInstance.setValue('');
        renderTabs();

        // Réinitialiser l'arborescence et les caches
        state.expandedDirs = new Set([state.currentRoot]);
        await loadTree();
        await loadAllProjectFiles();
        refreshGitStatus();
        refreshDiagnostics();
        refreshGovernanceStatus();

        // Restaurer le dernier historique de chat du projet si disponible
        let restored = false;
        try {
            const pParam = encodeURIComponent(state.currentRoot || state.currentProjectName || 'earnest_ide_workspace');
            const hRes = await fetch(`/api/ide/history?project=${pParam}`);
            if (hRes.ok) {
                const hData = await hRes.json();
                const runs = hData.runs || [];
                if (runs.length > 0 && typeof restoreRunTraces === 'function') {
                    await restoreRunTraces(runs[0].id, runs[0].prompt);
                    restored = true;
                }
            }
        } catch (e) {}

        if (!restored) {
            chatStream.innerHTML = `
                <div class="chat-bubble assistant" style="background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-subtle); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.8rem; line-height: 1.45;">
                    📁 Switched to <strong>${escapeHtml(proj.name)}</strong> (Root: <code>${escapeHtml(state.currentRoot)}</code>). Dedicated context, memory, and sessions.
                </div>
            `;
        }

        saveSessionState();
    }

    function openProjectModal() {
        if (!projectModal) return;
        projectModal.classList.add('open');
        newProjectForm.style.display = 'none';
        loadProjectsList();
    }

    function closeProjectModal() {
        if (!projectModal) return;
        projectModal.classList.remove('open');
    }

    if (btnProjectManager) btnProjectManager.addEventListener('click', openProjectModal);
    if (btnCloseProjectModal) btnCloseProjectModal.addEventListener('click', closeProjectModal);
    if (btnToggleNewProject) {
        btnToggleNewProject.addEventListener('click', () => {
            const isShown = newProjectForm.style.display === 'flex';
            newProjectForm.style.display = isShown ? 'none' : 'flex';
            if (!isShown) projNameInput.focus();
        });
    }
    if (btnCancelNewProject) {
        btnCancelNewProject.addEventListener('click', () => {
            newProjectForm.style.display = 'none';
        });
    }

    if (btnSubmitNewProject) {
        btnSubmitNewProject.addEventListener('click', async () => {
            const name = projNameInput.value.trim();
            const root = projRootInput.value.trim() || '.';
            if (!name) {
                alert('Veuillez entrer un nom de projet.');
                return;
            }

            // Récupérer le mode de gouvernance choisi
            const selectedModeInput = document.querySelector('input[name="proj-gov-mode"]:checked');
            const govMode = selectedModeInput ? selectedModeInput.value : 'normal';

            try {
                const res = await fetch('/api/ide/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        root_path: root,
                        description: `Projet ${name}`
                    })
                });
                const data = await res.json();

                // Initialiser le mode de gouvernance choisi (.ide/policy.json)
                await fetch('/api/ide/governance/init_mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        root,
                        mode: govMode
                    })
                });

                projNameInput.value = '';
                projRootInput.value = '';
                newProjectForm.style.display = 'none';

                // Basculer directement sur le nouveau projet créé
                await switchProject({ id: data.id, name, root_path: root });
                closeProjectModal();
            } catch (e) {
                alert(`Erreur création projet: ${e.message}`);
            }
        });
    }

    // ====================================================
    // GOUVERNANCE PAR INVARIANTS : BADGE & MODAL APPROBATION
    // ====================================================
    const govBadge = document.getElementById('governance-badge');
    const govIndicator = document.getElementById('gov-indicator');
    const govModeText = document.getElementById('gov-mode-text');
    const govApprovalModal = document.getElementById('governance-approval-modal');
    const govModalTitle = document.getElementById('gov-modal-title');
    const govModalBadge = document.getElementById('gov-modal-badge');
    const govModalBody = document.getElementById('gov-modal-body');
    const btnGovApprove = document.getElementById('btn-gov-approve');
    const btnGovReject = document.getElementById('btn-gov-reject');

    let currentPendingApproval = null;

    async function refreshGovernanceStatus() {
        if (!govBadge) return;
        try {
            const res = await fetch(`/api/ide/governance/status?root=${encodeURIComponent(state.currentRoot || '.')}`);
            const data = await res.json();
            const mode = data.mode || 'normal';

            if (mode === 'normal') {
                govIndicator.style.background = '#94a3b8';
                govModeText.textContent = 'Mode 1: Normal';
                govBadge.title = 'Mode normal : tous outils ouverts';
            } else if (mode === 'architecture') {
                govIndicator.style.background = '#38bdf8';
                govModeText.textContent = 'Mode 3: Archi';
                govBadge.title = 'Mode Architecture Spec-First : Zéro code, conception invariants';
            } else if (mode === 'constrained') {
                const isVerified = data.integrity && data.integrity.status === 'verified';
                govIndicator.style.background = isVerified ? '#4ade80' : '#f87171';
                govModeText.textContent = isVerified ? 'Mode 2: Contraint 🔒' : 'Mode 2: Corrompu ⚠️';
                govBadge.title = isVerified
                    ? `Mode Contraint : ${data.contracts.count} contrat(s) scellé(s) SHA-256`
                    : 'Alerte : Sceau cryptographique non vérifié !';
            }
        } catch (e) {
            console.error('Erreur refresh gouvernance:', e);
        }
    }

    function openGovernanceApproval(approvalData) {
        currentPendingApproval = approvalData;
        govModalBody.innerHTML = '';

        if (approvalData.type === 'architecture_review') {
            govModalTitle.textContent = '🛡️ REVUE D\'ARCHITECTURE & INVARIANTS';
            govModalBadge.textContent = 'Mode 3 → Mode 2';
            govModalBadge.style.background = 'rgba(56, 189, 248, 0.2)';
            govModalBadge.style.color = '#38bdf8';
            btnGovApprove.textContent = 'Approuver & Sceller (SHA-256)';

            govModalBody.innerHTML = `
                <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 4px; border-left: 3px solid #38bdf8;">
                    <div style="color: #38bdf8; font-weight: 700; margin-bottom: 0.25rem;">Résumé exécutif proposé :</div>
                    <div class="markdown-body">${typeof marked !== 'undefined' ? marked.parse(approvalData.summary || 'Spécification complète') : escapeHtml(approvalData.summary || 'Spécification complète')}</div>
                </div>
                <div style="color: var(--text-muted); font-size: 0.7rem;">
                    Hash calculé : <code>${escapeHtml(approvalData.invariants_hash || 'SHA-256')}</code><br>
                    En approuvant, les fichiers <code>.ide/invariants.json</code> et <code>.ide/invariants.lock</code> seront scellés en lecture seule (chmod 444) et le projet basculera en <strong>Mode 2 Contraint</strong>.
                </div>
            `;
        } else if (approvalData.type === 'contract_mutation') {
            govModalTitle.textContent = '⚡ DEMANDE DE MUTATION DE CONTRAT';
            govModalBadge.textContent = 'Mutation Assistée';
            govModalBadge.style.background = 'rgba(251, 191, 36, 0.2)';
            govModalBadge.style.color = '#fbbf24';
            btnGovApprove.textContent = 'Valider Mutation & Recalculer Hash';

            govModalBody.innerHTML = `
                <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 4px; border-left: 3px solid #fbbf24;">
                    <div style="color: #fbbf24; font-weight: 700; margin-bottom: 0.25rem;">Contrat visé : ${escapeHtml(approvalData.target_contract_id)}</div>
                    <div><strong>Justification :</strong> ${escapeHtml(approvalData.reason)}</div>
                </div>
                <div>
                    <label style="color: var(--text-muted); font-size: 0.7rem; font-weight: 700;">Diff proposé sur invariants.json :</label>
                    <pre style="background: #0b0f19; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border-subtle); color: #4ade80; overflow-x: auto; max-height: 200px;">${escapeHtml(approvalData.diff || 'Diff unifié')}</pre>
                </div>
            `;
        } else if (approvalData.type === 'checkpoint_status') {
            govModalTitle.textContent = '🛑 POINT DE CONTRÔLE RÉFLEXIF (AUTOPSIE)';
            govModalBadge.textContent = '3 Échecs Consécutifs';
            govModalBadge.style.background = 'rgba(239, 68, 68, 0.2)';
            govModalBadge.style.color = '#f87171';
            btnGovApprove.textContent = 'Autoriser Essai #4';

            govModalBody.innerHTML = `
                <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 4px; border-left: 3px solid #f87171;">
                    <div style="color: #f87171; font-weight: 700; margin-bottom: 0.25rem;">Sonde bloquante : ${escapeHtml(approvalData.failed_probe_id)}</div>
                    <div style="margin-bottom: 0.4rem;"><strong>Autopsie de cause racine :</strong> ${escapeHtml(approvalData.root_cause_analysis)}</div>
                    <div><strong>Stratégie pour la reprise :</strong> ${escapeHtml(approvalData.next_attempt_strategy)}</div>
                </div>
            `;
        }

        govApprovalModal.classList.add('open');
    }

    if (btnGovReject) {
        btnGovReject.addEventListener('click', () => {
            govApprovalModal.classList.remove('open');
            currentPendingApproval = null;
        });
    }

    if (btnGovApprove) {
        btnGovApprove.addEventListener('click', async () => {
            if (!currentPendingApproval) return;
            const root = state.currentRoot || '.';

            try {
                if (currentPendingApproval.type === 'architecture_review') {
                    const res = await fetch('/api/ide/governance/review_approve', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ root })
                    });
                    const d = await res.json();
                    if (d.status === 'SEALED') {
                        alert(`Architecture validée et scellée avec succès ! (Hash : ${d.sealed_hash.substring(0, 16)}...)\nLe projet est maintenant en Mode 2 Contraint.`);
                    } else {
                        alert(`Erreur scellement : ${d.error || JSON.stringify(d)}`);
                    }
                } else if (currentPendingApproval.type === 'contract_mutation') {
                    const res = await fetch('/api/ide/governance/mutation_approve', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            root,
                            target_contract_id: currentPendingApproval.target_contract_id,
                            reason: currentPendingApproval.reason,
                            diff: currentPendingApproval.diff,
                            updated_probes: currentPendingApproval.updated_probes
                        })
                    });
                    const d = await res.json();
                    if (d.status === 'MUTATION_SEALED') {
                        alert(`Mutation scellée dans l'audit log ! Nouveau hash SHA-256 : ${d.new_hash.substring(0, 16)}...`);
                    }
                } else if (currentPendingApproval.type === 'checkpoint_status') {
                    await fetch('/api/ide/governance/retry_authorize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            failed_probe_id: currentPendingApproval.failed_probe_id
                        })
                    });
                    alert(`Tentative #4 autorisée pour la sonde ${currentPendingApproval.failed_probe_id}. L'agent peut reprendre.`);
                }
            } catch (err) {
                alert(`Erreur validation gouvernance : ${err.message}`);
            } finally {
                const hadApproval = !!currentPendingApproval;
                govApprovalModal.classList.remove('open');
                currentPendingApproval = null;
                refreshGovernanceStatus();
                if (hadApproval && agentPrompt) {
                    agentPrompt.value = "Approbation validée et scellée. Poursuis l'exécution.";
                    executeAgentPrompt();
                }
            }
        });
    }

    if (govBadge) {
        govBadge.addEventListener('click', async () => {
            const root = state.currentRoot || '.';
            try {
                const r = await fetch(`/api/ide/governance/status?root=${encodeURIComponent(root)}`);
                const d = await r.json();
                currentPendingApproval = null;
                govModalTitle.textContent = '🛡️ GOUVERNANCE EARNEST';
                govModalBadge.textContent = `Mode : ${d.mode}`;
                govModalBadge.style.background = 'rgba(56, 189, 248, 0.2)';
                govModalBadge.style.color = '#38bdf8';
                btnGovApprove.style.display = 'none';

                govModalBody.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; font-size: 0.85rem; line-height: 1.6;">
                            <div><strong>Contrats :</strong> ${d.contracts?.count ?? 0}</div>
                            <div><strong>Intégrité :</strong> ${escapeHtml(d.integrity?.status || 'unknown')} <code>${escapeHtml((d.integrity?.sha256 || 'N/A').slice(0, 16))}</code></div>
                            <div><strong>Journal d'audit :</strong> ${d.audit_entries_count ?? 0} entrée(s)</div>
                        </div>
                        <div style="font-weight:600; font-size:0.85rem;">Basculer de mode :</div>
                        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                            <button class="btn-mode-switch" data-mode="normal" style="flex:1; padding:0.5rem; border-radius:6px; border:1px solid var(--border-subtle); background:rgba(255,255,255,0.06); color:var(--text-primary); cursor:pointer;">Mode 1 : Normal</button>
                            <button class="btn-mode-switch" data-mode="constrained" style="flex:1; padding:0.5rem; border-radius:6px; border:1px solid #fbbf24; background:rgba(251,191,36,0.12); color:#fbbf24; cursor:pointer;">Mode 2 : Contraint</button>
                            <button class="btn-mode-switch" data-mode="architecture" style="flex:1; padding:0.5rem; border-radius:6px; border:1px solid #38bdf8; background:rgba(56,189,248,0.12); color:#38bdf8; cursor:pointer;">Mode 3 : Archi</button>
                        </div>
                    </div>
                `;
                govModalBody.querySelectorAll('.btn-mode-switch').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const mode = btn.getAttribute('data-mode');
                        await fetch('/api/ide/governance/set_mode', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ root, mode })
                        });
                        govApprovalModal.classList.remove('open');
                        btnGovApprove.style.display = '';
                        refreshGovernanceStatus();
                    });
                });
                govApprovalModal.classList.add('open');
            } catch (e) {
                console.error('Erreur statut gouvernance:', e);
            }
        });
    }


    // ====================================================
    // 13. FILE WATCHER CLIENT-SIDE (DÉTECTION MODIFICATIONS EXTERNES)
    // ====================================================
    let isCheckingExternalModifs = false;
    async function checkExternalModifications() {
        if (isCheckingExternalModifs || state.openTabs.length === 0) return;
        isCheckingExternalModifs = true;

        try {
            for (const tab of state.openTabs) {
                if (!tab.path || tab.isModified) continue; // Si l'utilisateur est en train d'écrire localement, ne pas écraser
                const res = await fetch(`/api/ide/file/status?path=${encodeURIComponent(tab.path)}`);
                const data = await res.json();
                if (data.exists && data.mtime && tab.lastMtime && data.mtime > tab.lastMtime) {
                    // Le fichier a été modifié de l'extérieur par Git ou un outil tiers
                    const fileRes = await fetch(`/api/ide/file?path=${encodeURIComponent(tab.path)}`);
                    const fileData = await fileRes.json();
                    if (fileData.content !== undefined && fileData.content !== tab.content) {
                        tab.content = fileData.content;
                        tab.originalContent = fileData.content;
                        tab.lastMtime = data.mtime;
                        tab.isModified = false;
                        if (tab.monacoModel) {
                            tab._suppressEvents = true;
                            tab.monacoModel.setValue(fileData.content);
                            tab._suppressEvents = false;
                        }
                        if (state.isDiffMode) updateDiffModels();
                    }
                }
            }
        } catch (e) { } finally {
            isCheckingExternalModifs = false;
        }
    }

    // Intervalle de vérification de modifications externes (toutes les 4 secondes)
    setInterval(checkExternalModifications, 4000);

    // Démarrage initial
    initMonaco(async () => {
        loadAllProjectFiles();
        refreshGitStatus();
        refreshDiagnostics();
        refreshGovernanceStatus();
        const restored = await restoreSessionState();
        await loadTree();
        if (!restored) {
            openFile('earnest-ide/README.md');
        }
    });
});
