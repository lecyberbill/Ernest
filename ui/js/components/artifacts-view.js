import { renderMarkdown } from '../markdown.js';

export class ArtifactsView extends HTMLElement {
    constructor() {
        super();
        this.artifacts = [];
        this.selectedArtifact = null;
    }

    connectedCallback() {
        this.innerHTML = `
            <div class="card" style="height: calc(100vh - 120px); display: flex; flex-direction: column; margin-bottom: 0; padding: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.85rem; margin-bottom: 1rem;">
                    <div>
                        <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            Galerie & Visualiseur d'Artefacts
                        </h2>
                        <p class="card-desc" style="margin-bottom: 0;">Fichiers générés, rapports Markdown, code source et schémas matérialisés sur le disque.</p>
                    </div>
                    <button class="btn-primary" id="btn-refresh-artifacts" style="padding: 0.35rem 0.85rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        Rafraîchir
                    </button>
                </div>

                <div style="display: grid; grid-template-columns: 280px 1fr; gap: 1.25rem; flex: 1; overflow: hidden;">
                    <!-- Liste latérale des fichiers générés -->
                    <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); overflow-y: auto; padding: 0.5rem; display: flex; flex-direction: column; gap: 0.4rem;" id="artifacts-list">
                        <div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 1rem;">Chargement des artefacts...</div>
                    </div>

                    <!-- Zone de prévisualisation centrale -->
                    <div style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 1.25rem; display: flex; flex-direction: column; overflow: hidden;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.6rem; margin-bottom: 0.85rem;">
                            <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--accent-cyan); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 450px;" id="preview-filename">Sélectionnez un fichier</div>
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                <button class="btn-bubble-action" id="btn-toggle-edit" style="display: none; cursor: pointer;">Éditer</button>
                                <button class="btn-bubble-action" id="btn-save-artifact" style="display: none; background: rgba(16, 185, 129, 0.2); border-color: var(--accent-emerald); color: var(--accent-emerald); cursor: pointer;">Enregistrer</button>
                                <button class="btn-bubble-action" id="btn-copy-artifact">Copier</button>
                                <button class="btn-bubble-action" id="btn-delete-artifact" style="display: none; background: rgba(244, 63, 94, 0.15); border-color: var(--accent-rose); color: var(--accent-rose); cursor: pointer;">Supprimer</button>
                            </div>
                        </div>

                        <div id="preview-content" style="flex: 1; overflow-y: auto; font-size: 0.88rem; color: var(--text-primary); display: flex; flex-direction: column;">
                            <div style="color: var(--text-muted); text-align: center; margin-top: 4rem;">
                                Aucun artefact sélectionné. Cliquez sur un élément dans la liste à gauche.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.querySelector('#btn-refresh-artifacts').addEventListener('click', () => this.loadArtifacts());
        this.querySelector('#btn-copy-artifact').addEventListener('click', () => this.copyContent());

        const btnEdit = this.querySelector('#btn-toggle-edit');
        const btnSave = this.querySelector('#btn-save-artifact');
        const btnDelete = this.querySelector('#btn-delete-artifact');

        this.isEditing = false;

        btnEdit.addEventListener('click', () => {
            this.isEditing = !this.isEditing;
            btnEdit.textContent = this.isEditing ? 'Aperçu' : 'Éditer';
            btnSave.style.display = this.isEditing ? 'inline-block' : 'none';
            this.renderPreviewOrEditor();
        });

        btnSave.addEventListener('click', async () => {
            const textarea = this.querySelector('#artifact-editor-textarea');
            if (textarea && this.selectedArtifact) {
                btnSave.disabled = true;
                btnSave.textContent = 'Sauvegarde...';
                try {
                    const res = await fetch('/api/artifacts/save', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ path: this.selectedArtifact.path, content: textarea.value })
                    });
                    const data = await res.json();
                    if (data.status === 'saved') {
                        this.selectedContent = textarea.value;
                        this.isEditing = false;
                        btnEdit.textContent = 'Éditer';
                        btnSave.style.display = 'none';
                        this.renderPreviewOrEditor();
                        this.loadArtifacts(false); // rafraîchir la liste sans reset
                    } else {
                        alert(`Erreur: ${data.error}`);
                    }
                } catch (e) {
                    alert(`Erreur réseau: ${e.message}`);
                } finally {
                    btnSave.disabled = false;
                    btnSave.textContent = 'Enregistrer';
                }
            }
        });

        btnDelete.addEventListener('click', async () => {
            if (this.selectedArtifact && confirm(`Supprimer définitivement l'artefact "${this.selectedArtifact.name}" du disque ?`)) {
                btnDelete.disabled = true;
                try {
                    const res = await fetch('/api/artifacts/delete', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ path: this.selectedArtifact.path })
                    });
                    const data = await res.json();
                    if (data.status === 'deleted') {
                        this.selectedArtifact = null;
                        this.selectedContent = '';
                        this.loadArtifacts();
                    } else {
                        alert(`Erreur: ${data.error}`);
                    }
                } catch (e) {
                    alert(`Erreur suppression: ${e.message}`);
                } finally {
                    btnDelete.disabled = false;
                }
            }
        });

        this.loadArtifacts();
    }

    async loadArtifacts() {
        const listContainer = this.querySelector('#artifacts-list');
        try {
            const res = await fetch('/api/artifacts?project_id=default_workspace');
            const items = await res.json();
            this.artifacts = items || [];
            listContainer.innerHTML = '';

            if (this.artifacts.length === 0) {
                listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 1.5rem;">Aucun artefact généré dans ce projet.</div>';
                return;
            }

            this.artifacts.forEach((art, idx) => {
                const item = document.createElement('div');
                item.style.padding = '0.5rem 0.75rem';
                item.style.borderRadius = 'var(--radius-sm)';
                item.style.cursor = 'pointer';
                item.style.display = 'flex';
                item.style.justifyContent = 'space-between';
                item.style.alignItems = 'center';
                item.style.fontSize = '0.8rem';
                item.style.border = '1px solid transparent';

                const ext = art.name.split('.').pop().toLowerCase();
                let iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <span style="display: flex; align-items: center; opacity: 0.8;">${iconSvg}</span>
                        <strong style="color: var(--text-primary); font-family: var(--font-mono);">${art.name}</strong>
                    </div>
                    <span style="color: var(--text-muted); font-size: 0.72rem;">${art.size_kb} KB</span>
                `;

                item.addEventListener('click', () => {
                    this.querySelectorAll('#artifacts-list > div').forEach(el => {
                        el.style.background = 'transparent';
                        el.style.borderColor = 'transparent';
                    });
                    item.style.background = 'rgba(99, 102, 241, 0.15)';
                    item.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                    this.showArtifact(art);
                });

                listContainer.appendChild(item);
                if (idx === 0) item.click();
            });
        } catch (e) {
            listContainer.innerHTML = `<div style="color: var(--accent-rose); font-size: 0.8rem; padding: 1rem;">Erreur: ${e.message}</div>`;
        }
    }

    async showArtifact(art) {
        this.selectedArtifact = art;
        this.isEditing = false;
        this.querySelector('#preview-filename').textContent = `${art.name} (${art.path})`;
        
        const btnEdit = this.querySelector('#btn-toggle-edit');
        const btnSave = this.querySelector('#btn-save-artifact');
        const btnDelete = this.querySelector('#btn-delete-artifact');
        
        btnEdit.style.display = 'inline-block';
        btnEdit.textContent = 'Éditer';
        btnSave.style.display = 'none';
        btnDelete.style.display = 'inline-block';

        const preview = this.querySelector('#preview-content');
        preview.innerHTML = '<div style="color: var(--text-muted);">Lecture du fichier...</div>';

        try {
            const res = await fetch(`/api/artifacts/content?path=${encodeURIComponent(art.path)}`);
            const data = await res.json();
            this.selectedContent = data.content || '';
            this.renderPreviewOrEditor();
        } catch (e) {
            preview.innerHTML = `<div style="color: var(--accent-rose);">Erreur de lecture: ${e.message}</div>`;
        }
    }

    renderPreviewOrEditor() {
        const preview = this.querySelector('#preview-content');
        const art = this.selectedArtifact;
        if (!art) return;

        if (this.isEditing) {
            preview.innerHTML = `
                <textarea id="artifact-editor-textarea" style="width: 100%; height: 100%; background: #03060d; border: 1px solid var(--border-accent); border-radius: var(--radius-sm); color: #f1f5f9; font-family: var(--font-mono); font-size: 0.82rem; padding: 0.85rem; resize: none; outline: none; line-height: 1.5;">${(this.selectedContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
            `;
            return;
        }

        const textContent = this.selectedContent || '';
        const ext = (art.name.split('.').pop() || '').toLowerCase();

        if (['md', 'markdown'].includes(ext)) {
            preview.innerHTML = renderMarkdown(textContent);
        } else if (['html', 'svg'].includes(ext)) {
            preview.innerHTML = `
                <div style="margin-bottom: 0.5rem; display: flex; gap: 0.5rem;">
                    <span class="badge badge-emerald">Aperçu Rendu Interactif</span>
                </div>
                <iframe srcdoc="${textContent.replace(/"/g, '&quot;')}" style="width: 100%; height: 85%; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: white;"></iframe>
            `;
        } else {
            // Affichage Code Source Coloré avec Prism.js
            const langMap = {
                'js': 'javascript',
                'javascript': 'javascript',
                'ts': 'typescript',
                'py': 'python',
                'python': 'python',
                'rs': 'rust',
                'rust': 'rust',
                'json': 'json',
                'sh': 'bash',
                'bash': 'bash',
                'ps1': 'powershell',
                'sql': 'sql',
                'css': 'css',
                'c': 'c',
                'cpp': 'cpp',
                'toml': 'toml',
                'yaml': 'yaml',
                'yml': 'yaml'
            };
            const lang = langMap[ext] || 'clike';
            // Fallback échappement HTML si Prism n'est pas dispo
            const escapedCode = textContent
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            let highlightedHtml = escapedCode;
            if (typeof window !== 'undefined' && window.Prism && window.Prism.languages[lang]) {
                try {
                    highlightedHtml = window.Prism.highlight(textContent, window.Prism.languages[lang], lang);
                } catch (e) {
                    console.warn('Prism direct highlight error', e);
                }
            }

            preview.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; padding-bottom: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <span class="badge badge-primary">${lang.toUpperCase()}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${textContent.split('\n').length} lignes • ${Math.round(textContent.length / 1024 * 10) / 10} KB</span>
                    </div>
                </div>
                <pre class="language-${lang}" style="margin: 0; background: #03060d; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 1.25rem; overflow: auto; flex: 1;"><code class="language-${lang}" style="font-family: var(--font-mono); font-size: 0.85rem; line-height: 1.6;">${highlightedHtml}</code></pre>
            `;
        }
    }

    copyContent() {
        if (this.selectedContent) {
            navigator.clipboard.writeText(this.selectedContent);
            alert('Contenu copié dans le presse-papiers !');
        }
    }
}
customElements.define('artifacts-view', ArtifactsView);

