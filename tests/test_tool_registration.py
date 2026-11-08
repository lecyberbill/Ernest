import tempfile
import json
import pytest
from hernest.db.connection import init_db
from hernest.tools.registry import ToolRegistryService

@pytest.fixture
def registry_service():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name
    conn = init_db(db_path)
    service = ToolRegistryService(conn)
    yield service
    conn.close()

def test_register_and_execute_python_tool(registry_service):
    schema = {
        "type": "object",
        "properties": {
            "x": {"type": "integer"}
        },
        "required": ["x"]
    }
    code = """
import sys, json
data = json.loads(sys.stdin.read())
result = data.get("x", 0) * 2
print(json.dumps({"doubled": result}))
"""
    reg = registry_service.register_tool(
        name="double_number",
        description="Double a given number",
        schema_json=json.dumps(schema),
        code=code,
        runtime="python"
    )
    assert reg["status"] == "success"
    
    active = registry_service.list_active_tools()
    assert any(t["name"] == "double_number" for t in active)

    res = registry_service.execute_registered_tool("double_number", {"x": 21})
    assert res["exit_code"] == 0
    parsed = json.loads(res["stdout"])
    assert parsed["doubled"] == 42

