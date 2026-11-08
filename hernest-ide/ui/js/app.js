document.addEventListener('DOMContentLoaded', () => {
    // État global de Hernest IDE
    const state = {
        currentRoot: '.',
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
    const actBtnSettings = document.getElementById('act-btn-settings');
    const btnOpenSettings = document.getElementById('btn-open-settings');

    const viewExplorer = document.getElementById('view-explorer');
    const viewSearch = document.getElementById('view-search');
    const viewGit = document.getElementById('view-git');
    const viewDiagnostics = document.getElementById('view-diagnostics');
    const viewSettings = document.getElementById('view-settings');

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
            getWorkerUrl: function(moduleId, label) {
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
        require(['vs/editor/editor.main'], function() {
            // S'assurer que le container a une géométrie calculée avant l'instanciation de Monaco
            requestAnimationFrame(() => {
                editorInstance = monaco.editor.create(monacoEditorContainer, {
                    value: '// Hernest IDE Pro • Monaco Editor Active\n',
                    language: 'rust',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                    minimap: { enabled: true },
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    tabSize: 4
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
                // Remplacement chirurgical dans Monaco
                editorInstance.executeEdits('inline-ai', [{
                    range: selection,
                    text: data.replacement,
                    forceMoveMarkers: true
                }]);
                inlineAiWidget.classList.remove('visible');
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
        let existing = state.openTabs.find(t => t.path === filePath);
        if (!existing) {
            try {
                const res = await fetch(`/api/ide/file?path=${encodeURIComponent(filePath)}`);
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                const fileName = filePath.split('\\').pop().split('/').pop();
                const lang = getMonacoLanguage(filePath);
                
                let monacoModel = null;
                if (window.monaco) {
                    monacoModel = monaco.editor.createModel(data.content || '', lang);
                }

                existing = {
                    path: filePath,
                    name: fileName,
                    content: data.content || '',
                    originalContent: data.content || '',
                    isModified: false,
                    monacoModel
                };
                state.openTabs.push(existing);
            } catch (err) {
                alert(`Erreur lecture: ${err.message}`);
                return;
            }
        }
        switchTab(filePath);
        saveSessionState();
    }

    function switchTab(filePath) {
        state.activeTabPath = filePath;
        const tab = getActiveTab();
        if (tab && editorInstance && window.monaco) {
            if (!tab.monacoModel) {
                const lang = getMonacoLanguage(tab.path);
                tab.monacoModel = monaco.editor.createModel(tab.content, lang);
            }
            editorInstance.setModel(tab.monacoModel);
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
                renderTabs();
                if (state.isDiffMode) updateDiffModels();
                refreshGitStatus();
                refreshDiagnostics();

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
        [actBtnExplorer, actBtnSearch, actBtnGit, actBtnDiagnostics, actBtnSettings].forEach(btn => btn && btn.classList.remove('active'));
        [viewExplorer, viewSearch, viewGit, viewDiagnostics, viewSettings].forEach(v => v && v.classList.remove('active'));

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
        } catch (e) {}
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
        } catch (e) {}
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
                monaco.editor.setModelMarkers(model, 'hernest-linter', fileMarkers);
            }
        } catch (e) {}
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
                    <div style="color:${color}; font-weight:700;">[${diag.severity.toUpperCase()}] ${diag.file}:${diag.line}</div>
                    <div style="font-size:0.72rem; color:var(--text-secondary);">${escapeHtml(diag.message)}</div>
                `;
                item.addEventListener('click', async () => {
                    await openFile(diag.file);
                    if (editorInstance) {
                        editorInstance.revealLineInCenter(diag.line);
                        editorInstance.setPosition({ lineNumber: diag.line, column: diag.column });
                    }
                });
                diagnosticsListEl.appendChild(item.cloneNode(true));
                bottomProblemsContent.appendChild(item);
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
                monaco.editor.setModelMarkers(model, 'hernest-linter', fileMarkers);
            }
        } catch (e) {}
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
            if (e.key === 'Enter') {
                const cmd = inputEl.value.trim();
                if (!cmd) return;
                inputEl.value = '';
                const line = document.createElement('div');
                line.textContent = `> ${cmd}`;
                outputEl.appendChild(line);

                try {
                    const res = await fetch('/api/ide/terminal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ command: cmd, timeout_secs: 45 })
                    });
                    const data = await res.json();
                    if (data.stdout) {
                        const outDiv = document.createElement('div');
                        outDiv.textContent = data.stdout.trimEnd();
                        outputEl.appendChild(outDiv);
                    }
                    if (data.stderr) {
                        const errDiv = document.createElement('div');
                        errDiv.style.color = 'var(--accent-rose)';
                        errDiv.textContent = data.stderr.trimEnd();
                        outputEl.appendChild(errDiv);
                    }
                    outputEl.scrollTop = outputEl.scrollHeight;
                } catch (err) {}
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
    // 10. RACCOURCIS CLAVIER GLOBAUX
    // ====================================================
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            openQuickOpenPalette();
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
            e.preventDefault();
            switchSidebarView('search');
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
        try { localStorage.setItem('hernest_ide_session', JSON.stringify(sessionData)); } catch (e) {}
    }

    async function restoreSessionState() {
        try {
            const raw = localStorage.getItem('hernest_ide_session');
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (data.currentRoot) state.currentRoot = data.currentRoot;
            if (Array.isArray(data.openTabsPaths) && data.openTabsPaths.length > 0) {
                for (const p of data.openTabsPaths) await openFile(p);
                if (data.activeTabPath) switchTab(data.activeTabPath);
                return true;
            }
        } catch (e) {}
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
        assistantBubble.innerHTML = `<div style="color:var(--accent-cyan); font-weight:600;">⚡ Hernest Copilote réfléchit...</div>`;
        chatStream.appendChild(assistantBubble);
        chatStream.scrollTop = chatStream.scrollHeight;

        try {
            const res = await fetch('/api/ide/run/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: text, project: 'hernest_ide_workspace' })
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

                        // Événement d'exécution d'outil ou étape de pensée
                        if (payload.step_type === 'thought') {
                            const thoughtDiv = document.createElement('div');
                            thoughtDiv.style.color = 'var(--text-muted)';
                            thoughtDiv.style.fontStyle = 'italic';
                            thoughtDiv.textContent = `💭 ${payload.payload}`;
                            assistantBubble.appendChild(thoughtDiv);
                        } else if (payload.step_type === 'action') {
                            const actionDiv = document.createElement('div');
                            actionDiv.style.cssText = 'color:var(--accent-amber); font-weight:600; padding:2px 6px; background:rgba(245,158,11,0.1); border-radius:3px;';
                            actionDiv.textContent = `⚙️ Outil : ${payload.tool_name} (${JSON.stringify(payload.payload)})`;
                            assistantBubble.appendChild(actionDiv);
                        } else if (payload.status === 'completed') {
                            // Réponse finale terminée
                            const finalAnswer = document.createElement('div');
                            finalAnswer.style.color = 'var(--text-primary)';
                            finalAnswer.style.whiteSpace = 'pre-wrap';
                            finalAnswer.textContent = payload.answer || 'Tâche terminée avec succès.';
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
                    } catch (e) {}
                    chatStream.scrollTop = chatStream.scrollHeight;
                }
            }
        } catch (err) {
            assistantBubble.innerHTML = `<div style="color:var(--accent-rose);">❌ Erreur d'exécution Copilote: ${escapeHtml(err.message)}</div>`;
        } finally {
            btnAgentSend.disabled = false;
        }
    }

    if (btnAgentSend) {
        btnAgentSend.addEventListener('click', executeAgentPrompt);
    }
    if (agentPrompt) {
        agentPrompt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeAgentPrompt();
            }
        });
    }
    if (btnClearAgent) {
        btnClearAgent.addEventListener('click', () => {
            chatStream.innerHTML = `
                <div class="chat-bubble assistant" style="background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-subtle); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.8rem; line-height: 1.45;">
                    👋 Historique effacé. Prêt pour une nouvelle consigne.
                </div>
            `;
        });
    }

    // Démarrage initial
    initMonaco(async () => {
        loadAllProjectFiles();
        refreshGitStatus();
        refreshDiagnostics();
        const restored = await restoreSessionState();
        await loadTree();
        if (!restored) {
            openFile('hernest-ide/README.md');
        }
    });
});
