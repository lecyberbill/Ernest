import base64
import io
from pathlib import Path
from typing import Dict, Any, List, Optional

def extract_file_content(file_name: str, base64_data: str) -> Dict[str, Any]:
    """
    Traite un fichier envoyé par l'utilisateur (image, PDF, Word, code, texte) :
    - Si Image (PNG, JPG, WEBP) : conserve le base64 pour les modèles VLM (Vision / Ollama / OpenAI)
    - Si PDF : extrait le texte via pypdf
    - Si Word (.docx) : extrait le texte via python-docx
    - Si Texte/Code (.txt, .py, .md, .json, .rs, .csv, etc.) : décode le texte brut
    """
    ext = Path(file_name).suffix.lower()
    
    # Nettoyage header data:mime/type;base64, si présent
    if "," in base64_data:
        base64_data = base64_data.split(",", 1)[1]

    raw_bytes = base64.b64decode(base64_data)
    size_kb = round(len(raw_bytes) / 1024, 1)

    # 1. Traitement des Images (Multimodal direct)
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"):
        mime = f"image/{ext[1:]}"
        if ext == ".jpg": mime = "image/jpeg"
        return {
            "type": "image",
            "file_name": file_name,
            "size_kb": size_kb,
            "mime_type": mime,
            "base64_data": base64_data,
            "summary": f"[Image jointe: {file_name} ({size_kb} KB)]"
        }

    # 2. Traitement des documents PDF
    elif ext == ".pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(raw_bytes))
            pages_text = []
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if text.strip():
                    pages_text.append(f"--- Page {i+1} ---\n{text}")
            extracted = "\n\n".join(pages_text) if pages_text else "Document PDF sans texte sélectionnable."
            return {
                "type": "pdf",
                "file_name": file_name,
                "size_kb": size_kb,
                "num_pages": len(reader.pages),
                "text_content": extracted,
                "summary": f"[Document PDF joint: {file_name} ({len(reader.pages)} pages, {size_kb} KB)]"
            }
        except Exception as e:
            return {
                "type": "pdf",
                "file_name": file_name,
                "error": f"Erreur de lecture PDF: {e}",
                "summary": f"[Erreur de lecture du PDF {file_name}]"
            }

    # 3. Traitement des documents Word (.docx)
    elif ext == ".docx":
        try:
            import docx
            doc = docx.Document(io.BytesIO(raw_bytes))
            paras = [p.text for p in doc.paragraphs if p.text.strip()]
            extracted = "\n".join(paras) if paras else "Document Word vide."
            return {
                "type": "docx",
                "file_name": file_name,
                "size_kb": size_kb,
                "text_content": extracted,
                "summary": f"[Document Word joint: {file_name} ({size_kb} KB)]"
            }
        except Exception as e:
            return {
                "type": "docx",
                "file_name": file_name,
                "error": f"Erreur de lecture Word: {e}",
                "summary": f"[Erreur de lecture du document Word {file_name}]"
            }

    # 4. Fichiers texte, code, markdown, logs
    else:
        try:
            text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = raw_bytes.decode("latin-1", errors="replace")

        return {
            "type": "text",
            "file_name": file_name,
            "size_kb": size_kb,
            "text_content": text,
            "summary": f"[Fichier texte joint: {file_name} ({size_kb} KB)]"
        }

