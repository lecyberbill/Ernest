# Inventory Summary — G:\models

> Audit en lecture seule — 2026-07-06 — Session run_6b196cb61ea6

## Contexte
- Volume G: **929.5 Go** (99.8% utilisé, 2 Go libres → CRITIQUE)
- G:\models: **≈ 921.3 Go** (99.9% du volume)
- Sous-dossiers directs dans G:\models: **29**

## Top 3 sous-dossiers par taille

| Rang | Dossier | Taille | Part du total G:\models |
|------|---------|--------|-------------------------|
| 1 | checkpoints | **323.81 GB** (347 683 137 069 bytes) | ≈ 35.1% |
| 2 | flux | **301.14 GB** (323 345 264 564 bytes) | ≈ 32.7% |
| 3 | clip | **122.17 GB** (131 174 645 938 bytes) | ≈ 13.3% |
| | **TOTAL TOP 3** | **747.12 GB** | **≈ 81%** |

## Détails par dossier

### 1. checkpoints (323.81 GB)
- Modèles Stable Diffusion / SDXL (fichiers .safetensors de 6-13 Go)
- Fichier le plus volumineux: realismarkPlus_realismarkPlus.safetensors (13.35 Go)
- ~51 fichiers

### 2. flux (301.14 GB)
- Modèles FLUX / FLUX.2 (variantes fp8 de 15-17 Go)
- Fichier le plus volumineux: flux2DevFp8Scaled_fp8Scaled.safetensors (30.01 Go)
- ~25 fichiers, dont 8+ variantes redondantes

### 3. clip (122.17 GB)
- Modèles CLIP text encoders
- ~39 fichiers

## Totaux
- **Total Top 3: 747.12 GB**
- **Part du volume G: ≈ 81%**
- Suivants (référence): Audio 52.66 GB, SD3 36.74 GB, zit 26.57 GB, loras 17.65 GB, music 13.40 GB, controlnet 8.69 GB, inpaint 7.86 GB, upscale_models 3.44 GB

## Recommandations
1. **Consolider variants FLUX** (8 → 2-3): ≈ 120 Go récupérables
2. **Garder uniquement checkpoints SDXL utilisés**: ≈ 100+ Go récupérables
3. **Vérifier redondance CLIP**
4. **Alternative**: déplacer G:\models vers P: (3.7 To libres) ou M: (1.4 To libres)
5. **Aucune suppression effectuée** — audit en lecture seule
