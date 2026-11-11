"""
Module de Traçabilité OpenTelemetry Standard & Export LLMOps pour Earnest.
Format standardisé OTLP-compatible pour les runs agentiques :
- Spans hiérarchiques (Run -> Step -> LLM / Tool Call)
- Métadonnées d'observabilité (tokens, latences, modèle, statuts)
- Export JSONL et diagnostic local sans dépendance externe lourde.
"""

import time
import json
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional
from earnest.config import get_data_dir

class OTelSpan:
    """Représente un span de trace conforme au modèle OpenTelemetry."""

    def __init__(self, name: str, span_kind: str = "INTERNAL", parent_span_id: Optional[str] = None):
        self.trace_id = None
        self.span_id = uuid.uuid4().hex[:16]
        self.parent_span_id = parent_span_id
        self.name = name
        self.span_kind = span_kind
        self.start_time_ns = time.time_ns()
        self.end_time_ns = None
        self.attributes: Dict[str, Any] = {}
        self.events: List[Dict[str, Any]] = []
        self.status = "UNSET"

    def set_attribute(self, key: str, value: Any):
        self.attributes[key] = value

    def add_event(self, name: str, attributes: Optional[Dict[str, Any]] = None):
        self.events.append({
            "name": name,
            "timestamp_ns": time.time_ns(),
            "attributes": attributes or {}
        })

    def end(self, status: str = "OK"):
        self.end_time_ns = time.time_ns()
        self.status = status

    def to_dict(self) -> Dict[str, Any]:
        duration_ms = ((self.end_time_ns or time.time_ns()) - self.start_time_ns) / 1_000_000
        return {
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "parent_span_id": self.parent_span_id,
            "name": self.name,
            "kind": self.span_kind,
            "start_time_unix_nano": self.start_time_ns,
            "end_time_unix_nano": self.end_time_ns or time.time_ns(),
            "duration_ms": round(duration_ms, 2),
            "status": {"code": self.status},
            "attributes": self.attributes,
            "events": self.events
        }

class AgentTracer:
    """Gestionnaire de traces OpenTelemetry pour une exécution ReAct."""

    def __init__(self, run_id: str, project_id: str = "default_workspace"):
        self.trace_id = uuid.uuid4().hex
        self.run_id = run_id
        self.project_id = project_id
        self.root_span = OTelSpan(f"agent.run:{run_id}", span_kind="SERVER")
        self.root_span.trace_id = self.trace_id
        self.root_span.set_attribute("agent.run_id", run_id)
        self.root_span.set_attribute("agent.project_id", project_id)
        self.spans: List[OTelSpan] = [self.root_span]

    def start_span(self, name: str, span_kind: str = "INTERNAL") -> OTelSpan:
        span = OTelSpan(name, span_kind=span_kind, parent_span_id=self.root_span.span_id)
        span.trace_id = self.trace_id
        self.spans.append(span)
        return span

    def record_llm_call(self, model: str, prompt_tokens: int, completion_tokens: int, duration_ms: float):
        span = self.start_span(f"llm.chat_completion:{model}", span_kind="CLIENT")
        span.set_attribute("llm.model", model)
        span.set_attribute("llm.usage.prompt_tokens", prompt_tokens)
        span.set_attribute("llm.usage.completion_tokens", completion_tokens)
        span.set_attribute("llm.usage.total_tokens", prompt_tokens + completion_tokens)
        span.set_attribute("llm.latency_ms", duration_ms)
        span.end("OK")

    def record_tool_call(self, tool_name: str, args: Dict[str, Any], duration_ms: float, success: bool):
        span = self.start_span(f"tool.execute:{tool_name}", span_kind="INTERNAL")
        span.set_attribute("tool.name", tool_name)
        span.set_attribute("tool.args", json.dumps(args, ensure_ascii=False)[:300])
        span.set_attribute("tool.duration_ms", duration_ms)
        span.end("OK" if success else "ERROR")

    def finish(self, status: str = "OK"):
        self.root_span.end(status)
        self._export_local()

    def _export_local(self):
        """Enregistre la trace au format JSONL dans le répertoire de traces de l'agent."""
        try:
            traces_dir = Path.home() / ".local" / "share" / "agent-manager" / "traces" / self.project_id
            traces_dir.mkdir(parents=True, exist_ok=True)
            trace_file = traces_dir / f"trace_{self.run_id}.json"
            
            payload = {
                "resourceSpans": [
                    {
                        "resource": {
                            "attributes": {
                                "service.name": "earnest-agent-runner",
                                "service.version": "1.0.0",
                                "deployment.environment": "production"
                            }
                        },
                        "scopeSpans": [
                            {
                                "scope": {"name": "earnest.engine.react"},
                                "spans": [s.to_dict() for s in self.spans]
                            }
                        ]
                    }
                ]
            }
            trace_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass
