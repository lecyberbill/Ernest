import sys
import json

try:
    import jedi
except ImportError:
    jedi = None

def process_request(line):
    if not line.strip():
        return
    try:
        req = json.loads(line)
    except Exception as e:
        sys.stdout.write(json.dumps({"error": f"JSON parse error: {str(e)}"}) + "\n")
        sys.stdout.flush()
        return

    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params", {})
    code = params.get("code", "")
    path = params.get("path", "script.py")
    line_num = params.get("line", 1)
    col_num = params.get("column", 1)

    if jedi is None:
        sys.stdout.write(json.dumps({"id": req_id, "error": "jedi not installed in python environment"}) + "\n")
        sys.stdout.flush()
        return

    try:
        script = jedi.Script(code, path=path)

        if method == "complete":
            comps = script.complete(line_num, col_num)
            items = []
            for c in comps[:60]:
                doc = ""
                try:
                    doc = c.docstring()
                except Exception:
                    pass
                items.append({
                    "label": c.name,
                    "kind": c.type,
                    "detail": c.description,
                    "doc": doc
                })
            res = {"items": items}
        elif method == "hover":
            helps = script.help(line_num, col_num)
            contents = []
            for h in helps:
                doc = ""
                try:
                    doc = h.docstring()
                except Exception:
                    pass
                contents.append(f"```python\n{h.description}\n```\n{doc}")
            res = {"contents": contents}
        elif method == "definition":
            defs = script.goto(line_num, col_num)
            results = []
            for d in defs:
                mod_path = str(d.module_path) if d.module_path else path
                results.append({
                    "file": mod_path,
                    "line": d.line or 1,
                    "column": d.column or 1
                })
            res = {"definitions": results}
        elif method == "signatures":
            sigs = script.get_signatures(line_num, col_num)
            signatures_list = []
            for s in sigs:
                signatures_list.append({
                    "label": s.to_string(),
                    "activeParameter": s.index or 0,
                    "parameters": [p.name for p in s.params]
                })
            res = {"signatures": signatures_list}
        else:
            res = {"error": f"Unsupported method: {method}"}

        out = {"id": req_id, "result": res}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"id": req_id, "error": str(e)}) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    for line in sys.stdin:
        process_request(line)

