import pytest
from hernest.tools.terminal import execute_terminal, DangerousCommandError, check_command_safety
from hernest.tools.web import fetch_web_resource, WebFetchError

def test_terminal_safe_command():
    res = execute_terminal("echo HELLO_HERNEST")
    assert res["exit_code"] == 0
    assert "HELLO_HERNEST" in res["stdout"]

def test_terminal_blocks_rmdir():
    with pytest.raises(DangerousCommandError):
        execute_terminal("rmdir /s /q C:\\some_dir")

def test_terminal_blocks_format():
    with pytest.raises(DangerousCommandError):
        execute_terminal("format d:")

def test_terminal_blocks_shutdown():
    with pytest.raises(DangerousCommandError):
        execute_terminal("shutdown /s /t 0")

def test_web_fetch_invalid_url():
    with pytest.raises(ValueError):
        fetch_web_resource("ftp://invalid-protocol.com")

