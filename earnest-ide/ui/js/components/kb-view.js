export class KbView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.entries = [];
        this.currentFilterKind = '';
        this.currentFilterStatus = '';
        this.searchQuery = '';
        this.init();
    }

    init() {
        this.renderLayout();
        this.bindEvents();
        this.loadEntries();
    }

    renderLayout() {
        this.container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; font-family: var(--font-sans); color: var(--text-primary); background: var(--surface-low); overflow: hidden;">
                <!-- Header & Stats -->
                <div style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-subtle); background: var(--surface-dim);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.1rem;">🧠</span>
                            <span style="font-weight: 800; font-family: var(--font-mono); font-size: 0.85rem; letter-spacing: 0.5px;">BASE D'EXPÉRIENCE</span>
                            <span id="kb-count-badge" style="background: rgba(99, 102, 241, 0.2); color: var(--accent-cyan); font-family: var(--font-mono); font-size: 0.7rem; padding: 1px 6px; border-radius: 10px; border: 1px solid rgba(99, 102, 241, 0.3);">0</span>
                        </div>
                        <button id="kb-btn-new-rule" class="btn-primary" style="padding: 3px 8px; font-size: 0.72rem; display: flex; align-items: center; gap: 0.3rem;">
                            <span>➕</span> Règle d'or
                        </button>
                    </div>

                    <!-- Search Input -->
                    <div style="position: relative; margin-bottom: 0.5rem;">
                        <input type="text" id="kb-search-input" placeholder="Rechercher (ex: sqlite, port, mime, windows)..." 
                               style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 6px 8px 6px 26px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.75rem;" />
                        <span style="position: absolute; left: 8px; top: 6px; color: var(--text-muted); font-size: 0.75rem;">🔍</span>
                    </div>

                    <!-- Filter Pills -->
                    <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; font-size: 0.68rem; font-family: var(--font-mono);">
                        <button class="kb-pill active" data-kind="">Tous</button>
                        <button class="kb-pill" data-kind="piege">⚠️ Pièges</button>
                        <button class="kb-pill" data-kind="regle">📐 Règles</button>
                        <button class="kb-pill" data-kind="catalogue">📦 Catalogues</button>
                        <span style="color: var(--border-subtle);">|</span>
                        <button class="kb-pill-status" data-status="">Tous statuts</button>
                        <button class="kb-pill-status" data-status="valide">🟢 Validés</button>
                        <button class="kb-pill-status" data-status="non_teste">🟡 Découverts</button>
                    </div>
                </div>

                <!-- Cards Stream -->
                <div id="kb-cards-stream" style="flex: 1; overflow-y: auto; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.75rem;">
                    <div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 2rem;">Chargement des connaissances...</div>
                </div>

                <!-- Modal Nouvelle Règle -->
                <div id="kb-modal-new" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9999; align-items: center; justify-content: center; backdrop-filter: blur(2px);">
                    <div style="background: #0f172a; border: 1px solid var(--accent-cyan); width: 450px; max-width: 90vw; border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; font-family: var(--font-mono); box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
                            <span style="font-weight: 700; color: var(--accent-cyan); font-size: 0.85rem;">➕ INJECTER UNE RÈGLE / PIÈGE D'OR</span>
                            <button id="kb-modal-close" style="background: transparent; border: none; color: #fff; cursor: pointer; font-size: 1rem;">✕</button>
                        </div>

                        <div>
                            <label style="display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 3px;">Type de connaissance</label>
                            <select id="kb-new-kind" style="width: 100%; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 5px; border-radius: 4px; font-size: 0.75rem;">
                                <option value="regle">📐 Règle d'or (Comportement obligatoire)</option>
                                <option value="piege">⚠️ Piège d'ingénierie (Erreur à proscrire)</option>
                                <option value="catalogue">📦 Catalogue technique / API</option>
                            </select>
                        </div>

                        <div>
                            <label style="display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 3px;">Titre clair & concis</label>
                            <input type="text" id="kb-new-title" placeholder="ex: Fermeture obligatoire des curseurs SQLite" style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 5px; border-radius: 4px; font-size: 0.75rem;" />
                        </div>

                        <div>
                            <label style="display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 3px;">Symptôme / Problème (optionnel)</label>
                            <textarea id="kb-new-symptom" rows="2" placeholder="ex: Erreur database is locked sous Windows en multi-thread" style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 5px; border-radius: 4px; font-size: 0.75rem; resize: vertical;"></textarea>
                        </div>

                        <div>
                            <label style="display: block; font-size: 0.7rem; color: var(--accent-emerald); margin-bottom: 3px;">Solution / Correction imposée *</label>
                            <textarea id="kb-new-correction" rows="3" placeholder="ex: Toujours activer PRAGMA busy_timeout = 5000 et WAL mode" style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 5px; border-radius: 4px; font-size: 0.75rem; resize: vertical;"></textarea>
                        </div>

                        <div>
                            <label style="display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 3px;">Exemple de code / Snippet (optionnel)</label>
                            <textarea id="kb-new-example" rows="2" placeholder="ex: conn.execute('PRAGMA journal_mode=WAL')" style="width: 100%; box-sizing: border-box; background: #0b0f19; border: 1px solid var(--border-subtle); color: #fff; padding: 5px; border-radius: 4px; font-size: 0.75rem; resize: vertical;"></textarea>
                        </div>

                        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
                            <button id="kb-modal-cancel" style="background: transparent; border: 1px solid var(--border-subtle); color: #fff; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">Annuler</button>
                            <button id="kb-modal-submit" class="btn-primary" style="padding: 5px 12px; font-size: 0.75rem;">Enregistrer & Sceller</button>
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
                    background: #0f172a;
                    border: 1px solid var(--border-subtle);
                    color: var(--text-muted);
                    padding: 2px 7px;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .kb-pill:hover, .kb-pill-status:hover {
                    color: #fff;
                    border-color: var(--accent-cyan);
                }
                .kb-pill.active, .kb-pill-status.active {
                    background: rgba(99, 102, 241, 0.2);
                    border-color: var(--accent-cyan);
                    color: var(--accent-cyan);
                    font-weight: 700;
                }
                .kb-card {
                    background: rgba(15, 23, 42, 0.75);
                    border: 1px solid var(--border-subtle);
                    border-radius: 6px;
                    padding: 0.75rem;
                    transition: all 0.15s ease;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .kb-card:hover {
                    border-color: rgba(99, 102, 241, 0.5);
                    background: rgba(15, 23, 42, 0.95);
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
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
            const title = this.container.querySelector('#kb-new-title').value.trim();
            const symptom = this.container.querySelector('#kb-new-symptom').value.trim();
            const correction = this.container.querySelector('#kb-new-correction').value.trim();
            const example = this.container.querySelector('#kb-new-example').value.trim();

            if (!title || !correction) {
                alert("Le titre et la solution sont obligatoires !");
                return;
            }

            btnSubmit.disabled = true;
            btnSubmit.textContent = "Enregistrement...";

            try {
                const res = await fetch('/api/ide/kb/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind, title, symptom, correction, example, author: 'human_expert' })
                });
                const data = await res.json();
                if (data.status === 'CREATED') {
                    closeModal();
                    // Reset fields
                    this.container.querySelector('#kb-new-title').value = '';
                    this.container.querySelector('#kb-new-symptom').value = '';
                    this.container.querySelector('#kb-new-correction').value = '';
                    this.container.querySelector('#kb-new-example').value = '';
                    await this.loadEntries();
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
            if (badge) badge.textContent = this.entries.length;
            this.filterAndRender();
        } catch (err) {
            const stream = this.container.querySelector('#kb-cards-stream');
            stream.innerHTML = `<div style="color: var(--accent-rose); font-size: 0.75rem; padding: 1rem; text-align: center;">Impossible de joindre la base d'expérience: ${err.message}</div>`;
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
            stream.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 2rem;">Aucune règle ou piège trouvé pour cette recherche.</div>`;
            return;
        }

        stream.innerHTML = filtered.map(item => this.renderCard(item)).join('');

        // Attacher les actions de cartes
        stream.querySelectorAll('.kb-btn-validate').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.getAttribute('data-id'), 10);
                await this.annotateEntry(id, 'valide');
            });
        });

        stream.querySelectorAll('.kb-btn-revisit').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.getAttribute('data-id'), 10);
                await this.annotateEntry(id, 'a_revoir');
            });
        });
    }

    renderCard(item) {
        const kindBadge = {
            'piege': '<span style="background: rgba(244, 63, 94, 0.15); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.3); padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; font-family: var(--font-mono);">⚠️ PIÈGE</span>',
            'regle': '<span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; font-family: var(--font-mono);">📐 RÈGLE D\'OR</span>',
            'catalogue': '<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; font-family: var(--font-mono);">📦 CATALOGUE</span>'
        }[item.kind] || `<span style="font-size: 0.65rem;">${item.kind}</span>`;

        const isValide = item.status === 'valide';
        const statusBadge = isValide
            ? `<span style="color: #34d399; font-size: 0.65rem; font-family: var(--font-mono); display: flex; align-items: center; gap: 3px;">✓ Validé par ${item.validated_by || 'humain'}</span>`
            : `<span style="color: #facc15; font-size: 0.65rem; font-family: var(--font-mono); display: flex; align-items: center; gap: 3px;">⏳ Non validé (${item.source || 'agent'})</span>`;

        return `
            <div class="kb-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                    <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            ${kindBadge}
                            <span style="font-weight: 700; font-size: 0.8rem; color: #fff;">${item.title}</span>
                        </div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-mono);">
                            ID #${item.entry_id} • Produit: <strong style="color: var(--accent-cyan);">${item.product_id}</strong>
                        </div>
                    </div>
                    <div>${statusBadge}</div>
                </div>

                ${item.symptom ? `
                    <div style="background: rgba(0,0,0,0.25); border-left: 2px solid #fb7185; padding: 4px 8px; border-radius: 0 4px 4px 0; font-size: 0.72rem; color: #fca5a5;">
                        <strong>Symptôme :</strong> ${item.symptom}
                    </div>
                ` : ''}

                <div style="background: rgba(0,0,0,0.35); border-left: 2px solid #34d399; padding: 6px 8px; border-radius: 0 4px 4px 0; font-size: 0.74rem; color: #d1fae5; line-height: 1.4;">
                    <strong>Solution appliquée :</strong> ${item.correction}
                </div>

                ${item.example ? `
                    <div style="background: #020617; border: 1px solid var(--border-subtle); padding: 5px 8px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.68rem; color: #38bdf8; overflow-x: auto; white-space: pre-wrap;">${item.example}</div>
                ` : ''}

                <!-- Actions utilisateur -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.25rem; pt-1; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.68rem;">
                    <div style="color: var(--text-muted); font-family: var(--font-mono); font-size: 0.65rem;">
                        Utilisé : <strong style="color: #fff;">${item.use_count}x</strong> | Échecs : <strong style="color: #fb7185;">${item.fail_count}</strong>
                    </div>

                    <div style="display: flex; gap: 0.35rem;">
                        ${!isValide ? `
                            <button class="kb-btn-validate btn-primary" data-id="${item.entry_id}" style="padding: 2px 8px; font-size: 0.65rem; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; cursor: pointer; border-radius: 4px;">
                                ✓ Sceller comme Validé
                            </button>
                        ` : `
                            <button class="kb-btn-revisit" data-id="${item.entry_id}" style="background: transparent; border: 1px solid var(--border-subtle); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 0.65rem;">
                                ⚠️ Marquer à réviser
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
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

