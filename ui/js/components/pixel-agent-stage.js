/**
 * Cyber-Atelier 16-Bit Multi-Robots Modulaire pour Earnest
 * Génère dynamiquement une mini-fenêtre / vignette animée par modèle enregistré.
 * Chaque tuile de modèle dispose de :
 * - Son avatar robot pixel-art personnalisé et animé
 * - Ses indicateurs d'état en direct (En veille / En réflexion / Outil / Succès / Erreur)
 * - Ses particules énergétiques indépendantes
 * - Ses métadonnées en temps réel (nom, URL, modèle, latence)
 */

export class PixelAgentStage extends HTMLElement {
    constructor() {
        super();
        this.frame = 0;
        this.providers = [];
        this.cards = new Map(); // id -> { canvas, ctx, state, toolName, particles, robot, statusEl }
        this.activeBackend = 'ollama';
        this.globalState = 'idle';
        this.soundEnabled = true;
    }

    connectedCallback() {
        this.innerHTML = `
            <div class="pixel-stage-wrapper" style="position: relative; margin-bottom: 0.25rem;">
                <div class="pixel-stage-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;">
                    <div class="pixel-title" style="display: flex; align-items: center; gap: 0.6rem;">
                        <span class="pixel-badge" style="background: rgba(99, 102, 241, 0.2); border: 1px solid var(--primary); color: var(--accent-cyan); font-family: var(--font-mono); font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 700;">16-BIT AGENT MONITOR</span>
                        <span id="pixel-global-status" style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted);">MONITEUR D'UNITÉS EN TEMPS RÉEL</span>
                    </div>
                    <button id="btn-toggle-sound" style="background: none; border: 1px solid var(--border-subtle); color: var(--text-muted); border-radius: 4px; padding: 0.2rem 0.5rem; cursor: pointer; font-size: 0.72rem; font-family: var(--font-mono);">
                        Audio: ON
                    </button>
                </div>

                <!-- Grille dynamique des postes de surveillance des modèles -->
                <div id="robots-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.85rem;">
                    <div style="color: var(--text-muted); font-size: 0.8rem; font-family: var(--font-mono); padding: 1rem;">Initialisation des postes de travail...</div>
                </div>
            </div>
        `;

        this.querySelector('#btn-toggle-sound').addEventListener('click', () => {
            this.soundEnabled = !this.soundEnabled;
            this.querySelector('#btn-toggle-sound').textContent = this.soundEnabled ? 'Audio: ON' : 'Audio: OFF';
        });

        this.loadProviders();
        this.startAnimationLoop();

        // Rafraîchir les tuiles quand les paramètres changent
        window.addEventListener('earnest:run_completed', () => this.loadProviders());
    }

