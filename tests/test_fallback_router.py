from unittest.mock import MagicMock
import pytest
from earnest.llm.router import LLMFallbackRouter
from earnest.llm.client import LLMProviderError

def test_fallback_router_switches_on_failure():
    backends = [
        {"id": "b1", "name": "Primary Ollama", "provider": "ollama", "base_url": "http://invalid-host:11434"},
        {"id": "b2", "name": "Fallback LMStudio", "provider": "openai", "base_url": "http://mock-lmstudio:1234"}
    ]

    router = LLMFallbackRouter(backends, primary_index=0)

    # Simuler échec sur le premier client et succès sur le deuxième
    router.clients[0].chat_completion = MagicMock(side_effect=Exception("Connection refused"))
    router.clients[1].chat_completion = MagicMock(return_value={"content": "Réponse de secours", "tool_calls": []})

    fallbacks_triggered = []
    def on_fallback(b, err):
        fallbacks_triggered.append(b["id"])

    res = router.chat_completion([{"role": "user", "content": "Hello"}], on_fallback=on_fallback)

    assert res["content"] == "Réponse de secours"
    assert res["active_backend"] == "b2"
    assert fallbacks_triggered == ["b1"]

def test_fallback_router_raises_if_all_fail():
    backends = [
        {"id": "b1", "name": "Primary", "provider": "ollama", "base_url": "http://invalid:11434"},
        {"id": "b2", "name": "Secondary", "provider": "openai", "base_url": "http://invalid:1234"}
    ]

    router = LLMFallbackRouter(backends, primary_index=0)
    router.clients[0].chat_completion = MagicMock(side_effect=Exception("Err 1"))
    router.clients[1].chat_completion = MagicMock(side_effect=Exception("Err 2"))

    with pytest.raises(LLMProviderError) as exc_info:
        router.chat_completion([{"role": "user", "content": "Hello"}])

    assert "Tous les backends d'inférence ont échoué" in str(exc_info.value)

