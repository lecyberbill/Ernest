import sys
import base64
import ctypes
from typing import Optional

# Support DPAPI Windows natif sans dépendance pip
if sys.platform == "win32":
    import ctypes.wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [
            ("cbData", ctypes.wintypes.DWORD),
            ("pbData", ctypes.POINTER(ctypes.c_byte))
        ]

    CryptProtectData = ctypes.windll.crypt32.CryptProtectData
    CryptProtectData.argtypes = [
        ctypes.POINTER(DATA_BLOB),
        ctypes.wintypes.LPCWSTR,
        ctypes.POINTER(DATA_BLOB),
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.wintypes.DWORD,
        ctypes.POINTER(DATA_BLOB)
    ]
    CryptProtectData.restype = ctypes.wintypes.BOOL

    CryptUnprotectData = ctypes.windll.crypt32.CryptUnprotectData
    CryptUnprotectData.argtypes = [
        ctypes.POINTER(DATA_BLOB),
        ctypes.POINTER(ctypes.wintypes.LPWSTR),
        ctypes.POINTER(DATA_BLOB),
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.wintypes.DWORD,
        ctypes.POINTER(DATA_BLOB)
    ]
    CryptUnprotectData.restype = ctypes.wintypes.BOOL

def encrypt_secret(plain_text: str) -> str:
    """
    Chiffre une chaîne secrète avec Windows DPAPI (CryptProtectData).
    Le secret n'est déchiffrable que par la session de l'utilisateur Windows courant.
    Retourne une chaîne préfixée par 'DPAPI:' en base64.
    """
    if not plain_text:
        return ""

    if sys.platform != "win32":
        # Fallback hors-windows (base64 simple ou non altéré)
        return "B64:" + base64.b64encode(plain_text.encode("utf-8")).decode("utf-8")

    data_bytes = plain_text.encode("utf-8")
    blob_in = DATA_BLOB()
    blob_in.cbData = len(data_bytes)
    blob_in.pbData = ctypes.cast(ctypes.create_string_buffer(data_bytes), ctypes.POINTER(ctypes.c_byte))

    blob_out = DATA_BLOB()

    # CRYPTPROTECT_UI_FORBIDDEN = 0x1
    success = CryptProtectData(
        ctypes.byref(blob_in),
        "HernestSecret",
        None,
        None,
        None,
        0x1,
        ctypes.byref(blob_out)
    )

    if not success:
        raise OSError("Échec du chiffrement DPAPI Windows.")

    try:
        raw_encrypted = ctypes.string_at(blob_out.pbData, blob_out.cbData)
        return "DPAPI:" + base64.b64encode(raw_encrypted).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)

def decrypt_secret(cipher_text: str) -> str:
    """
    Déchiffre un secret chiffré par encrypt_secret.
    """
    if not cipher_text:
        return ""

    if cipher_text.startswith("DPAPI:"):
        if sys.platform != "win32":
            raise OSError("Impossible de déchiffrer un payload DPAPI sur un système non-Windows.")

        raw_b64 = cipher_text[len("DPAPI:"):]
        raw_encrypted = base64.b64decode(raw_b64)

        blob_in = DATA_BLOB()
        blob_in.cbData = len(raw_encrypted)
        blob_in.pbData = ctypes.cast(ctypes.create_string_buffer(raw_encrypted), ctypes.POINTER(ctypes.c_byte))

        blob_out = DATA_BLOB()
        success = CryptUnprotectData(
            ctypes.byref(blob_in),
            None,
            None,
            None,
            None,
            0x1,
            ctypes.byref(blob_out)
        )

        if not success:
            raise OSError("Échec du déchiffrement DPAPI Windows (clé invalide ou autre utilisateur).")

        try:
            decrypted_bytes = ctypes.string_at(blob_out.pbData, blob_out.cbData)
            return decrypted_bytes.decode("utf-8")
        finally:
            ctypes.windll.kernel32.LocalFree(blob_out.pbData)

    elif cipher_text.startswith("B64:"):
        raw_b64 = cipher_text[len("B64:"):]
        return base64.b64decode(raw_b64).decode("utf-8")
    else:
        # Valeur en clair (legacy ou non encore chiffrée)
        return cipher_text

