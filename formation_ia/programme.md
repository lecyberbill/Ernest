# Programme – Formation IA pour Débutants

Durée totale : 4 modules × 45-60 min ≈ 3h-4h (1 jour)

---

## MODULE 1 — Vocabulaire IA & Fonctionnement d'un LLM
**Durée : 45 min**

### Contenu
- Qu'est‑ce qu'un modèle IA (LLM, diffusion) ?
- Différence entre **Prompt**, **Réponse**, **Token**, **Inference**, **Hallucination**.
- Comment fonctionne un modèle local (LM Studio) vs un modèle en ligne (Cloud).
- Les 3 couches : Données → Modèle → Interface (API/UI).

### Exemples concrets (débutants)
1. **Analogie du restaurant** : le Prompt = votre commande, le Modèle = le cuisinier, la Réponse = le plat servi.
2. **Hallucination** : demander à l'IA « Quelle est la capitale de l'Afghanistan ? » → elle peut répondre « Kaboul » (correct) ou inventer « Mazar‑i‑Sharif » (hallucination).
3. **Token** : « Bonjour » = 1-2 tokens, « Bonjour mon ami, comment vas‑tu aujourd'hui ? » ≈ 8-10 tokens.

### Évaluation courte (5 min)
- QCM 3 questions :
  1. Quel est le rôle du Prompt ? (A) Générer le modèle (B) Formuler la requête (C) Supprimer les erreurs → **B**
  2. Une hallucination est : (A) Un bug (B) Une invention fausse du modèle (C) Un virus → **B**
  3. Un token est : (A) Un utilisateur (B) Une unité de texte (C) Un fichier → **B**

---

## MODULE 2 — Outils Génératifs & Prompting
**Durée : 60 min**

### Contenu
- Types d'outils : LLM texte (LM Studio, Ollama), images (Stable Diffusion/FLUX), audio.
- **Structure d'un Prompt** : Rôle + Contexte + Tâche + Format.
  - Ex : « Tu es un assistant de support client (Rôle). Le client a reçu un produit endommagé (Contexte). Rédige une réponse de réclamation (Tâche) en 3 phrases (Format). »
- **Prompting avancé (débutant)** : few‑shot, chain‑of‑thought, variables.
- **Évaluation de la sortie** : comment vérifier la qualité ?

### Exemples concrets
1. **Prompt de traduction** : « Traduis ce message du français en espagnol en conservant le ton poli : [texte] ».
2. **Prompt marketing** : « Rédige 3 accroches publicitaires pour un café bio local, ton chaleureux, max 10 mots chacune. »
3. **Génération d'image** : « Portrait photographique, lumière naturelle, fond flou, style photo » (pour Stable Diffusion).

### Évaluation courte (5 min)
- Exercice pratique : transformer un prompt vague en prompt structuré.
  - Avant : « Écris un mail. »
  - Après : « Tu es un assistant RH. Le salarié demande un congé exceptionnel. Rédige une réponse professionnelle en 4 lignes, ton bienveillant. »
- QCM 2 questions sur les composants du Prompt.

---

## MODULE 3 — Cas d'Usage Métier & Workflow Simple
**Durée : 60 min**

### Contenu
- 3 cas d'usage type :
  1. **Support client** – LLM génère des réponses à des questions fréquentes.
  2. **Création de contenu** – Rédaction d'articles, posts réseaux sociaux.
  3. **Traduction / localisation** – Multilingue rapide.
- **Workflow** (pipeline) :
  ```
  [Donnée] → [LLM: génération] → [Post‑traitement] → [Validation humaine] → [Publication]
  ```
- Limites métier : biais, confidentialité, coût, dépendance à la qualité des données.
- **Outils** : LM Studio, Ollama, API OpenAI, Stable Diffusion.

### Exemples concrets
1. **Support client** : Client → « Où est ma commande ? » → LLM → « Votre commande n°123 est en cours de livraison, estimée demain avant 18h. » → Validation agent → Envoi.
2. **Contenu** : Brief marketing → LLM → 3 propositions de posts LinkedIn → Édition humaine → Publication.
3. **Traduction** : Document FR → LLM → Document ES → Relecture bilingue → Livraison.

### Évaluation courte (5 min)
- Tableau à compléter :
  | Cas d'usage | Outil | Entrée | Sortie |
  |---|---|---|---|
  | Support client | LLM | Question client | Réponse |
  | Contenu | LLM | Brief | Texte rédigé |
  | Traduction | LLM | Text FR | Text ES |
- Question ouverte : « Citez une limite métier du LLM. »

---

## MODULE 4 — Éthique, Limites & Tendances
**Durée : 45 min**

### Contenu
- **Éthique** :
  - Biais dans les données d'entraînement (genres, ethnies, stéréotypes).
  - Confidentialité : ne pas envoyer de données sensibles à un LLM public.
  - Transparence : informer l'utilisateur que c'est un bot.
- **Limites techniques** :
  - Hallucinations, context window, température.
  - Dépendance au réseau / coût d'inférence.
- **Tendances 2025-2026** :
  - Multi‑modalité (texte + image + audio).
  - Modèles locaux (Rust/Candle, ROCm).
  - Agents autonomes (tool‑calling, mémoire).
  - On‑device AI (téléphones, laptops).

### Exemples concrets
1. **Biais** : Prompt « Décris un chirurgien » → l'IA peut générer « un homme blanc » (biais).
2. **Confidentialité** : Ne jamais entrer des données clients réelles dans un LLM public sans anonymisation.
3. **Multi‑modalité** : ChatGPT + DALL·E = texte → image en une requête.

### Évaluation courte (5 min)
- Vrai/Faux 4 questions :
  1. Un LLM peut inventer des faits → **Vrai**
  2. Il faut toujours vérifier les sorties de l'IA → **Vrai**
  3. Les LLM sont parfaits pour des données médicales critiques → **Faux**
  4. Les modèles locaux n'envoient pas les données en ligne → **Vrai**

---

## Synthèse & Certification (15 min)
- Récapitulatif des 4 modules.
- Quiz final (10 questions, seuil 7/10).
- Délivrance d'un badge de fin de formation.
- Prochaines étapes : atelier pratique, projet concret, suivi à 30 jours.
