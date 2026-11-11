import tempfile
import sqlite3
import pytest
from earnest.db.connection import init_db
from earnest.db.memories import MemoryService

@pytest.fixture
def memory_service():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name
    conn = init_db(db_path)
    service = MemoryService(conn)
    yield service
    conn.close()

def test_store_and_recall_project_scope(memory_service):
    proj = "proj_alpha"
    memory_service.store_memory(proj, "coding_rule", "Always write clean code", "project")
    val = memory_service.recall_memory(proj, "coding_rule")
    assert val == "Always write clean code"

def test_store_and_recall_session_scope(memory_service):
    proj = "proj_alpha"
    sess = "sess_123"
    memory_service.store_memory(proj, "temp_target", "file.py", "session", session_id=sess)
    
    # Recall avec bon session_id
    val = memory_service.recall_memory(proj, "temp_target", session_id=sess)
    assert val == "file.py"
    
    # Recall sans session_id ou avec autre session_id
    assert memory_service.recall_memory(proj, "temp_target", session_id="other_sess") is None
    assert memory_service.recall_memory(proj, "temp_target") is None

def test_project_isolation(memory_service):
    memory_service.store_memory("proj_1", "key1", "val1", "project")
    memory_service.store_memory("proj_2", "key1", "val2", "project")
    
    assert memory_service.recall_memory("proj_1", "key1") == "val1"
    assert memory_service.recall_memory("proj_2", "key1") == "val2"
    assert memory_service.recall_memory("proj_3", "key1") is None

def test_invalid_scope(memory_service):
    with pytest.raises(ValueError):
        memory_service.store_memory("proj_1", "key", "content", "invalid_scope")

