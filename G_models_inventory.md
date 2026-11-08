# Rapport d'inventaire — G:\models

**Date:** 2026-07-06
**Session:** run_6b196cb61ea6
**Mode:** Audit en lecture seule (aucune modification effectuée)

---

## 1. Contexte système

| Élément | Valeur |
|---------|--------|
| Volume G | 929.5 Go (99.8% utilisé, 2 Go libres) |
| Part de G:\models | ≈ 921.3 Go (99.9% du volume G) |
| Sous-dossiers dans G:\models | 29 |
| Statut volume G | 🔴 CRITIQUE (seuil 95%) |

---

## 2. Top 3 sous-dossiers par taille

```
1. checkpoints   323.81 GB   ████  (35.1%)
2. flux          301.14 GB   ███   (32.7%)
3. clip          122.17 GB   ██    (13.3%)
                   ─────────────────────
   TOTAL TOP 3    747.12 GB          (≈ 81%)
```

## 3. Détails

### 3.1 checkpoints — 323.81 GB (347 683 137 069 octets)
- **Contenu:** Modèles Stable Diffusion / SDXL (weights .safetensors)
- **Volume typique par fichier:** 6-13 Go
- **Fichier max:** realismarkPlus_realismarkPlus.safetensors — 13.35 Go
- **~51 fichiers**

### 3.2 flux — 301.14 GB (323 345 264 564 octets)
- **Contenu:** Modèles FLUX / FLUX.2 (variantes fp8)
- **Volume typique par fichier:** 15-17 Go
- **Fichier max:** flux2DevFp8Scaled_fp8Scaled.safetensors — 30.01 Go
- **~25 fichiers**, dont 8+ variantes redondantes (schnell, dev, pony, annoflux, speedFP8)

### 3.3 clip — 122.17 GB (131 174 645 938 octets)
- **Contenu:** Text encoders CLIP
- **~39 fichiers**
- Redondance potentielle à vérifier

## 4. Classement complet (référence)

| Rang | Dossier | Taille (GB) |
|------|---------|-------------|
| 1 | checkpoints | 323.81 |
| 2 | flux | 301.14 |
| 3 | clip | 122.17 |
| 4 | Audio | 52.66 |
| 5 | SD3 | 36.74 |
| 6 | zit | 26.57 |
| 7 | loras | 17.65 |
| 8 | music | 13.40 |
| 9 | controlnet | 8.69 |
| 10 | inpaint | 7.86 |
| 11 | upscale_models | 3.44 |
| 12 | clip_vision | 2.98 |
| 13 | vae | 1.75 |
| 14 | depth | 1.25 |
| 15 | ip_adapter | 0.65 |
| 16 | prompt_expansion | 0.33 |
| 17 | moonshine-tiny | 0.10 |
| 18 | hypernetworks | 0.08 |
| 19 | vae_approx | 0.01 |
| 20 | embeddings | 0.01 |
| 21 | configs | ~0.00 |
| 22-29 | diffusers, gligen, LLM, outputs, safety_checker, sam, style_models, unet | 0 (vides) |

## 5. Analyse

**Concentration:** Les 3 premiers dossiers concentrent **≈ 81%** du volume G:\models.
La nature des données est **re-téléchargeable / re-encadrable** (HuggingFace, civitai) — ce ne sont pas des données critiques ni des temporaires, mais elles sont **consolidables** (redondance de variants).

## 6. Recommandations

| # | Action | Gain estimé | Risque |
|---|--------|-------------|--------|
| 1 | Consolider variants FLUX (8 → 2-3) | ≈ 120 Go | Faible (re-téléchargeable) |
| 2 | Garder uniquement checkpoints SDXL utilisés | ≈ 100+ Go | Faible (re-téléchargeable) |
| 3 | Vérifier redondance CLIP | Variable | Faible |
| 4 | Déplacer G:\models vers P: ou M: | Libère tout G: | Aucun (simple mv) |

**Volumes de destination disponibles:**
- P: 3.7 To libres
- M: 1.4 To libres

## 7. Méthodologie

- **Outil:** `pathlib.Path('G:\\models').rglob('*')` + somme des `st_size`
- **Périmètre:** sous-dossiers directs uniquement (29 dossiers)
- **Mode:** lecture seule, aucune écriture ni suppression

---
*Artefact généré le 2026-07-06 — Session run_6b196cb61ea6*
