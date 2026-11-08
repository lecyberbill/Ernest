# Kit Atelier Pratique – 2h (Débutants)

## Scénario fil rouge
> **Créer un Assistant de Support Client avec un LLM**
> Les stagiaires passent de la question client → génération de réponse → post‑traitement → validation.

---

## 1. Matériel nécessaire

| Élément | Détail |
|---|---|
| **Machine** | PC Windows 11 (64bit), 16 Go RAM, Internet ou LM Studio local |
| **Outils** | LM Studio (local) ou Ollama + Web UI ; navigateur pour API test |
| **Compte** | Un compte Ollama gratuit (ou LM Studio) ; accès au serveur local `http://192.168.1.165:11434` |
| **Support** | Ce kit (PDF), fiche de prompt, grille d'auto‑évaluation |
| **Animateur** | 1 pour 8-12 stagiaires ; vidéoprojecteur ; exemple préparé |

---

## 2. Guide pas‑à‑pas pour l'animateur (2h)

### Minute 0–10 : Introduction
- Présentation du scénario : « Vous êtes le support client d'une e‑commerce. Votre mission : créer un assistant IA qui répond aux questions clients. »
- Rappel des 4 modules vus (vocabulaire, prompting, workflow, éthique).

### Minute 10–30 : Setup & Premiers prompts
1. Ouvrir LM Studio (ou l'URL du serveur Ollama).
2. Choisir le modèle (ex : `qwen3.8:27b` local).
3. **Défi 1** : Écrire un premier prompt de support client.
   - Prompt suggéré : `Tu es un assistant de support client. Le client a reçu un produit endommagé. Réponds de manière polie en 3 phrases.`
   - Chaque stagiaire valide la réponse.

### Minute 30–60 : Structuration du prompt (Défi 2)
4. Ajouter un rôle, un contexte, une tâche et un format.
   - Prompt amélioré : `Tu es un assistant RH d'une e‑commerce française. Le client a reçu un produit endommagé lors de la livraison. Rédige une réponse de réclamation en 4 phrases, ton empathique, en proposant un retour produit ou un remboursement.`
   - Comparer les réponses avant/après.

### Minute 60–90 : Workflow & Post‑traitement (Défi 3)
5. Créer une chaîne : Question client → LLM → Post‑traitement → Validation.
   - **Post‑traitement** : ajouter une formule de clôture, vérifier la conformité (pas de données personnelles).
   - **Validation** : l'animateur joue le rôle du « manager » qui approuve ou refuse la réponse.
   - **Défi 3** : Traiter 3 questions clients différentes en groupe, avec un vote sur la meilleure réponse.

### Minute 90–110 : Éthique & Limites
6. Identifier les limites de la réponse (hallucination, ton, données).
7. Discuter : « Que feriez‑vous si l'IA répondait de façon inappropriée ? »

### Minute 110–120 : Bilan & Auto‑évaluation
8. Remplir la grille d'auto‑évaluation (voir §4).
9. Récapitulatif et prochaines étapes.

---

## 3. Consignes pour les stagiaires
- **Objectif** : produire 3 réponses de support client de qualité croissante.
- **Obligations** :
  - Utiliser la structure Rôle + Contexte + Tâche + Format.
  - Ne jamais entrer de vraies données clients.
  - Valider chaque réponse avant de passer à la suivante.
- **Conseils** :
  - Itérer : améliorer le prompt, pas le modèle.
  - Noter ce qui marche / ce qui ne marche pas.

---

## 4. 3 Défis incrémentaux

| N° | Défi | Durée | Critère de réussite |
|---|---|---|---|
| 1 | Premier prompt de support client | 10 min | Réponse polie, 3 phrases |
| 2 | Prompt structuré (Rôle/Contexte/Tâche/Format) | 20 min | Réponse complète, ton adapté |
| 3 | Workflow complet avec post‑traitement | 30 min | 3 questions traitées, 1 validation réussie |

---

## 5. Grille d'auto‑évaluation (5 items)

| Compétence | Non | En cours | Oui |
|---|---|---|---|
| 1. Je sais structurer un prompt (Rôle/Contexte/Tâche/Format) | | | |
| 2. Je peux générer une réponse de support client | | | |
| 3. Je sais identifier une hallucination | | | |
| 4. Je sais post‑traiter la réponse (formule, conformité) | | | |
| 5. Je sais reconnaître une limite éthique | | | |

**Score final** : 5/5 = Excellent, 4/5 = Très bon, 3/5 = Correct, <3/5 = À renforcer.
