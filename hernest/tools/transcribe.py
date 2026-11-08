import io
import os
import tempfile
from pathlib import Path
from typing import Dict, Any

_whisper_model = None

def get_whisper_model(model_size: str = "tiny"):
    """
    Charge le modèle Whisper une seule fois en mémoire (tiny = ultra rapide, 75 Mo, idéal CPU/GPU local).
    """
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        # 'tiny' ou 'base' : exécution quasi instantanée en local
        _whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _whisper_model

def transcribe_audio_bytes(audio_bytes: bytes, language: str = "fr") -> Dict[str, Any]:
    """
    Transcrit un flux audio brut (WebM, WAV, OGG, MP3) en texte.
    """
    model = get_whisper_model("tiny")
    
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tf:
        tf.write(audio_bytes)
        temp_audio_path = tf.name

    try:
        segments, info = model.transcribe(
            temp_audio_path,
            language=language,
            beam_size=3
        )
        text = " ".join([segment.text for segment in segments]).strip()
        return {
            "status": "ok",
            "text": text,
            "language": info.language,
            "duration": round(info.duration, 2)
        }
    finally:
        try:
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)
        except Exception:
            pass

