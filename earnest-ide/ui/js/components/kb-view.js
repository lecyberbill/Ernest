export class KbView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.entries = [];
        this.currentFilterKind = '';
        this.currentFilterStatus = '';
        this.searchQuery = '';
        this.selectedEntryId = null;
        this.init();
    }

    init() {
        this.renderLayout();
        this.bindEvents();
        this.loadEntries();
    }

    renderLayout() {
        this.container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; width: 100%; background: #0f172a; color: var(--text-primary); font-family: var(--font-sans); overflow: hidden;">
                <!-- Barre d'outils supérieure de la KB (Plein écran) -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1.25rem; background: var(--surface-dim); border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;">
                    <div style="display: flex; align-items: center; gap: 0.85rem;">
                        <span style="font-size: 1.4rem;">🧠</span>
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span style="font-weight: 800; font-family: var(--font-mono); font-size: 0.95rem; color: #fff;">BASE DE CONNAISSANCES D'EXPÉRIENCE</span>
                                <span id="kb-count-badge" style="background: rgba(99, 102, 241, 0.25); color: var(--accent-cyan); font-family: var(--font-mono); font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(99, 102, 241, 0.4); font-weight: 700;">0 vérités</span>
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-muted);">
                                Retours d'essais, pièges découverts et règles d'or scellées consultés automatiquement par les agents.
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <button id="kb-btn-export" class="icon-btn" style="border: 1px solid var(--border-subtle); padding: 5px 10px; font-size: 0.75rem; border-radius: 4px; gap: 4px;" title="Exporter la base en JSON">
                            <span>💾</span> Exporter
                        </button>
                        <button id="kb-btn-refresh" class="icon-btn" style="border: 1px solid var(--border-subtle); padding: 5px 10px; font-size: 0.75rem; border-radius: 4px; gap: 4px;" title="Recharger les données">
                            <span>🔄</span> Actualiser
                        </button>
                        <button id="kb-btn-new-rule" class="btn-primary" style="padding: 6px 14px; font-size: 0.78rem; font-weight: 700; display: flex; align-items: center; gap: 0.4rem; border-radius: 4px;">
                            <span>➕</span> Nouvelle Règle d'or
                        </button>
                    </div>
                </div>

                <!-- Zone de filtrage et recherche -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 1.25rem; background: rgba(15, 23, 42, 0.6); border-bottom: 1px solid var(--border-subtle); gap: 1rem; flex-shrink: 0;">
                    <!-- Recherche instantanée -->
                    <div style="position: relative; flex: 1; max-width: 480px;">
                        <input type="text" id="kb-search-input" placeholder="Filtrer instantanément (ex: sqlite, windows, port, monaco, token)..." 
                               style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 6px 10px 6px 30px; border-radius: 6px; font-family: var(--font-mono); font-size: 0.8rem;" />
                        <span style="position: absolute; left: 10px; top: 7px; color: var(--text-muted); font-size: 0.8rem;">🔍</span>
                    </div>

                    <!-- Pilules de filtrage -->
                    <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; font-family: var(--font-mono);">
                        <button class="kb-pill active" data-kind="">Tous types</button>
                        <button class="kb-pill" data-kind="piege">⚠️ Pièges & Erreurs</button>
                        <button class="kb-pill" data-kind="regle">📐 Règles d'ingénierie</button>
                        <button class="kb-pill" data-kind="catalogue">📦 Catalogues</button>
                        <span style="color: var(--border-subtle); margin: 0 4px;">|</span>
                        <button class="kb-pill-status active" data-status="">Tous statuts</button>
                        <button class="kb-pill-status" data-status="valide">🟢 Validés</button>
                        <button class="kb-pill-status" data-status="non_teste">🟡 Découverts par Agent</button>
                    </div>
                </div>

                <!-- Contenu Principal en 2 Colonnes (Liste de gauche + Vue détaillée / Édition à droite) -->
                <div style="display: grid; grid-template-columns: 420px 1fr; flex: 1; overflow: hidden;">
                    <!-- Colonne Gauche : Liste des Cartes -->
                    <div id="kb-cards-stream" style="overflow-y: auto; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.65rem; border-right: 1px solid var(--border-subtle); background: rgba(11, 15, 25, 0.5);">
                        <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 3rem;">Chargement des connaissances...</div>
                    </div>

                    <!-- Colonne Droite : Vue Détaillée / Inspecteur & Modèle Avant/Après -->
                    <div id="kb-detail-pane" style="overflow-y: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; background: #0f172a;">
                        <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 4rem;">
                            👈 Sélectionnez une connaissance dans la liste pour inspecter la cause, la solution et apposer votre validation.
                        </div>
                    </div>
                </div>

                <!-- Modal Nouvelle Règle -->
                <div id="kb-modal-new" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
                    <div style="background: #0f172a; border: 1px solid var(--accent-cyan); width: 560px; max-width: 90vw; border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; font-family: var(--font-mono); box-shadow: 0 15px 40px rgba(0,0,0,0.9);">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.6rem;">
                            <span style="font-weight: 800; color: var(--accent-cyan); font-size: 0.95rem;">➕ INJECTER UNE VÉRITÉ D'EXPÉRIENCE</span>
                            <button id="kb-modal-close" style="background: transparent; border: none; color: #fff; cursor: pointer; font-size: 1.2rem;">✕</button>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                            <div>
                                <label style="display: block; font-size: 0.72rem; color: var(--text-muted); margin-bottom: 3px;">Type</label>
                                <select id="kb-new-kind" style="width: 100%; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 6px; border-radius: 4px; font-size: 0.78rem;">
                                    <option value="regle">📐 Règle d'or (Obligatoire)</option>
                                    <option value="piege">⚠️ Piège d'ingénierie (À proscrire)</option>
                                    <option value="catalogue">📦 Catalogue technique / API</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.72rem; color: var(--text-muted); margin-bottom: 3px;">Produit / Composant</label>
                                <input type="text" id="kb-new-product" value="earnest" style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 6px; border-radius: 4px; font-size: 0.78rem;" />
                            </div>
                        </div>

                        <div>
                            <label style="display: block; font-size: 0.72rem; color: var(--text-muted); margin-bottom: 3px;">Titre de la découverte *</label>
                            <input type="text" id="kb-new-title" placeholder="ex: Erreur de socket réutilisé sous tiny_http" style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 7px; border-radius: 4px; font-size: 0.8rem;" />
                        </div>

                        <div>
                            <label style="display: block; font-size: 0.72rem; color: #fb7185; margin-bottom: 3px;">Symptôme / Erreur constatée</label>
                            <textarea id="kb-new-symptom" rows="2" placeholder="ex: JSON vide {} lors du deuxième appel ou connexion reset" style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 6px; border-radius: 4px; font-size: 0.78rem; resize: vertical;"></textarea>
                        </div>

                        <div>
                            <label style="display: block; font-size: 0.72rem; color: var(--accent-emerald); margin-bottom: 3px;">Solution appliquée & vérifiée *</label>
                            <textarea id="kb-new-correction" rows="3" placeholder="ex: Toujours lire le body une seule fois et cloner les octets avant traitement" style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 6px; border-radius: 4px; font-size: 0.78rem; resize: vertical;"></textarea>
                        </div>

                        <div>
                            <label style="display: block; font-size: 0.72rem; color: #38bdf8; margin-bottom: 3px;">Extrait de code / Snippet (optionnel)</label>
                            <textarea id="kb-new-example" rows="2" placeholder="ex: let mut body = String::new(); req.as_reader().read_to_string(&mut body).ok();" style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 6px; border-radius: 4px; font-size: 0.75rem; font-family: var(--font-mono); resize: vertical;"></textarea>
                        </div>

                        <div style="display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.5rem;">
                            <button id="kb-modal-cancel" style="background: transparent; border: 1px solid var(--border-subtle); color: #fff; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 0.78rem;">Annuler</button>
                            <button id="kb-modal-submit" class="btn-primary" style="padding: 6px 16px; font-size: 0.78rem; font-weight: 700;">Enregistrer & Sceller</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.injectStyles();
    }

    injectStyles() {
        if (!document.getElementById('kb-styles')) {
            const style = document.createElement('style');
            style.id = 'kb-styles';
            style.textContent = `
                .kb-pill, .kb-pill-status {
                    background: #0b0f19;
                    border: 1px solid var(--border-subtle);
                    color: var(--text-muted);
                    padding: 4px 10px;
                    border-radius: 14px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .kb-pill:hover, .kb-pill-status:hover {
                    color: #fff;
                    border-color: var(--accent-cyan);
                }
                .kb-pill.active, .kb-pill-status.active {
                    background: rgba(99, 102, 241, 0.25);
                    border-color: var(--accent-cyan);
                    color: var(--accent-cyan);
                    font-weight: 700;
                }
                .kb-card-item {
                    background: rgba(15, 23, 42, 0.8);
                    border: 1px solid var(--border-subtle);
                    border-radius: 6px;
                    padding: 0.85rem;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                }
                .kb-card-item:hover {
                    border-color: rgba(99, 102, 241, 0.6);
                    background: rgba(30, 41, 59, 0.7);
                    transform: translateY(-1px);
                }
                .kb-card-item.selected {
                    border-color: var(--accent-cyan);
                    background: rgba(99, 102, 241, 0.15);
                    box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
                }
            `;
            document.head.appendChild(style);
        }
    }

    bindEvents() {
        // Search
        const searchInput = this.container.querySelector('#kb-search-input');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.trim();
            this.filterAndRender();
        });

        // Refresh
        this.container.querySelector('#kb-btn-refresh').addEventListener('click', () => this.loadEntries());

        // Export JSON
        this.container.querySelector('#kb-btn-export').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(this.entries || [], null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `earnest-bcpe-export-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        // Pill filters kind
        this.container.querySelectorAll('.kb-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.kb-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilterKind = btn.getAttribute('data-kind');
                this.filterAndRender();
            });
        });

        // Pill filters status
        this.container.querySelectorAll('.kb-pill-status').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.kb-pill-status').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilterStatus = btn.getAttribute('data-status');
                this.filterAndRender();
            });
        });

        // Modal
        const btnNew = this.container.querySelector('#kb-btn-new-rule');
        const modal = this.container.querySelector('#kb-modal-new');
        const btnClose = this.container.querySelector('#kb-modal-close');
        const btnCancel = this.container.querySelector('#kb-modal-cancel');
        const btnSubmit = this.container.querySelector('#kb-modal-submit');

        btnNew.addEventListener('click', () => modal.style.display = 'flex');
        const closeModal = () => modal.style.display = 'none';
        btnClose.addEventListener('click', closeModal);
        btnCancel.addEventListener('click', closeModal);

        btnSubmit.addEventListener('click', async () => {
            const kind = this.container.querySelector('#kb-new-kind').value;
            const product_id = this.container.querySelector('#kb-new-product').value.trim() || 'earnest';
            const title = this.container.querySelector('#kb-new-title').value.trim();
            const symptom = this.container.querySelector('#kb-new-symptom').value.trim();
            const correction = this.container.querySelector('#kb-new-correction').value.trim();
            const example = this.container.querySelector('#kb-new-example').value.trim();

            if (!title || !correction) {
                alert("Le titre et la solution sont obligatoires !");
                return;
            }

            // Déduplication : vérifier si un titre similaire existe déjà
            const normTitle = title.toLowerCase();
            const duplicate = this.entries.find(e => e.title && e.title.toLowerCase() === normTitle);
            if (duplicate && !confirm(`Une fiche intitulée "${duplicate.title}" existe déjà. Créer quand même ?`)) {
                return;
            }

            btnSubmit.disabled = true;
            btnSubmit.textContent = "Enregistrement...";

            try {
                const res = await fetch('/api/ide/kb/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_id, kind, title, symptom, correction, example, author: 'human_expert' })
                });
                const data = await res.json();
                if (data.status === 'CREATED') {
                    closeModal();
                    this.container.querySelector('#kb-new-title').value = '';
                    this.container.querySelector('#kb-new-symptom').value = '';
                    this.container.querySelector('#kb-new-correction').value = '';
                    this.container.querySelector('#kb-new-example').value = '';
                    await this.loadEntries();
                    this.selectedEntryId = data.entry_id;
                    this.filterAndRender();
                } else {
                    alert("Erreur: " + (data.error || "Échec"));
                }
            } catch (err) {
                alert("Erreur réseau: " + err.message);
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.textContent = "Enregistrer & Sceller";
            }
        });
    }

    async loadEntries() {
        try {
            const res = await fetch('/api/ide/kb/entries');
            const data = await res.json();
            this.entries = data.entries || [];
            const badge = this.container.querySelector('#kb-count-badge');
            if (badge) badge.textContent = `${this.entries.length} vérités`;
            
            if (this.entries.length > 0 && !this.selectedEntryId) {
                this.selectedEntryId = this.entries[0].entry_id;
            }

            this.filterAndRender();
        } catch (err) {
            const stream = this.container.querySelector('#kb-cards-stream');
            stream.innerHTML = `<div style="color: var(--accent-rose); font-size: 0.8rem; padding: 2rem; text-align: center;">Impossible de joindre la base d'expérience: ${err.message}</div>`;
        }
    }

    filterAndRender() {
        const stream = this.container.querySelector('#kb-cards-stream');
        let filtered = this.entries;

        if (this.currentFilterKind) {
            filtered = filtered.filter(e => e.kind === this.currentFilterKind);
        }
        if (this.currentFilterStatus) {
            filtered = filtered.filter(e => e.status === this.currentFilterStatus);
        }
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(e => 
                (e.title && e.title.toLowerCase().includes(q)) ||
                (e.symptom && e.symptom.toLowerCase().includes(q)) ||
                (e.cause && e.cause.toLowerCase().includes(q)) ||
                (e.correction && e.correction.toLowerCase().includes(q))
            );
        }

        if (filtered.length === 0) {
            stream.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 3rem;">Aucune règle ou piège trouvé pour cette recherche.</div>`;
            this.renderDetail(null);
            return;
        }

        stream.innerHTML = filtered.map(item => this.renderListItem(item)).join('');

        // Clic sur une carte pour afficher le détail à droite
        stream.querySelectorAll('.kb-card-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = parseInt(el.getAttribute('data-id'), 10);
                this.selectedEntryId = id;
                stream.querySelectorAll('.kb-card-item').forEach(c => c.classList.remove('selected'));
                el.classList.add('selected');
                const found = this.entries.find(e => e.entry_id === id);
                this.renderDetail(found);
            });
        });

        // Sélectionner par défaut l'entrée active
        const selected = this.entries.find(e => e.entry_id === this.selectedEntryId) || filtered[0];
        if (selected) {
            this.selectedEntryId = selected.entry_id;
            const targetEl = stream.querySelector(`[data-id="${selected.entry_id}"]`);
            if (targetEl) targetEl.classList.add('selected');
            this.renderDetail(selected);
        }
    }

    renderListItem(item) {
        const kindBadge = {
            'piege': '<span style="background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.4); padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; font-family: var(--font-mono);">⚠️ PIÈGE</span>',
            'regle': '<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; font-family: var(--font-mono);">📐 RÈGLE</span>',
            'catalogue': '<span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; font-family: var(--font-mono);">📦 CATALOGUE</span>'
        }[item.kind] || `<span>${item.kind}</span>`;

        const statusIcon = item.status === 'valide'
            ? '<span style="color: #34d399; font-size: 0.7rem;">✓ Scellé</span>'
            : '<span style="color: #facc15; font-size: 0.7rem;">⏳ Découvert</span>';

        return `
            <div class="kb-card-item ${item.entry_id === this.selectedEntryId ? 'selected' : ''}" data-id="${item.entry_id}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    ${kindBadge}
                    <div style="font-family: var(--font-mono); font-size: 0.68rem;">${statusIcon}</div>
                </div>
                <div style="font-weight: 700; font-size: 0.82rem; color: #fff; line-height: 1.35; margin-top: 2px;">
                    ${item.title}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 4px;">
                    <span>#${item.entry_id} • ${item.product_id}</span>
                    <span>Succès: <strong style="color: #34d399;">${item.use_count}x</strong></span>
                </div>
            </div>
        `;
    }

    renderDetail(item) {
        const detailPane = this.container.querySelector('#kb-detail-pane');
        if (!item) {
            detailPane.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 4rem;">
                    Aucune entrée sélectionnée.
                </div>
            `;
            return;
        }

        const isValide = item.status === 'valide';
        const kindBadge = {
            'piege': '<span style="background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.4); padding: 3px 10px; border-radius: 4px; font-size: 0.75rem; font-family: var(--font-mono); font-weight: 700;">⚠️ PIÈGE D\'INGÉNIERIE</span>',
            'regle': '<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 3px 10px; border-radius: 4px; font-size: 0.75rem; font-family: var(--font-mono); font-weight: 700;">📐 RÈGLE D\'OR IMPOSÉE</span>',
            'catalogue': '<span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 3px 10px; border-radius: 4px; font-size: 0.75rem; font-family: var(--font-mono); font-weight: 700;">📦 CATALOGUE TECHNIQUE</span>'
        }[item.kind] || `<span>${item.kind}</span>`;

        detailPane.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem;">
                <div style="display: flex; flex-direction: column; gap: 0.4rem; max-width: 70%;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        ${kindBadge}
                        <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">ID #${item.entry_id} • Clé: <code>${item.subject_key}</code></span>
                    </div>
                    <div style="font-size: 1.2rem; font-weight: 800; color: #fff; line-height: 1.3;">
                        ${item.title}
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.4rem;">
                    ${isValide ? `
                        <div style="display: flex; align-items: center; gap: 5px; color: #34d399; font-size: 0.78rem; font-family: var(--font-mono); background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 10px; border-radius: 6px;">
                            <span>✓</span> Validé par <strong>${item.validated_by || 'humain'}</strong>
                        </div>
                        <button id="kb-btn-revisit" class="icon-btn" style="border: 1px solid var(--border-subtle); padding: 4px 10px; font-size: 0.72rem; border-radius: 4px; color: var(--accent-amber);">
                            ⚠️ Déclasser / Marquer à réviser
                        </button>
                    ` : `
                        <div style="color: #facc15; font-size: 0.78rem; font-family: var(--font-mono); background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.3); padding: 4px 10px; border-radius: 6px;">
                            ⏳ Découvert par l'agent (Non encore scellé)
                        </div>
                        <button id="kb-btn-validate-seal" class="btn-primary" style="padding: 6px 14px; font-size: 0.78rem; font-weight: 700; background: #10b981; border-color: #059669;">
                            ✓ Valider et Sceller cette Vérité
                        </button>
                    `}
                </div>
            </div>

            <!-- Stats & Audit -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle); font-family: var(--font-mono); font-size: 0.72rem;">
                <div><span style="color: var(--text-muted);">Composant:</span> <strong style="color: var(--accent-cyan);">${item.product_id}</strong></div>
                <div><span style="color: var(--text-muted);">Réutilisations:</span> <strong style="color: #34d399;">${item.use_count} fois</strong></div>
                <div><span style="color: var(--text-muted);">Échecs évités:</span> <strong style="color: #fb7185;">${item.fail_count}</strong></div>
                <div><span style="color: var(--text-muted);">Origine:</span> <strong>${item.source}</strong></div>
            </div>

            <!-- Section 1 : Symptôme & Cause -->
            ${item.symptom ? `
                <div style="background: rgba(244, 63, 94, 0.08); border: 1px solid rgba(244, 63, 94, 0.3); border-left: 4px solid #fb7185; border-radius: 6px; padding: 1rem; display: flex; flex-direction: column; gap: 0.4rem;">
                    <div style="font-weight: 800; font-family: var(--font-mono); color: #fb7185; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;">
                        <span>💥</span> SYMPTÔME & PROBLÈME CONSTATÉ
                    </div>
                    <div style="color: #fecdd3; font-size: 0.85rem; line-height: 1.5;">${item.symptom}</div>
                    ${item.cause ? `<div style="font-size: 0.78rem; color: #fda4af; margin-top: 4px;"><strong>Cause racine :</strong> ${item.cause}</div>` : ''}
                </div>
            ` : ''}

            <!-- Section 2 : Solution Obligatoire -->
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-left: 4px solid #34d399; border-radius: 6px; padding: 1rem; display: flex; flex-direction: column; gap: 0.4rem;">
                <div style="font-weight: 800; font-family: var(--font-mono); color: #34d399; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;">
                    <span>🛡️</span> SOLUTION APPLIQUÉE & IMPOSÉE
                </div>
                <div style="color: #d1fae5; font-size: 0.88rem; line-height: 1.5; font-weight: 500;">
                    ${item.correction}
                </div>
            </div>

            <!-- Section 3 : Exemple de Code -->
            ${item.example ? `
                <div style="background: #020617; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent-cyan); font-weight: 700; display: flex; justify-content: space-between; align-items: center;">
                        <span>💻 EXTRAIT DE CODE / PATTERN DE RÉFÉRENCE</span>
                        <button id="kb-btn-copy-code" class="icon-btn" style="font-size: 0.7rem; border: 1px solid var(--border-subtle); padding: 2px 8px; border-radius: 4px;">Copier</button>
                    </div>
                    <pre style="margin: 0; font-family: var(--font-mono); font-size: 0.8rem; color: #38bdf8; overflow-x: auto; white-space: pre-wrap; line-height: 1.45;">${item.example}</pre>
                </div>
            ` : ''}
        `;

        // Événements du panneau de détail
        const btnValidate = detailPane.querySelector('#kb-btn-validate-seal');
        if (btnValidate) {
            btnValidate.addEventListener('click', async () => {
                btnValidate.disabled = true;
                btnValidate.textContent = "Scellement en cours...";
                await this.annotateEntry(item.entry_id, 'valide');
            });
        }

        const btnRevisit = detailPane.querySelector('#kb-btn-revisit');
        if (btnRevisit) {
            btnRevisit.addEventListener('click', async () => {
                await this.annotateEntry(item.entry_id, 'a_revoir');
            });
        }

        const btnCopy = detailPane.querySelector('#kb-btn-copy-code');
        if (btnCopy && item.example) {
            btnCopy.addEventListener('click', () => {
                navigator.clipboard.writeText(item.example);
                btnCopy.textContent = "Copié ! ✓";
                setTimeout(() => { btnCopy.textContent = "Copier"; }, 2000);
            });
        }
    }

    async annotateEntry(id, newStatus) {
        try {
            const res = await fetch('/api/ide/kb/annotate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entry_id: id, status: newStatus, annotator: 'human_expert' })
            });
            const data = await res.json();
            if (data.status === 'OK') {
                await this.loadEntries();
            } else {
                alert("Erreur lors de l'annotation: " + (data.error || "Inconnu"));
            }
        } catch (err) {
            alert("Erreur réseau: " + err.message);
        }
    }
}
