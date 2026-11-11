import { store } from '../store.js';

export class SettingsView extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 1050px;">
                <!-- Section 1 : Catalogue Modulaire des Fournisseurs LLM (Tuiles Multi-Modèles) -->
                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.85rem; margin-bottom: 1rem;">
                        <div>
                            <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                Hub Multi-Modèles & Fournisseurs d'Inférence
                            </h2>
                            <p class="card-desc" style="margin-bottom: 0;">Déclarez autant de moteurs locaux (Ollama, LM Studio, vLLM) ou cloud (DeepSeek, OpenAI, Groq, Mistral) que souhaité sous forme de tuiles connectables.</p>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <button class="btn-secondary" id="btn-refresh-models" style="padding: 0.4rem 0.8rem; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.35rem;" title="Rafraîchir les sondages et l'état des modèles">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                                Actualiser l'état
                            </button>
                            <button class="btn-primary" id="btn-open-add-model" style="padding: 0.4rem 0.9rem; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                Ajouter un Modèle
                            </button>
                        </div>
                    </div>

                    <!-- Formulaire d'ajout rapide (repliable) -->
                    <div id="add-model-panel" style="display: none; background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-accent); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1.25rem;">
                        <input type="hidden" id="edit-mod-id" value="" />
                        <div id="form-model-title" style="font-weight: 700; color: var(--accent-cyan); margin-bottom: 0.75rem; font-size: 0.85rem;">Déclarer un nouveau point d'inférence :</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1.2fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
                            <div>
                                <label style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">Nom d'affichage</label>
                                <input type="text" id="new-mod-name" placeholder="ex: vLLM Server, Groq Llama, etc." />
                            </div>
                            <div>
                                <label style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">Type d'API</label>
                                <select id="new-mod-type" style="background: rgba(0,0,0,0.5); border: 1px solid var(--border-subtle); color: var(--text-primary); border-radius: var(--radius-sm); width: 100%; height: 36px; padding: 0 0.5rem; font-size: 0.82rem;">
                                    <option value="openai">OpenAI-Compatible (LM Studio / Groq / DeepSeek)</option>
                                    <option value="ollama">Ollama Native (/api/chat)</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">URL Endpoint</label>
                                <input type="text" id="new-mod-url" placeholder="http://127.0.0.1:1234 ou https://api.groq.com/openai" />
                            </div>
                            <div>
                                <label style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">Identifiant Modèle</label>
                                <input type="text" id="new-mod-model" placeholder="ex: llama-3.3-70b, local-model" />
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.75rem; align-items: flex-end;">
                            <div style="flex: 1;">
                                <label style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">Clé API (optionnel, chiffrée DPAPI)</label>
                                <input type="password" id="new-mod-key" placeholder="sk-... (laisser vide pour ne pas modifier)" />
                            </div>
                            <button class="btn-primary" id="btn-save-new-model" style="padding: 0.4rem 1rem;">Enregistrer</button>
                            <button class="btn-secondary" id="btn-cancel-new-model" style="padding: 0.4rem 0.8rem;">Annuler</button>
                        </div>
                    </div>

                    <!-- Grille des Tuiles de Modèles -->
                    <div id="models-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem;">
                        <div style="color: var(--text-muted); font-size: 0.8rem; padding: 1rem;">Chargement des modèles...</div>
                    </div>
                </div>

                <!-- Section 2 : Configuration des Chemins & Ressources Système -->
                <div class="card">
                    <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                        Répertoire & Chemins Système Personnalisés
                    </h2>
                    <p class="card-desc">Indiquez ici n'importe quel dossier clé, chemin d'outils, repo git ou documentation que l'agent doit connaître sur la machine hôte.</p>

                    <div style="display: grid; grid-template-columns: 1fr 1.5fr auto; gap: 0.75rem; margin-bottom: 1.25rem;">
                        <input type="text" id="res-key" placeholder="Nom de la ressource (ex: repo_git, docs_path, dataset_dir)..." />
                        <input type="text" id="res-value" placeholder="Chemin absolu ou URI (ex: D:\\Projet\\Earnest, C:\\tools)..." />
                        <button class="btn-primary" id="btn-add-resource">
                            <span>+</span> Associer
                        </button>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 250px;">Clé de Ressource</th>
                                <th>Chemin ou Valeur</th>
                                <th style="width: 100px;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="resources-table-body">
                            <tr><td colspan="3" style="color: var(--text-muted); text-align: center;">Chargement des ressources...</td></tr>
                        </tbody>
                    </table>
                </div>

                <!-- Section 3 : Serveurs MCP Externes (Model Context Protocol) -->
                <div class="card">
                    <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                        Serveurs MCP Déclarés (JSON-RPC 2.0 / Stdio)
                    </h2>
                    <p class="card-desc">Ajoutez des serveurs MCP locaux ou distants (ex: npx -y @modelcontextprotocol/server-filesystem, python -m mon_serveur_mcp).</p>

                    <div style="display: grid; grid-template-columns: 1fr 1.5fr 1fr auto; gap: 0.75rem; margin-bottom: 1.25rem;">
                        <input type="text" id="mcp-name" placeholder="Nom (ex: filesystem, git, db)..." />
                        <input type="text" id="mcp-cmd" placeholder="Commande (ex: npx, python, node)..." />
                        <input type="text" id="mcp-args" placeholder="Arguments (séparés par espace)..." />
                        <button class="btn-primary" id="btn-add-mcp">
                            <span>+</span> Ajouter MCP
                        </button>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 150px;">Serveur</th>
                                <th>Commande & Arguments</th>
                                <th style="width: 160px;">Action & Test</th>
                            </tr>
                        </thead>
                        <tbody id="mcp-table-body">
                            <tr><td colspan="3" style="color: var(--text-muted); text-align: center;">Chargement des serveurs MCP...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.querySelector('#btn-refresh-models').addEventListener('click', async () => {
            const btn = this.querySelector('#btn-refresh-models');
            btn.disabled = true;
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sondage...`;
            try {
                await this.loadModelProviders();
                window.dispatchEvent(new CustomEvent('earnest:run_completed'));
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Actualiser l'état`;
            }
        });

        this.querySelector('#btn-open-add-model').addEventListener('click', () => {
            const panel = this.querySelector('#add-model-panel');
            this.querySelector('#edit-mod-id').value = '';
            this.querySelector('#form-model-title').textContent = 'Déclarer un nouveau point d\'inférence :';
            this.querySelector('#new-mod-name').value = '';
            this.querySelector('#new-mod-url').value = '';
            this.querySelector('#new-mod-model').value = '';
            this.querySelector('#new-mod-key').value = '';
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        this.querySelector('#btn-cancel-new-model').addEventListener('click', () => {
            this.querySelector('#add-model-panel').style.display = 'none';
        });
        this.querySelector('#btn-save-new-model').addEventListener('click', () => this.saveNewModelProvider());

        this.querySelector('#btn-add-resource').addEventListener('click', () => this.addResource());
        this.querySelector('#btn-add-mcp').addEventListener('click', () => this.addMCPServer());
        this.loadAll();
    }

    async loadAll() {
        await Promise.all([
            this.loadModelProviders(),
            this.loadResources(),
            this.loadMCPServers()
        ]);
    }

    async loadModelProviders() {
        const grid = this.querySelector('#models-grid');
        try {
            const res = await fetch('/api/model_providers');
            const data = await res.json();
            const providers = Array.isArray(data) ? data : (data.providers || []);

            grid.innerHTML = '';
            if (providers.length === 0) {
                grid.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem;">Aucun modèle configuré. Cliquez sur "+ Ajouter un Modèle".</div>';
                return;
            }

            providers.forEach(p => {
                const card = document.createElement('div');
                card.style.cssText = `
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid ${p.is_enabled ? 'var(--border-subtle)' : 'rgba(239, 68, 68, 0.3)'};
                    border-radius: var(--radius-sm);
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    gap: 0.75rem;
                    position: relative;
                `;

                const statusColor = p.is_enabled ? 'var(--accent-emerald)' : 'var(--text-muted)';
                const statusText = p.is_enabled ? 'Actif / Connecté' : 'Déconnecté';
                const statusDot = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; margin-right: 6px;"></span>`;

                card.innerHTML = `
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.4rem;">
                            <strong style="color: var(--text-primary); font-size: 0.95rem;">${p.name}</strong>
                            <span style="font-size: 0.7rem; font-family: var(--font-mono); padding: 0.15rem 0.4rem; border-radius: 4px; background: rgba(255,255,255,0.06); color: var(--accent-cyan); text-transform: uppercase;">${p.provider_type}</span>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">
                            <span>Modèle : </span><code style="color: var(--accent-amber);">${p.model}</code>
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); word-break: break-all; opacity: 0.85;">
                            ${p.base_url}
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
                        <span style="font-size: 0.72rem; display: flex; align-items: center; color: ${statusColor};">
                            ${statusDot} ${statusText}
                        </span>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <button class="btn-edit-mod" style="background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.4); color: var(--accent-indigo); padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                Éditer
                            </button>
                            <button class="btn-toggle-mod" style="background: ${p.is_enabled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; border: 1px solid ${p.is_enabled ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}; color: ${p.is_enabled ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.75rem; cursor: pointer;">
                                ${p.is_enabled ? 'Déconnecter' : 'Connecter'}
                            </button>
                            <button class="btn-del-mod" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center;" title="Supprimer ce modèle">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>
                `;

                card.querySelector('.btn-edit-mod').addEventListener('click', () => this.editModelProvider(p));
                card.querySelector('.btn-toggle-mod').addEventListener('click', () => this.toggleModelProvider(p.id, p.is_enabled ? 0 : 1));
                card.querySelector('.btn-del-mod').addEventListener('click', () => this.deleteModelProvider(p.id, p.name));
                grid.appendChild(card);
            });
        } catch (e) {
            grid.innerHTML = `<div style="color: var(--accent-rose); font-size: 0.8rem;">Erreur chargement modèles: ${e.message}</div>`;
        }
    }

    editModelProvider(p) {
        const panel = this.querySelector('#add-model-panel');
        this.querySelector('#edit-mod-id').value = p.id;
        this.querySelector('#form-model-title').textContent = `Modifier le point d'inférence "${p.name}" :`;
        this.querySelector('#new-mod-name').value = p.name;
        this.querySelector('#new-mod-type').value = p.provider_type;
        this.querySelector('#new-mod-url').value = p.base_url;
        this.querySelector('#new-mod-model').value = p.model;
        this.querySelector('#new-mod-key').value = '';
        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async saveNewModelProvider() {
        const id = this.querySelector('#edit-mod-id').value.trim() || undefined;
        const name = this.querySelector('#new-mod-name').value.trim();
        const provider_type = this.querySelector('#new-mod-type').value;
        const base_url = this.querySelector('#new-mod-url').value.trim();
        const model = this.querySelector('#new-mod-model').value.trim();
        const api_key = this.querySelector('#new-mod-key').value.trim() || undefined;

        if (!name || !base_url || !model) {
            alert('Veuillez renseigner au moins le nom, l\'URL et le modèle.');
            return;
        }

        try {
            const res = await fetch('/api/model_providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name, provider_type, base_url, model, api_key })
            });
            const data = await res.json();
            if (data.status === 'ok' || data.status === 'saved') {
                this.querySelector('#edit-mod-id').value = '';
                this.querySelector('#new-mod-name').value = '';
                this.querySelector('#new-mod-url').value = '';
                this.querySelector('#new-mod-model').value = '';
                this.querySelector('#new-mod-key').value = '';
                this.querySelector('#add-model-panel').style.display = 'none';
                await this.loadModelProviders();
                window.dispatchEvent(new CustomEvent('earnest:run_completed'));
            } else {
                alert(`Erreur: ${data.error}`);
            }
        } catch (e) {
            alert(`Erreur réseau: ${e.message}`);
        }
    }

    async toggleModelProvider(id, isEnabled) {
        try {
            const res = await fetch('/api/model_providers/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, is_enabled: isEnabled })
            });
            const data = await res.json();
            if (data.status === 'ok' || data.status === 'updated') {
                await this.loadModelProviders();
                window.dispatchEvent(new CustomEvent('earnest:run_completed'));
            } else {
                alert(`Erreur: ${data.error}`);
            }
        } catch (e) {
            alert(`Erreur: ${e.message}`);
        }
    }

    async deleteModelProvider(id, name) {
        if (!confirm(`Supprimer définitivement le fournisseur de modèle "${name}" ?`)) return;
        try {
            const res = await fetch('/api/model_providers/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (data.status === 'ok' || data.status === 'deleted') {
                await this.loadModelProviders();
                window.dispatchEvent(new CustomEvent('earnest:run_completed'));
            } else {
                alert(`Erreur: ${data.error}`);
            }
        } catch (e) {
            alert(`Erreur: ${e.message}`);
        }
    }

    async loadResources() {
        const tbody = this.querySelector('#resources-table-body');
        try {
            const settings = await store.getSettings();
            tbody.innerHTML = '';

            const reserved = ['ollama_base_url', 'default_model', 'lmstudio_url', 'lmstudio_model', 'cloud_url', 'cloud_model', 'llm_api_key', 'llm_provider'];
            const customResources = Object.entries(settings).filter(([k]) => !reserved.includes(k));

            if (customResources.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="color: var(--text-muted); text-align: center; padding: 1.5rem;">Aucun chemin ou ressource configuré.</td></tr>';
            } else {
                customResources.forEach(([k, v]) => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><code style="color: var(--accent-cyan); font-weight: 600;">${k}</code></td>
                        <td style="color: var(--text-primary); font-family: var(--font-mono);">${v}</td>
                        <td>
                            <button style="background: none; border: none; color: var(--accent-rose); cursor: pointer; font-size: 0.8rem;" data-del="${k}">Supprimer</button>
                        </td>
                    `;
                    tr.querySelector('button').addEventListener('click', () => this.deleteResource(k));
                    tbody.appendChild(tr);
                });
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="3" style="color: var(--accent-rose);">Erreur: ${e.message}</td></tr>`;
        }
    }

    async loadMCPServers() {
        const tbody = this.querySelector('#mcp-table-body');
        try {
            const res = await fetch('/api/mcp/servers');
            const servers = await res.json();
            tbody.innerHTML = '';
            if (!servers || servers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="color: var(--text-muted); text-align: center; padding: 1.5rem;">Aucun serveur MCP configuré.</td></tr>';
                return;
            }
            servers.forEach((s, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong style="color: var(--accent-cyan);">${s.name}</strong></td>
                    <td><code>${s.command} ${(s.args || []).join(' ')}</code></td>
                    <td style="display: flex; gap: 0.5rem; align-items: center;">
                        <button class="btn-primary" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" data-test="${s.name}">Tester</button>
                        <button style="background: none; border: none; color: var(--accent-rose); cursor: pointer; font-size: 0.8rem;" data-del="${idx}">Supprimer</button>
                    </td>
                `;
                tr.querySelector('[data-test]').addEventListener('click', () => this.testMCPServer(s));
                tr.querySelector('[data-del]').addEventListener('click', () => this.deleteMCPServer(idx));
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="3" style="color: var(--accent-rose);">Erreur MCP: ${e.message}</td></tr>`;
        }
    }

    async addMCPServer() {
        const name = this.querySelector('#mcp-name').value.trim();
        const cmd = this.querySelector('#mcp-cmd').value.trim();
        const argsStr = this.querySelector('#mcp-args').value.trim();
        if (!name || !cmd) {
            alert('Le nom et la commande du serveur MCP sont requis.');
            return;
        }
        const args = argsStr ? argsStr.split(/\s+/) : [];
        const res = await fetch('/api/mcp/servers');
        const servers = await res.json();
        servers.push({ name, command: cmd, args });
        await fetch('/api/mcp/servers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ servers })
        });
        this.querySelector('#mcp-name').value = '';
        this.querySelector('#mcp-cmd').value = '';
        this.querySelector('#mcp-args').value = '';
        await this.loadMCPServers();
    }

    async deleteMCPServer(index) {
        const res = await fetch('/api/mcp/servers');
        const servers = await res.json();
        servers.splice(index, 1);
        await fetch('/api/mcp/servers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ servers })
        });
        await this.loadMCPServers();
    }

    async testMCPServer(s) {
        try {
            const res = await fetch('/api/mcp/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: s.name, command: s.command, args: s.args })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                const toolNames = data.tools.map(t => t.name).join(', ');
                alert(`Serveur MCP '${s.name}' opérationnel !\nOutils détectés (${data.tools.length}):\n${toolNames || 'Aucun outil'}`);
            } else {
                alert(`Échec MCP: ${data.error}`);
            }
        } catch (e) {
            alert(`Erreur de communication: ${e.message}`);
        }
    }

    async addResource() {
        const key = this.querySelector('#res-key').value.trim();
        const value = this.querySelector('#res-value').value.trim();
        if (!key || !value) return;

        await store.saveSettings({ [key]: value });
        this.querySelector('#res-key').value = '';
        this.querySelector('#res-value').value = '';
        this.loadAll();
    }

    async deleteResource(key) {
        await store.saveSettings({ [key]: "" });
        this.loadAll();
    }
}
customElements.define('settings-view', SettingsView);