    async loadProviders() {
        try {
            const res = await fetch('/api/model_providers');
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.providers || []);

            if (list.length > 0) {
                this.providers = list;
            } else {
                // Fallback sur les 3 moteurs standard
                this.providers = [
                    { id: 'ollama', name: 'Moteur Local (Ollama)', provider_type: 'ollama', model: 'local-model', is_enabled: 1 },
                    { id: 'lmstudio', name: 'Serveur Local (LM Studio)', provider_type: 'openai', model: 'local-model', is_enabled: 1 },
                    { id: 'cloud', name: 'Fournisseur Cloud', provider_type: 'openai', model: 'cloud-model', is_enabled: 1 }
                ];
            }
            this.renderRobotWindows();
        } catch (e) {
            console.error('Erreur chargement providers pixel-stage', e);
        }
    }

    renderRobotWindows() {
        const grid = this.querySelector('#robots-grid');
        if (!grid) return;
        grid.innerHTML = '';
        this.cards.clear();

        const colorPalettes = [
            { main: '#6366f1', dark: '#4338ca', light: '#a5b4fc', eye: '#22d3ee', antenna: 'single' },
            { main: '#f59e0b', dark: '#d97706', light: '#fde68a', eye: '#fbbf24', antenna: 'dual' },
            { main: '#10b981', dark: '#047857', light: '#a7f3d0', eye: '#34d399', antenna: 'dish' },
            { main: '#ec4899', dark: '#be185d', light: '#fbcfe8', eye: '#f472b6', antenna: 'single' },
            { main: '#06b6d4', dark: '#0e7490', light: '#cffafe', eye: '#67e8f9', antenna: 'dual' }
        ];

        this.providers.forEach((p, idx) => {
            const palette = colorPalettes[idx % colorPalettes.length];
            const isEnabled = p.is_enabled !== 0;

            const win = document.createElement('div');
            win.id = `robot-card-${p.id}`;
            win.style.cssText = `
                background: rgba(15, 23, 42, 0.7);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-sm);
                padding: 0.65rem 0.85rem;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                position: relative;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: border-color var(--transition-fast), transform var(--transition-fast);
            `;

            win.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.4rem;">
                    <div style="display: flex; align-items: center; gap: 0.4rem; overflow: hidden;">
                        <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${isEnabled ? palette.main : 'var(--text-muted)'};"></span>
                        <strong style="font-size: 0.78rem; color: var(--text-primary); font-family: var(--font-mono); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${p.name}</strong>
                    </div>
                    <span class="bot-badge" style="font-size: 0.65rem; font-family: var(--font-mono); padding: 0.1rem 0.35rem; border-radius: 3px; background: rgba(255,255,255,0.06); color: ${palette.light}; text-transform: uppercase;">${p.provider_type || 'LLM'}</span>
                </div>

                <div style="display: flex; align-items: center; gap: 0.85rem;">
                    <!-- Mini Canvas 16-Bit pour ce robot -->
                    <canvas class="bot-canvas" width="90" height="70" style="background: #030712; border: 1px solid var(--border-subtle); border-radius: 4px; image-rendering: pixelated; flex-shrink: 0;"></canvas>
                    
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 0.25rem; font-family: var(--font-mono); font-size: 0.72rem;">
                        <div style="color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            <span>Modèle : </span><code style="color: ${palette.light};">${p.model}</code>
                        </div>
                        <div class="bot-state-text" style="color: var(--text-muted); font-size: 0.7rem; font-weight: 600;">
                            ${isEnabled ? 'DOCK : EN VEILLE' : 'DÉCONNECTÉ'}
                        </div>
                        <div class="bot-activity-bar" style="height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; margin-top: 0.15rem;">
                            <div class="bot-activity-fill" style="height: 100%; width: 0%; background: ${palette.main}; transition: width 0.3s;"></div>
                        </div>
                    </div>
                </div>
            `;

            const canvas = win.querySelector('.bot-canvas');
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            this.cards.set(p.id, {
                cardEl: win,
                canvas: canvas,
                ctx: ctx,
                provider: p,
                palette: palette,
                state: 'idle',
                toolName: '',
                particles: [],
                statusTextEl: win.querySelector('.bot-state-text'),
                activityFillEl: win.querySelector('.bot-activity-fill')
            });

            grid.appendChild(win);
        });
    }

    startAnimationLoop() {
        const loop = () => {
            this.frame++;
            this.updateAndDrawAll();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    updateAndDrawAll() {
        this.cards.forEach((botData, id) => {
            const ctx = botData.ctx;
            const w = botData.canvas.width;
            const h = botData.canvas.height;
            const isActive = (id === this.activeBackend || this.isMatchingBackend(id, this.activeBackend)) && this.globalState !== 'idle';

            // Arrière-plan de la mini-fenêtre
            ctx.fillStyle = '#050814';
            ctx.fillRect(0, 0, w, h);

            // Grille cyber
            ctx.strokeStyle = '#0e1726';
            ctx.lineWidth = 1;
            for (let x = 0; x < w; x += 15) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, 55);
                ctx.stroke();
            }

            // Sol
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0, 52, w, 18);
            ctx.fillStyle = '#334155';
            ctx.fillRect(0, 52, w, 1);

            // Station de charge / Pod miniature
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(20, 50, 50, 4);
            const dockGlow = isActive ? botData.palette.main : '#334155';
            ctx.fillStyle = dockGlow;
            ctx.fillRect(24, 51, 42, 2);

            // Génération de particules si actif
            if (isActive && Math.random() < 0.3) {
                botData.particles.push({
                    x: 45 + (Math.random() - 0.5) * 20,
                    y: 35,
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: -Math.random() * 1.5 - 0.5,
                    life: 1.0,
                    color: botData.palette.eye
                });
            }

            // Mise à jour et dessin des particules
            for (let i = botData.particles.length - 1; i >= 0; i--) {
                const pt = botData.particles[i];
                pt.x += pt.vx;
                pt.y += pt.vy;
                pt.life -= 0.05;
                if (pt.life <= 0) {
                    botData.particles.splice(i, 1);
                } else {
                    ctx.globalAlpha = Math.max(0, pt.life);
                    ctx.fillStyle = pt.color;
                    ctx.fillRect(Math.round(pt.x), Math.round(pt.y), 2, 2);
                }
            }
            ctx.globalAlpha = 1.0;

            // Dessin du Robot centré dans sa vignette (X: 33, Y: 22)
            this.drawSingleRobot(ctx, 33, 22, botData, isActive);

            // Mise à jour de la bordure et de l'état visuel du conteneur
            if (isActive) {
                botData.cardEl.style.borderColor = botData.palette.main;
                botData.cardEl.style.boxShadow = `0 4px 16px ${botData.palette.main}33`;
                botData.activityFillEl.style.width = '100%';
            } else {
                botData.cardEl.style.borderColor = 'var(--border-subtle)';
                botData.cardEl.style.boxShadow = 'none';
                botData.activityFillEl.style.width = '0%';
            }
        });
    }

    isMatchingBackend(providerId, activeBackend) {
        if (!activeBackend) return false;
        const b = activeBackend.toLowerCase();
        const p = providerId.toLowerCase();
        if (b === 'multiagent') return true; // En multi-agents, tous les ouvriers/modèles sont sollicités
        return p.includes(b) || b.includes(p);
    }

    setAgentState(state, toolName = '', activeBackend = null) {
        this.updateState(state, toolName, activeBackend);
    }

    drawSingleRobot(ctx, x, y, botData, isActive) {
        const bob = isActive ? Math.sin(this.frame * 0.15) * 2 : Math.sin(this.frame * 0.05) * 0.8;
        const ry = Math.round(y + bob);
        const palette = botData.palette;

        // Ombre portée
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(x + 4, 50, 16, 3);

        // Pieds / Chenilles
        ctx.fillStyle = isActive ? '#334155' : '#1e293b';
        ctx.fillRect(x + 4, ry + 22, 6, 6);
        ctx.fillRect(x + 14, ry + 22, 6, 6);

        // Corps
        ctx.fillStyle = isActive ? palette.main : '#334155';
        ctx.fillRect(x + 4, ry + 10, 16, 12);

        // Cœur énergétique / Réacteur
        ctx.fillStyle = isActive ? palette.light : '#475569';
        ctx.fillRect(x + 8, ry + 13, 8, 6);

        // Tête
        ctx.fillStyle = isActive ? palette.dark : '#1e293b';
        ctx.fillRect(x + 5, ry, 14, 9);

        // Yeux / Visière
        let eyeColor = isActive ? palette.eye : '#475569';
        if (isActive) {
            if (this.globalState === 'error') eyeColor = '#f43f5e';
            else if (this.globalState === 'answer' || this.globalState === 'success') eyeColor = '#34d399';
            else if (this.globalState === 'tool_call') eyeColor = '#f59e0b';
        }

        ctx.fillStyle = eyeColor;
        ctx.fillRect(x + 7, ry + 3, 3, 3);
        ctx.fillRect(x + 13, ry + 3, 3, 3);

        // Antennes selon le profil
        ctx.fillStyle = isActive ? '#94a3b8' : '#334155';
        if (palette.antenna === 'single') {
            ctx.fillRect(x + 11, ry - 4, 2, 4);
            ctx.fillStyle = isActive ? eyeColor : '#334155';
            ctx.fillRect(x + 10, ry - 6, 4, 2);
        } else if (palette.antenna === 'dual') {
            ctx.fillRect(x + 6, ry - 4, 2, 4);
            ctx.fillRect(x + 16, ry - 4, 2, 4);
            ctx.fillStyle = isActive ? eyeColor : '#334155';
            ctx.fillRect(x + 5, ry - 5, 3, 2);
            ctx.fillRect(x + 16, ry - 5, 3, 2);
        } else {
            ctx.fillRect(x + 11, ry - 3, 2, 3);
            ctx.fillStyle = isActive ? eyeColor : '#334155';
            ctx.fillRect(x + 8, ry - 6, 8, 3);
        }

        // Bras animés
        ctx.fillStyle = isActive ? '#475569' : '#1e293b';
        if (isActive && (this.globalState === 'tool_call' || this.globalState === 'tool_output')) {
            ctx.fillRect(x, ry + 8, 4, 8);
            ctx.fillRect(x + 20, ry + 6, 5, 4);
        } else if (isActive && (this.globalState === 'answer' || this.globalState === 'success')) {
            ctx.fillRect(x - 1, ry + 4, 4, 8);
            ctx.fillRect(x + 21, ry + 4, 4, 8);
        } else {
            ctx.fillRect(x + 1, ry + 12, 3, 8);
            ctx.fillRect(x + 20, ry + 12, 3, 8);
        }
    }

    updateState(state, toolName = '', activeBackend = null) {
        this.globalState = state;
        this.toolName = toolName;
        if (activeBackend) {
            this.activeBackend = activeBackend;
        }

        const globalStatusEl = this.querySelector('#pixel-global-status');
        if (globalStatusEl) {
            if (state === 'idle') {
                globalStatusEl.textContent = 'UNITÉS EN VEILLE (DOCKS DE CHARGE)';
                globalStatusEl.style.color = 'var(--text-muted)';
            } else {
                globalStatusEl.textContent = `AGENT ACTIF : ${this.activeBackend.toUpperCase()} [${state.toUpperCase()}]`;
                globalStatusEl.style.color = 'var(--accent-cyan)';
            }
        }

        this.cards.forEach((botData, id) => {
            const isTarget = (id === this.activeBackend || this.isMatchingBackend(id, this.activeBackend));
            if (isTarget && state !== 'idle') {
                let txt = 'EN INFÉRENCE...';
                let col = botData.palette.light;
                if (state === 'tool_call') {
                    txt = `OUTIL : ${toolName || 'EXECUTION'}`;
                    col = 'var(--accent-amber)';
                } else if (state === 'tool_output') {
                    txt = `TRAITEMENT SORTIE`;
                    col = 'var(--accent-cyan)';
                } else if (state === 'success' || state === 'answer') {
                    txt = `MISSION TERMINÉE`;
                    col = 'var(--accent-emerald)';
                } else if (state === 'error') {
                    txt = `ERREUR DÉTECTÉE`;
                    col = 'var(--accent-rose)';
                }
                botData.statusTextEl.textContent = txt;
                botData.statusTextEl.style.color = col;
            } else {
                botData.statusTextEl.textContent = botData.provider.is_enabled ? 'DOCK : EN VEILLE' : 'DÉCONNECTÉ';
                botData.statusTextEl.style.color = 'var(--text-muted)';
            }
        });

        // Bips audio rétro
        if (this.soundEnabled) {
            this.play8BitSound(state);
        }
    }

    play8BitSound(type) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.value = 0.02;

            if (type === 'tool_call') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
                osc.start();
                osc.stop(ctx.currentTime + 0.08);
            } else if (type === 'success' || type === 'answer') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, ctx.currentTime);
                osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.06);
                osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.12);
                osc.start();
                osc.stop(ctx.currentTime + 0.18);
            } else if (type === 'error') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, ctx.currentTime);
                osc.frequency.setValueAtTime(110, ctx.currentTime + 0.1);
                osc.start();
                osc.stop(ctx.currentTime + 0.15);
            }
        } catch (e) {
            // Audio context silencieux
        }
    }
}

customElements.define('pixel-agent-stage', PixelAgentStage);
