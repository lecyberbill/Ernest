import { store } from '../store.js';

export class MemoryGrid extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <div class="card" style="position: relative;">
                <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    Inspecteur & Éditeur de Mémoires
                </h2>
                <p class="card-desc">Système de persistance et de rappel contextuel isolé par projet et par session.</p>

                <div style="display: grid; grid-template-columns: 1.2fr 2fr 140px auto; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <input type="text" id="mem-key" placeholder="Clé (ex: arch_target)" />
                    <input type="text" id="mem-content" placeholder="Contenu textuel ou Markdown..." />
                    <select id="mem-scope">
                        <option value="project">Project (Permanent)</option>
                        <option value="session">Session (Éphémère)</option>
                    </select>
                    <button class="btn-primary" id="btn-add-mem">
                        <span>+</span> Ajouter
                    </button>
                </div>

                <!-- Recherche sémantique / plein texte FTS5 & Vectorielle -->
                <div style="display: flex; gap: 0.75rem; margin-bottom: 1.25rem;">
                    <input type="text" id="mem-search-input" placeholder="Recherche sémantique RAG & plein-texte FTS5 dans les mémoires..." style="flex: 1;" />
                    <button class="btn-primary" id="btn-search-mem" style="padding: 0.4rem 0.85rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        Rechercher
                    </button>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 120px;">Scope</th>
                            <th style="width: 220px;">Clé</th>
                            <th>Aperçu du Contenu</th>
                            <th style="width: 110px; text-align: center;">Détails</th>
                            <th style="width: 160px;">Dernière MàJ</th>
                        </tr>
                    </thead>
                    <tbody id="mem-table-body">
                        <tr><td colspan="5" style="color: var(--text-muted); text-align: center;">Chargement des mémoires...</td></tr>
                    </tbody>
                </table>

                <!-- Modale d'inspection intégrale du contenu de la mémoire -->
                <div id="memory-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(6px); z-index: 1000; align-items: center; justify-content: center; padding: 1.5rem;">
                    <div style="background: #0b0f19; border: 1px solid var(--border-accent); border-radius: var(--radius-sm); width: 100%; max-width: 700px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 16px 40px rgba(0,0,0,0.8); overflow: hidden;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02);">
                            <div style="display: flex; align-items: center; gap: 0.6rem;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                <strong id="modal-mem-key" style="color: var(--accent-cyan); font-family: var(--font-mono); font-size: 0.95rem;"></strong>
                                <span id="modal-mem-scope" class="badge"></span>
                            </div>
                            <button id="btn-close-modal" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; padding: 0.2rem 0.5rem;">✕</button>
                        </div>
                        <div style="padding: 1.25rem; overflow-y: auto; flex: 1;">
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem; font-family: var(--font-mono);">Contenu intégral stocké :</div>
                            <pre id="modal-mem-content" style="background: #03060d; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 1rem; color: #f1f5f9; font-family: var(--font-mono); font-size: 0.82rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; user-select: text; margin: 0;"></pre>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1.25rem; border-top: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.3);">
                            <span id="modal-mem-date" style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);"></span>
                            <div style="display: flex; gap: 0.6rem;">
                                <button id="btn-copy-modal" class="btn-secondary" style="font-size: 0.78rem; padding: 0.3rem 0.75rem; cursor: pointer;">Copier</button>
                                <button id="btn-ok-modal" class="btn-primary" style="font-size: 0.78rem; padding: 0.3rem 0.9rem;">Fermer</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.querySelector('#btn-add-mem').addEventListener('click', () => this.addMemory());
        this.querySelector('#btn-search-mem').addEventListener('click', () => this.searchMemories());
        this.querySelector('#mem-search-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.searchMemories();
        });

        // Fermeture de la modale
        const modal = this.querySelector('#memory-modal');
        this.querySelector('#btn-close-modal').addEventListener('click', () => modal.style.display = 'none');
        this.querySelector('#btn-ok-modal').addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });

        this.querySelector('#btn-copy-modal').addEventListener('click', () => {
            const txt = this.querySelector('#modal-mem-content').textContent;
            if (txt) {
                navigator.clipboard.writeText(txt);
                alert('Contenu copié dans le presse-papiers !');
            }
        });

        this.loadMemories();
    }

    renderRow(m) {
        const tr = document.createElement('tr');
        const badgeClass = m.scope === 'project' ? 'badge-primary' : 'badge-amber';
        const rawContent = m.content || '';

        // Extrait concis : max 100 caractères nettoyés
        const previewText = rawContent.replace(/\s+/g, ' ').trim();
        const shortPreview = previewText.length > 90 ? previewText.substring(0, 90) + '...' : previewText;

        tr.innerHTML = `
            <td><span class="badge ${badgeClass}">${m.scope}</span></td>
            <td><code style="color: var(--accent-cyan); font-weight: 600;">${m.key}</code></td>
            <td style="color: var(--text-secondary); font-size: 0.82rem; line-height: 1.4; word-break: break-word;">${shortPreview}</td>
            <td style="text-align: center;">
                <button class="btn-detail" style="background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.4); color: var(--accent-cyan); border-radius: var(--radius-sm); padding: 0.25rem 0.55rem; font-size: 0.72rem; cursor: pointer; font-family: var(--font-mono); display: inline-flex; align-items: center; gap: 0.25rem;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    Détail
                </button>
            </td>
            <td style="color: var(--text-muted); font-size: 0.78rem; font-family: var(--font-mono);">${m.updated_at || m.created_at || ''}</td>
        `;

        tr.querySelector('.btn-detail').addEventListener('click', () => this.openMemoryDetail(m));
        return tr;
    }

    openMemoryDetail(m) {
        const modal = this.querySelector('#memory-modal');
        this.querySelector('#modal-mem-key').textContent = m.key;

        const scopeBadge = this.querySelector('#modal-mem-scope');
        scopeBadge.textContent = m.scope;
        scopeBadge.className = `badge ${m.scope === 'project' ? 'badge-primary' : 'badge-amber'}`;

        this.querySelector('#modal-mem-content').textContent = m.content || '';
        this.querySelector('#modal-mem-date').textContent = `Dernière mise à jour : ${m.updated_at || m.created_at || 'Inconnue'}`;

        modal.style.display = 'flex';
    }

    async searchMemories() {
        const query = this.querySelector('#mem-search-input').value.trim();
        const tbody = this.querySelector('#mem-table-body');
        try {
            const url = query ? `/api/memories?project_id=default_workspace&q=${encodeURIComponent(query)}` : `/api/memories?project_id=default_workspace`;
            const res = await fetch(url);
            const memories = await res.json();
            tbody.innerHTML = '';
            if (!memories || memories.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="color: var(--text-muted); text-align: center; padding: 2rem;">Aucun résultat correspondant dans les mémoires.</td></tr>';
                return;
            }
            memories.forEach(m => tbody.appendChild(this.renderRow(m)));
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" style="color: var(--accent-rose); text-align: center;">Erreur recherche: ${e.message}</td></tr>`;
        }
    }

    async loadMemories() {
        const tbody = this.querySelector('#mem-table-body');
        try {
            const memories = await store.getMemories('default_workspace');
            tbody.innerHTML = '';
            if (!memories || memories.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="color: var(--text-muted); text-align: center; padding: 2rem;">Aucune mémoire enregistrée pour ce projet.</td></tr>';
                return;
            }
            memories.forEach(m => tbody.appendChild(this.renderRow(m)));
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" style="color: var(--accent-rose); text-align: center;">Erreur: ${e.message}</td></tr>`;
        }
    }

    async addMemory() {
        const key = this.querySelector('#mem-key').value.trim();
        const content = this.querySelector('#mem-content').value.trim();
        const scope = this.querySelector('#mem-scope').value;
        if (!key || !content) return;

        await store.saveMemory({
            project_id: 'default_workspace',
            key,
            content,
            scope
        });
        this.querySelector('#mem-key').value = '';
        this.querySelector('#mem-content').value = '';
        this.loadMemories();
    }
}
customElements.define('memory-grid', MemoryGrid);
