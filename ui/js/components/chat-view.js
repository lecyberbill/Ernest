import { store } from '../store.js';
import { renderMarkdown } from '../markdown.js';

export class ChatView extends HTMLElement {
    constructor() {
        super();
        this.messages = [];
        this.sessionId = null;
        this.isListening = false;
        this.recognition = null;
    }

    connectedCallback() {
        this.innerHTML = `
            <div class="card" style="height: calc(100vh - 120px); display: flex; flex-direction: column; margin-bottom: 0; padding: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.85rem; margin-bottom: 1rem;">
                    <div>
                        <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            Salon de Discussion Directe
                        </h2>
                        <p class="card-desc" style="margin-bottom: 0;">Discussion continue persistée avec support vocal & transfert de mission en 1-clic.</p>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <select id="chat-session-select" style="background: rgba(15, 23, 42, 0.8); border: 1px solid var(--border-subtle); color: var(--text-primary); border-radius: var(--radius-sm); padding: 0.35rem 0.6rem; font-size: 0.78rem; font-family: var(--font-mono); max-width: 200px;">
                            <option value="">Nouvelle Session</option>
                        </select>
                        <button id="btn-clear-chat" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); color: var(--text-muted); padding: 0.4rem 0.85rem; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.8rem;">
                            Nouveau Fil
                        </button>
                    </div>
                </div>

                <!-- Zone d'affichage des messages -->
                <div id="chat-stream" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.85rem; padding-right: 0.5rem;">
                    <div class="chat-bubble assistant">
                        Bonjour ! Je suis Earnest. Tu peux me poser des questions, me demander de réfléchir à un sujet ou discuter de ton projet librement ici.
                    </div>
                </div>

                <!-- Input d'envoi avec Micro et Action -->
                <div style="display: flex; gap: 0.65rem; margin-top: 1rem; padding-top: 0.85rem; border-top: 1px solid var(--border-subtle); align-items: center;">
                    <input type="text" id="chat-input" placeholder="Écrivez ou dictez votre message (Entrée pour envoyer)..." style="flex: 1;" />
                    
                    <button id="btn-chat-mic" class="btn-attach" style="cursor: pointer;" title="Dictée Vocale (Web Speech API)">
                        <span id="mic-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        </span>
                    </button>

                    <button class="btn-primary" id="btn-send-chat" style="display: inline-flex; align-items: center; gap: 0.35rem;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        Envoyer
                    </button>
                </div>
            </div>
        `;

        this.initVoiceRecognition();
        this.loadSessions();

        this.querySelector('#btn-send-chat').addEventListener('click', () => this.sendMessage());
        this.querySelector('#chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        this.querySelector('#btn-clear-chat').addEventListener('click', () => this.startNewSession());
        this.querySelector('#chat-session-select').addEventListener('change', (e) => this.switchSession(e.target.value));
        this.querySelector('#btn-chat-mic').addEventListener('click', () => this.toggleVoiceDictation());
    }

    initVoiceRecognition() {
        this.mediaRecorder = null;
        this.audioChunks = [];
    }

    async toggleVoiceDictation() {
        const btn = this.querySelector('#btn-chat-mic');
        const icon = this.querySelector('#mic-icon');
        const input = this.querySelector('#chat-input');

        if (!this.isListening) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.audioChunks = [];
                this.mediaRecorder = new MediaRecorder(stream);
                this.mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) this.audioChunks.push(e.data);
                };
                this.mediaRecorder.onstop = async () => {
                    stream.getTracks().forEach(t => t.stop());
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;
                    btn.style.borderColor = 'var(--accent-amber)';

                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        try {
                            const res = await fetch('/api/transcribe', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ audio_base64: reader.result })
                            });
                            const data = await res.json();
                            if (data.status === 'ok' && data.text) {
                                input.value = (input.value ? input.value + ' ' : '') + data.text;
                            } else if (data.error) {
                                alert(`Erreur Whisper: ${data.error}`);
                            }
                        } catch (err) {
                            alert(`Erreur réseau transcription: ${err.message}`);
                        } finally {
                            icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
                            btn.style.borderColor = 'var(--border-subtle)';
                        }
                    };
                    reader.readAsDataURL(audioBlob);
                };

                this.mediaRecorder.start();
                this.isListening = true;
                btn.style.borderColor = 'var(--accent-rose)';
                icon.innerHTML = `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:var(--accent-rose); animation: pulse 1s infinite;"></span>`;
            } catch (err) {
                alert(`Accès microphone impossible : ${err.name} - ${err.message}`);
                this.stopListening();
            }
        } else {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
            this.isListening = false;
        }
    }

    stopListening() {
        this.isListening = false;
        const btn = this.querySelector('#btn-chat-mic');
        const icon = this.querySelector('#mic-icon');
        if (btn) btn.style.borderColor = 'var(--border-subtle)';
        if (icon) icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
    }

    async loadSessions() {
        const select = this.querySelector('#chat-session-select');
        try {
            const res = await fetch('/api/chat/sessions?project_id=default_workspace');
            const sessions = await res.json();
            select.innerHTML = '<option value="">+ Nouvelle Session</option>';
            sessions.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.title.substring(0, 25)}... (${s.updated_at.split(' ')[1] || ''})`;
                select.appendChild(opt);
            });
        } catch (e) {
            console.error('Error loading sessions', e);
        }
    }

    async switchSession(sessionId) {
        if (!sessionId) {
            this.startNewSession();
            return;
        }
        this.sessionId = sessionId;
        this.messages = [];
        const stream = this.querySelector('#chat-stream');
        stream.innerHTML = '';
        try {
            const res = await fetch(`/api/chat/messages?session_id=${sessionId}`);
            const history = await res.json();
            history.forEach(m => {
                this.messages.push({ role: m.role, content: m.content });
                this.renderBubble(m.role, m.content);
            });
        } catch (e) {
            stream.innerHTML = `<div class="chat-bubble assistant error">Erreur chargement session: ${e.message}</div>`;
        }
    }

    startNewSession() {
        this.sessionId = null;
        this.messages = [];
        const stream = this.querySelector('#chat-stream');
        stream.innerHTML = `
            <div class="chat-bubble assistant">
                Nouvelle conversation démarrée. De quoi souhaites-tu parler ?
            </div>
        `;
        const select = this.querySelector('#chat-session-select');
        if (select) select.value = '';
    }

    async sendMessage() {
        const input = this.querySelector('#chat-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';

        // Message utilisateur
        this.renderBubble('user', text);
        this.messages.push({ role: 'user', content: text });

        // Placeholder temporaire assistant
        const thinkingBubble = this.appendPlaceholder('Earnest réfléchit...');

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: this.messages,
                    session_id: this.sessionId,
                    project_id: 'default_workspace'
                })
            });

            if (!res.ok) {
                const err = await res.json();
                thinkingBubble.className = 'chat-bubble assistant error';
                thinkingBubble.textContent = `Erreur: ${err.error || 'Erreur réseau'}`;
                return;
            }

            const data = await res.json();
            this.sessionId = data.session_id || this.sessionId;
            const reply = data.content || 'Pas de réponse reçue.';
            thinkingBubble.remove();
            this.renderBubble('assistant', reply);
            this.messages.push({ role: 'assistant', content: reply });
            this.loadSessions();
        } catch (e) {
            thinkingBubble.className = 'chat-bubble assistant error';
            thinkingBubble.textContent = `Erreur de connexion : ${e.message}`;
        }
    }

    appendPlaceholder(text) {
        const stream = this.querySelector('#chat-stream');
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble assistant thinking';
        bubble.textContent = text;
        stream.appendChild(bubble);
        stream.scrollTop = stream.scrollHeight;
        return bubble;
    }

    renderBubble(role, content) {
        const stream = this.querySelector('#chat-stream');
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${role}`;

        if (role === 'assistant') {
            bubble.innerHTML = `
                <div>${renderMarkdown(content)}</div>
                <div style="display: flex; gap: 0.6rem; margin-top: 0.5rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.75rem;">
                    <button class="btn-bubble-action btn-speak" title="Écouter la réponse (TTS)" style="display: inline-flex; align-items: center; gap: 0.35rem;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        Lire
                    </button>
                    <button class="btn-bubble-action btn-send-to-run" title="Transférer en mission dans la Console de Run" style="display: inline-flex; align-items: center; gap: 0.35rem;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        Envoyer au Run
                    </button>
                </div>
            `;
            bubble.querySelector('.btn-speak').addEventListener('click', () => this.speakText(content));
            bubble.querySelector('.btn-send-to-run').addEventListener('click', () => this.transferToRunConsole(content));
        } else {
            bubble.textContent = content;
        }

        stream.appendChild(bubble);
        stream.scrollTop = stream.scrollHeight;
    }

    speakText(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const cleanText = text.replace(/[*#`_\[\]]/g, '').trim();
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = 'fr-FR';
            utterance.rate = 1.05;
            window.speechSynthesis.speak(utterance);
        } else {
            alert('La synthèse vocale n\'est pas disponible sur ce navigateur.');
        }
    }

    transferToRunConsole(text) {
        const cleanPrompt = text.split('\n')[0].substring(0, 140);
        const promptInput = document.querySelector('run-console #prompt-input');
        if (promptInput) {
            promptInput.value = cleanPrompt;
        }
        // Basculer vers la vue run
        const runBtn = document.querySelector('.sidebar nav button[data-view="run"]');
        if (runBtn) runBtn.click();
    }
}
customElements.define('chat-view', ChatView);
