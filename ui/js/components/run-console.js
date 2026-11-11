import { store } from '../store.js';
import { renderMarkdown } from '../markdown.js';
import './pixel-agent-stage.js';

export class RunConsole extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <!-- Widget Cyber-Atelier 16-Bit -->
                <pixel-agent-stage id="pixel-stage"></pixel-agent-stage>

                <div class="card" style="margin-bottom: 0;">
                    <h2>
                        <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: rgba(255,255,255,0.08); border-radius: 4px; color: #ffffff;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                        </span>
                        Console Opérationnelle & Streaming ReAct
                    </h2>
                    <p class="card-desc">Exécution d'instructions agentiques avec traçabilité complète et monitoring des modèles en direct.</p>
                    
                    <!-- Ligne 1 : Zone de saisie large et confortable -->
                    <div style="margin-bottom: 0.85rem; position: relative;">
                        <textarea id="prompt-input" rows="3" placeholder="Saisissez une instruction ou collez votre consigne ici (ex: Analyse ce rapport de synthèse, identifie les points clés et génère un livrable)..." style="width: 100%; min-height: 80px; padding: 0.85rem 1rem; background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-accent); border-radius: var(--radius-sm); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.92rem; line-height: 1.5; outline: none; resize: vertical; box-sizing: border-box; transition: border-color var(--transition-fast);"></textarea>
                    </div>

                    <!-- Ligne 2 : Barre d'actions & Contrôle de Routage -->
                    <div style="display: flex; gap: 0.75rem; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 1rem; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-subtle); padding: 0.6rem 0.85rem; border-radius: var(--radius-sm);">
                        
                        <!-- Groupe Gauche : Choix du Mode & Moteur -->
                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                            <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Routage :</span>
                            <select id="backend-selector" style="background: rgba(15, 23, 42, 0.9); border: 1px solid var(--border-subtle); color: var(--accent-cyan); border-radius: var(--radius-sm); height: 36px; padding: 0 0.85rem; font-family: var(--font-mono); font-size: 0.82rem; cursor: pointer; outline: none;">
                                <option value="auto">Routage Auto (Intelligent)</option>
                                <option value="multiagent">Mode Multi-Agents (Architecte + Worker + Critique)</option>
                                <option value="ollama_forced">Moteur Local Principal (Ollama)</option>
                                <option value="lmstudio">Moteur Local Secondaire (LM Studio)</option>
                                <option value="cloud">API Cloud (Haute Capacité)</option>
                            </select>
                        </div>

                        <!-- Groupe Droit : Pièce jointe, Micro et Boutons d'Exécution -->
                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                            <label class="btn-attach" title="Joindre un fichier (Image, PDF, Word, Code)" style="height: 36px; display: inline-flex; align-items: center; justify-content: center; padding: 0 0.85rem; color: #ffffff;">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                                <input type="file" id="file-input" style="display: none;" />
                            </label>
                            
                            <button id="btn-run-mic" class="btn-attach" style="cursor: pointer; height: 36px; display: inline-flex; align-items: center; justify-content: center; padding: 0 0.85rem; color: #ffffff;" title="Dictée Vocale du Prompt">
                                <span id="run-mic-icon" style="display: inline-flex; align-items: center;">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                                </span>
                            </button>

                            <button class="btn-secondary" id="btn-cancel" style="display: none; height: 36px; padding: 0 1rem; background: rgba(244, 63, 94, 0.15); border-color: var(--accent-rose); color: var(--accent-rose); cursor: pointer;" title="Interrompre le run en cours">
                                <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                                    Arrêter
                                </span>
                            </button>

                            <button class="btn-primary" id="btn-run" style="height: 36px; padding: 0 1.25rem;">
                                <span style="display: inline-flex; align-items: center; gap: 0.4rem;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                    Exécuter
                                </span>
                            </button>
                        </div>
                    </div>

                    <div id="attachment-preview" style="display: none; align-items: center; gap: 0.5rem; background: rgba(99, 102, 241, 0.1); border: 1px dashed var(--primary); padding: 0.4rem 0.85rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.82rem;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        <span>Fichier joint :</span>
                        <strong id="attachment-name" style="color: var(--accent-cyan);"></strong>
                        <button id="btn-remove-att" style="background: none; border: none; color: var(--accent-rose); cursor: pointer; margin-left: auto; display: flex; align-items: center; gap: 0.25rem;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            Retirer
                        </button>
                    </div>

                    <!-- Bannière d'approbation Human-In-The-Loop (HITL) -->
                    <div id="approval-banner" class="hitl-banner" style="display: none;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--error); font-weight: 700; margin-bottom: 0.4rem; font-family: var(--font-mono); font-size: 0.85rem;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            VALIDATION REQUISE (HUMAN-IN-THE-LOOP)
                        </div>
                        <div style="color: var(--text-primary); margin-bottom: 0.5rem;">
                            L'agent souhaite exécuter une commande sensible ayant un impact potentiel :
                        </div>
                        <pre id="approval-command-text" style="background: rgba(0,0,0,0.5); padding: 0.5rem; border-radius: 4px; color: #fde68a; overflow-x: auto; font-size: 0.78rem; margin-bottom: 0.65rem; white-space: pre-wrap;"></pre>
                        <div style="display: flex; gap: 0.65rem;">
                            <button id="btn-approve" class="btn-primary" style="background: var(--accent-emerald); border-color: var(--accent-emerald); font-size: 0.78rem; padding: 0.35rem 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                Autoriser l'action
                            </button>
                            <button id="btn-reject" class="btn-secondary" style="background: rgba(244, 63, 94, 0.2); border-color: var(--accent-rose); color: var(--accent-rose); font-size: 0.78rem; padding: 0.35rem 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                Refuser
                            </button>
                        </div>
                    </div>

                    <div class="terminal-box" id="terminal">
                        <div style="color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            En attente d'une tâche. Saisissez une instruction ci-dessus.
                        </div>
                    </div>
                </div>
            </div>
        `;

        const terminal = this.querySelector('#terminal');
        if (window.__earnest_terminal_html) {
            terminal.innerHTML = window.__earnest_terminal_html;
        } else {
            this.renderStartupHealthCheck();
        }

        const btn = this.querySelector('#btn-run');
        const btnCancel = this.querySelector('#btn-cancel');
        const input = this.querySelector('#prompt-input');
        const fileInput = this.querySelector('#file-input');
        const removeAttBtn = this.querySelector('#btn-remove-att');
        const approvalBanner = this.querySelector('#approval-banner');
        const btnApprove = this.querySelector('#btn-approve');
        const btnReject = this.querySelector('#btn-reject');

        this.currentAttachment = null;
        this.currentRunId = null;

        if (btnApprove) {
            btnApprove.addEventListener('click', async () => {
                if (this.currentRunId) {
                    approvalBanner.style.display = 'none';
                    await fetch('/api/run/approve', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ run_id: this.currentRunId, approved: true })
                    });
                }
            });
        }

        if (btnReject) {
            btnReject.addEventListener('click', async () => {
                if (this.currentRunId) {
                    approvalBanner.style.display = 'none';
                    await fetch('/api/run/approve', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ run_id: this.currentRunId, approved: false })
                    });
                }
            });
        }

        if (btnCancel) {
            btnCancel.addEventListener('click', async () => {
                if (this.currentRunId) {
                    btnCancel.disabled = true;
                    btnCancel.textContent = 'Arrêt...';
                    try {
                        await fetch('/api/run/abort', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ run_id: this.currentRunId })
                        });
                    } catch (e) {
                        console.error('Abort error', e);
                    }
                }
            });
        }

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                this.currentAttachment = {
                    name: file.name,
                    data: reader.result
                };
                this.querySelector('#attachment-name').textContent = `${file.name} (${Math.round(file.size/1024)} KB)`;
                this.querySelector('#attachment-preview').style.display = 'flex';
            };
            reader.readAsDataURL(file);
        });

        removeAttBtn.addEventListener('click', () => {
            this.currentAttachment = null;
            fileInput.value = '';
            this.querySelector('#attachment-preview').style.display = 'none';
        });

        btn.addEventListener('click', () => this.startRun());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) {
                e.preventDefault();
                this.startRun();
            }
        });

        // Dictée vocale universelle (MediaRecorder + Whisper local, compatible Firefox, Chrome, Edge)
        const micBtn = this.querySelector('#btn-run-mic');
        const micIcon = this.querySelector('#run-mic-icon');
        let mediaRecorder = null;
        let audioChunks = [];
        let isRecording = false;

        if (micBtn) {
            micBtn.addEventListener('click', async () => {
                if (!isRecording) {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        audioChunks = [];
                        mediaRecorder = new MediaRecorder(stream);
                        mediaRecorder.ondataavailable = (e) => {
                            if (e.data.size > 0) audioChunks.push(e.data);
                        };
                        mediaRecorder.onstop = async () => {
                            stream.getTracks().forEach(t => t.stop());
                            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            micIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;
                            micBtn.style.borderColor = 'var(--accent-amber)';

                            // Conversion en base64 pour envoi à /api/transcribe
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                                try {
                                    const base64Audio = reader.result;
                                    const res = await fetch('/api/transcribe', {
                                        method: 'POST',
                                        headers: {'Content-Type': 'application/json'},
                                        body: JSON.stringify({ audio_base64: base64Audio })
                                    });
                                    const data = await res.json();
                                    if (data.status === 'ok' && data.text) {
                                        input.value = (input.value ? input.value + ' ' : '') + data.text;
                                    } else if (data.error) {
                                        alert(`Erreur Whisper: ${data.error}`);
                                    }
                                } catch (err) {
                                    alert(`Erreur transcription réseau: ${err.message}`);
                                } finally {
                                    micIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
                                    micBtn.style.borderColor = 'var(--border-subtle)';
                                }
                            };
                            reader.readAsDataURL(audioBlob);
                        };

                        mediaRecorder.start();
                        isRecording = true;
                        micBtn.style.borderColor = 'var(--accent-rose)';
                        micIcon.innerHTML = `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:var(--accent-rose); animation: pulse 1s infinite;"></span>`;
                    } catch (err) {
                        alert(`Accès microphone impossible : ${err.name} - ${err.message}`);
                        micIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
                        micBtn.style.borderColor = 'var(--border-subtle)';
                    }
                } else {
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                        mediaRecorder.stop();
                    }
                    isRecording = false;
                }
            });
        }
    }

    async startRun() {
        const promptInput = this.querySelector('#prompt-input');
        const terminal = this.querySelector('#terminal');
        const btn = this.querySelector('#btn-run');
        const btnCancel = this.querySelector('#btn-cancel');
        const pixelStage = this.querySelector('#pixel-stage');
        const selector = this.querySelector('#backend-selector');
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        btn.disabled = true;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Inférence...`;
        if (btnCancel) {
            btnCancel.style.display = 'inline-flex';
            btnCancel.disabled = false;
            btnCancel.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg> Stop`;
        }
        terminal.innerHTML = '';
        this.appendTrace('thought', `Démarrage de la tâche : "${prompt}"`);
        if (pixelStage) pixelStage.setAgentState('thought');

        try {
            const payload = {
                prompt,
                project_id: 'default_workspace',
                backend: selector ? selector.value : 'auto',
                attachment: this.currentAttachment
            };

            const response = await fetch('/api/run/stream', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                this.appendTrace('error', `Erreur: ${err.detail || err.error}`);
                if (pixelStage) pixelStage.setAgentState('error');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop(); // Conserver le fragment incomplet

                for (const part of parts) {
                    if (!part.trim()) continue;
                    const lines = part.split('\n');
                    let eventType = 'message';
                    let dataText = '';

                    for (const line of lines) {
                        if (line.startsWith('event: ')) eventType = line.substring(7).trim();
                        else if (line.startsWith('data: ')) dataText = line.substring(6).trim();
                    }

                    if (!dataText) continue;
                    const data = JSON.parse(dataText);

                    if (eventType === 'init') {
                        this.currentRunId = data.run_id;
                    } else if (eventType === 'approval_request') {
                        // Afficher la bannière Human-In-The-Loop
                        const banner = this.querySelector('#approval-banner');
                        const cmdText = this.querySelector('#approval-command-text');
                        if (banner && cmdText) {
                            cmdText.textContent = data.command;
                            banner.style.display = 'block';
                        }
                        this.appendTrace('thought', `En attente d'approbation humaine pour la commande : \`${data.command}\``);
                    } else if (eventType === 'trace') {
                        const t = data;
                        const prefix = t.tool_name ? `[${t.tool_name}]` : `[${t.step_type.toUpperCase()}]`;
                        this.appendTrace(t.step_type, `${prefix} ${t.payload}`, t.timestamp);
                        if (pixelStage) pixelStage.setAgentState(t.step_type, t.tool_name || '', t.active_backend || 'ollama');
                    } else if (eventType === 'completed') {
                        if (pixelStage) pixelStage.setAgentState('answer', '', data.backend || 'ollama');
                        if (data.usage) {
                            this.appendUsageBanner(data.usage, data.backend);
                        }
                    } else if (eventType === 'error') {
                        this.appendTrace('error', `Erreur: ${data.error}`);
                        if (pixelStage) pixelStage.setAgentState('error');
                    }
                }
            }

            // Notifier le rafraîchissement des télémétries et des runs
            window.dispatchEvent(new CustomEvent('earnest:run_completed'));
        } catch (e) {
            this.appendTrace('error', `Erreur de communication : ${e.message}`);
            if (pixelStage) pixelStage.setAgentState('error');
        } finally {
            this.currentRunId = null;
            btn.disabled = false;
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Exécuter`;
            if (btnCancel) btnCancel.style.display = 'none';
            const banner = this.querySelector('#approval-banner');
            if (banner) banner.style.display = 'none';
            // Conserver le contenu terminal en mémoire session
            window.__earnest_terminal_html = terminal.innerHTML;
        }
    }

    appendUsageBanner(usage, backend) {
        const terminal = this.querySelector('#terminal');
        const banner = document.createElement('div');
        banner.style.marginTop = '0.75rem';
        banner.style.padding = '0.5rem 0.85rem';
        banner.style.background = 'rgba(15, 23, 42, 0.7)';
        banner.style.border = '1px solid rgba(99, 102, 241, 0.3)';
        banner.style.borderRadius = 'var(--radius-sm)';
        banner.style.display = 'flex';
        banner.style.gap = '1.25rem';
        banner.style.fontSize = '0.78rem';
        banner.style.fontFamily = 'var(--font-mono)';
        banner.style.color = 'var(--text-secondary)';

        banner.innerHTML = `
            <span>Ouvrier: <strong style="color: var(--accent-cyan);">${(backend || 'ollama').toUpperCase()}</strong></span>
            <span>Durée: <strong style="color: var(--accent-emerald);">${usage.duration_ms || 0} ms</strong></span>
            <span>Tokens Prompt: <strong style="color: var(--text-primary);">${usage.prompt_tokens || 0}</strong></span>
            <span>Tokens Réponse: <strong style="color: var(--text-primary);">${usage.completion_tokens || 0}</strong></span>
            <span>Total Tokens: <strong style="color: var(--accent-amber);">${usage.total_tokens || 0}</strong></span>
        `;
        terminal.appendChild(banner);
        terminal.scrollTop = terminal.scrollHeight;
    }

    async renderStartupHealthCheck() {
        const terminal = this.querySelector('#terminal');
        try {
            const telemetry = await store.getTelemetry();
            const backends = telemetry.backends || [];

            const card = document.createElement('div');
            card.style.cssText = `
                margin-top: 0.75rem;
                padding: 0.85rem 1rem;
                background: rgba(15, 23, 42, 0.65);
                border: 1px solid rgba(99, 102, 241, 0.3);
                border-radius: var(--radius-sm);
                font-family: var(--font-mono);
                font-size: 0.78rem;
                line-height: 1.45;
                box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            `;

            let bRows = '';
            for (const b of backends) {
                const isOk = b.is_online;
                const statusBadge = isOk 
                    ? `<span style="color: var(--accent-emerald); font-weight: bold;">EN LIGNE (${b.latency_ms} ms)</span>`
                    : `<span style="color: var(--accent-rose); font-weight: bold;">HORS-LIGNE</span>`;
                
                let modelsList = '';
                if (isOk && b.available_models && b.available_models.length > 0) {
                    const topModels = b.available_models.slice(0, 4).join(', ');
                    const extra = b.available_models.length > 4 ? ` <em style="color: var(--text-muted);">(+${b.available_models.length - 4} autres)</em>` : '';
                    modelsList = `<div style="padding-left: 1.2rem; color: #94a3b8; font-size: 0.72rem;">└─ Modèles : <span style="color: var(--accent-cyan);">${topModels}</span>${extra}</div>`;
                }

                bRows += `
                    <div style="margin-top: 0.35rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span><strong>${b.name}</strong></span>
                            ${statusBadge}
                        </div>
                        ${modelsList}
                    </div>
                `;
            }

            card.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.4rem; margin-bottom: 0.4rem;">
                    <div style="font-weight: 700; color: var(--accent-cyan); display: flex; align-items: center; gap: 0.4rem;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>
                        BILAN SYSTÈME & MODÈLES EN LIGNE
                    </div>
                    </div>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${new Date().toLocaleTimeString('fr-FR')}</span>
                </div>
                <div style="margin-bottom: 0.35rem; color: var(--text-muted); font-size: 0.72rem;">
                    Hôte GPU : <span style="color: #cbd5e1;">${telemetry.gpu_target || 'Local'}</span> | Modèle actif par défaut : <span style="color: var(--primary); font-weight: 600;">${telemetry.current_model}</span>
                </div>
                ${bRows}
            `;

            terminal.appendChild(card);
            terminal.scrollTop = terminal.scrollHeight;
        } catch (e) {
            console.error('Erreur lors du bilan de démarrage', e);
        }
    }

    appendTrace(type, text, timestamp = null) {
        const terminal = this.querySelector('#terminal');
        const item = document.createElement('div');

        const now = timestamp || new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const timeBadge = `<span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--outline); margin-left: auto;">[${now}]</span>`;

        if (type === 'answer') {
            item.className = 'react-step-node react-node-answer';
            const cleanText = text.replace(/^\[ANSWER\]\s*/, '').replace(/^🏁 Réponse finale : \n?/, '');
            item.innerHTML = `
                <div class="react-node-header">
                    <div class="react-node-title">
                        <span class="react-node-pip"></span>
                        <span>RÉPONSE FINALE</span>
                    </div>
                    ${timeBadge}
                </div>
                <div class="react-node-body">${renderMarkdown(cleanText)}</div>
            `;
        } else if (type === 'thought') {
            item.className = 'react-step-node react-node-thought';
            const cleanText = text.replace(/^\[THOUGHT\]\s*/, '');
            item.innerHTML = `
                <div class="react-node-header">
                    <div class="react-node-title">
                        <span class="react-node-pip"></span>
                        <span>CHAIN OF THOUGHT • PENSÉE</span>
                    </div>
                    ${timeBadge}
                </div>
                <div class="react-node-body">${renderMarkdown(cleanText)}</div>
            `;
        } else if (type === 'tool_call') {
            item.className = 'react-step-node react-node-tool-call';
            const toolName = text.split(']')[0].replace('[', '') || 'ACTION';
            const rawPayload = text.split(']').slice(1).join(']').trim();
            item.innerHTML = `
                <div class="react-node-header">
                    <div class="react-node-title">
                        <span class="react-node-pip"></span>
                        <span>TOOL CALL • ${toolName}</span>
                    </div>
                    ${timeBadge}
                </div>
                <div class="react-code-snippet">${rawPayload}</div>
            `;
        } else if (type === 'tool_output') {
            item.className = 'react-step-node react-node-tool-output';
            const toolName = text.split(']')[0].replace('[', '') || 'OUTPUT';
            const rawPayload = text.split(']').slice(1).join(']').trim();
            item.innerHTML = `
                <details style="cursor: pointer;" open>
                    <summary class="react-node-header" style="outline: none;">
                        <div class="react-node-title">
                            <span class="react-node-pip"></span>
                            <span>TOOL OUTPUT • ${toolName} (${rawPayload.length} octets)</span>
                        </div>
                        ${timeBadge}
                    </summary>
                    <div class="react-code-snippet" style="margin-top: 0.5rem; max-height: 250px; overflow-y: auto; white-space: pre-wrap; font-size: 0.78rem;">${rawPayload}</div>
                </details>
            `;
        } else if (type === 'error') {
            item.className = 'react-step-node react-node-error';
            item.innerHTML = `
                <div class="react-node-header">
                    <div class="react-node-title">
                        <span class="react-node-pip"></span>
                        <span>ERREUR D'EXÉCUTION</span>
                    </div>
                    ${timeBadge}
                </div>
                <div class="react-node-body" style="color: var(--error);">${text}</div>
            `;
        } else {
            item.className = 'react-step-node';
            item.textContent = text;
        }

        terminal.appendChild(item);
        terminal.scrollTop = terminal.scrollHeight;
        window.__earnest_terminal_html = terminal.innerHTML;
    }
}
customElements.define('run-console', RunConsole);
