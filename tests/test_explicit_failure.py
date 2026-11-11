import tempfile
import pytest
from unittest.mock import MagicMock
from earnest.db.connection import init_db
from earnest.engine.react import ReActEngine, ReActExecutionError
from earnest.llm.client import UnifiedLLMClient, LLMProviderError

def test_explicit_failure_on_llm_error():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name
    conn = init_db(db_path)
    
    mock_llm = MagicMock(spec=UnifiedLLMClient)
    mock_llm.provider = "test"
    mock_llm.model = "test-model"
    mock_llm.chat_completion.side_effect = LLMProviderError("Connexion au provider impossible")

    engine = ReActEngine(
        conn=conn,
        project_id="test_proj",
        llm_client=mock_llm
    )

    with pytest.raises(ReActExecutionError) as exc_info:
        engine.run("Fais quelque chose")

    assert "Connexion au provider impossible" in str(exc_info.value)

    # Vérifier que le run a bien le statut 'failed' dans SQLite
    cursor = conn.cursor()
    row = cursor.execute("SELECT status FROM runs").fetchone()
    assert row["status"] == "failed"

def test_explicit_failure_on_sandbox_timeout():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name
    conn = init_db(db_path)

    mock_llm = MagicMock(spec=UnifiedLLMClient)
    mock_llm.provider = "test"
    mock_llm.model = "test-model"
    # LLM demande sandbox_exec avec un script qui timeout
    mock_llm.chat_completion.return_value = {
        "content": "Je lance un calcul",
        "tool_calls": [
            {
                "id": "c1",
                "name": "sandbox_exec",
                "arguments": {
                    "runtime": "python",
                    "code": "import time; time.sleep(5)",
                    "timeout_sec": 1
                }
            }
        ]
    }

    engine = ReActEngine(
        conn=conn,
        project_id="test_proj",
        llm_client=mock_llm
    )

    with pytest.raises(ReActExecutionError) as exc_info:
        engine.run("Calcul long")

    assert "dépassé le délai" in str(exc_info.value)

