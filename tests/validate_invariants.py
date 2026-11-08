import json
import subprocess
import sys

def main():
    if sys.stdout.encoding.lower() != "utf-8":
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    with open("invariants.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    invariants = data.get("invariants", [])
    failed = []

    print(f"=== Validation de {len(invariants)} Invariants ===")
    for inv in invariants:
        inv_id = inv["id"]
        probe = inv["executable_probe"]
        expected = inv["expected_output"]
        print(f"[{inv_id}] ... ", end="", flush=True)

        res = subprocess.run(probe, shell=True, capture_output=True, text=True)
        combined = (res.stdout or "") + (res.stderr or "")
        if res.returncode == 0 and expected in combined:
            print("OK [PASS]")
        else:
            print(f"FAILED [FAIL] (returncode={res.returncode})")
            print(f"  Sortie: {combined.strip()}")
            failed.append(inv_id)

    if failed:
        print(f"\n{len(failed)} invariants ont echoue : {failed}")
        sys.exit(1)
    else:
        print(f"\nTOUS LES {len(invariants)} INVARIANTS SONT RESPECTES A 100% !")
        sys.exit(0)

if __name__ == "__main__":
    main()
