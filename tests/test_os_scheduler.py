import sys
from unittest.mock import patch, MagicMock
import pytest
from hernest.scheduler.os_scheduler import OSScheduler, OSSchedulerError

def test_sync_windows_task_command():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="SUCCESS", stderr="")
        with patch.object(sys, "platform", "win32"):
            res = OSScheduler.sync_task(
                task_id="abc123",
                cron_expr="0 2 * * *",
                agent_cmd="python -m hernest.cli run --task-id abc123"
            )
            assert res["status"] == "synced"
            assert res["system"] == "schtasks"
            assert mock_run.called
            call_args = mock_run.call_args[0][0]
            assert "schtasks.exe" in call_args[0]
            assert "/TN" in call_args
            assert "Hernest_abc123" in call_args
            assert "/ST" in call_args
            assert "02:00" in call_args

def test_sync_unix_cron():
    with patch("subprocess.run") as mock_run:
        # Premier appel: crontab -l, second: crontab -
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="* * * * * existing_cmd\n", stderr=""),
            MagicMock(returncode=0, stdout="", stderr="")
        ]
        with patch.object(sys, "platform", "linux"):
            res = OSScheduler.sync_task(
                task_id="task_99",
                cron_expr="30 4 * * *",
                agent_cmd="hernest run --task-id task_99"
            )
            assert res["status"] == "synced"
            assert res["system"] == "crontab"
            assert mock_run.call_count == 2

