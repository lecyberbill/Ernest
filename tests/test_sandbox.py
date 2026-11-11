import pytest
from earnest.tools.sandbox import execute_in_sandbox, SandboxTimeoutError, SandboxExecutionError

def test_sandbox_python():
    res = execute_in_sandbox(
        runtime="python",
        code="print('HELLO_FROM_SANDBOX')"
    )
    assert res["exit_code"] == 0
    assert "HELLO_FROM_SANDBOX" in res["stdout"].strip()

def test_sandbox_node():
    res = execute_in_sandbox(
        runtime="node",
        code="console.log('HELLO_FROM_NODE');"
    )
    assert res["exit_code"] == 0
    assert "HELLO_FROM_NODE" in res["stdout"].strip()

def test_sandbox_timeout():
    with pytest.raises(SandboxTimeoutError):
        execute_in_sandbox(
            runtime="python",
            code="import time; time.sleep(3)",
            timeout_sec=1
        )

def test_sandbox_invalid_runtime():
    with pytest.raises(ValueError):
        execute_in_sandbox(
            runtime="unsupported_lang",
            code="echo 1"
        )

