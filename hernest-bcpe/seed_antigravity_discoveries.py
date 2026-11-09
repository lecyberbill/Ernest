import subprocess
import json

def kb_call(tool, args):
    proc = subprocess.Popen([r'D:\Projet\Hernest\hernest-bcpe\target\release\kb.exe', 'serve', '--db', r'D:\Projet\Hernest\hernest-bcpe\kb.db'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    req = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': tool, 'arguments': args}}
    proc.stdin.write(json.dumps(req) + '\n')
    proc.stdin.flush()
    line = proc.stdout.readline()
    proc.terminate()
    return json.loads(line)

# 1. Découverte Tiny-HTTP Body Drain
kb_call('kb_search', {'product_id': 'hernest', 'query': 'tiny-http'})
r1 = kb_call('kb_propose', {
    'product_id': 'hernest',
    'subject_key': 'tiny-http-req-body-exhaustion',
    'kind': 'piege',
    'source': 'antigravity_discovery',
    'title': 'Consommation unique du flux TCP req.as_reader() dans tiny_http',
    'symptom': 'JSON vide {} ou EOF inattendu lors de la lecture du body HTTP',
    'cause': 'req.as_reader().read_to_string() draine directement le socket TCP; les lectures suivantes renvoient un buffer vide',
    'correction': 'Lire le corps de la requete strictement une seule fois par handle_request et stocker la chaine lue',
    'example': 'let mut body = String::new(); req.as_reader().read_to_string(&mut body).ok();',
    'auto_validate': True
})

# 2. Découverte Monaco AMD Worker Blob URL Proxy
kb_call('kb_search', {'product_id': 'hernest', 'query': 'monaco'})
r2 = kb_call('kb_propose', {
    'product_id': 'hernest',
    'subject_key': 'monaco-amd-blob-worker-proxy',
    'kind': 'piege',
    'source': 'antigravity_discovery',
    'title': 'Erreur MIME text/html des Web Workers Monaco sous port local custom',
    'symptom': 'WorkerGlobalScope.fetch is not a valid URL ou MIME forbidden',
    'cause': 'Les requetes relatives de Monaco tombent dans le fallback SPA index.html',
    'correction': 'Creer les workers via Blob URL inline executant importScripts avec origin absolu string literal',
    'example': 'URL.createObjectURL(new Blob([proxyWorker], { type: "application/javascript" }))',
    'auto_validate': True
})

# 3. Découverte SQLite Locking Windows
kb_call('kb_search', {'product_id': 'hernest', 'query': 'windows-sqlite'})
r3 = kb_call('kb_propose', {
    'product_id': 'hernest',
    'subject_key': 'windows-sqlite-locking-wal',
    'kind': 'regle',
    'source': 'antigravity_discovery',
    'title': 'Prevenir les verrous stricts SQLite sous Windows en environnement multi-threads',
    'symptom': 'database is locked (os error 5) lors d operations concurrentes',
    'cause': 'Verrous exclusifs fichiers sous Windows sans delai d attente de retry',
    'correction': 'Activer PRAGMA journal_mode=WAL et configurer busy_timeout(Duration::from_secs(5)) sur chaque connexion',
    'example': 'conn.busy_timeout(std::time::Duration::from_secs(5)).ok(); conn.pragma_update(None, "journal_mode", "WAL").ok();',
    'auto_validate': True
})

print("1. Tiny-HTTP:", r1.get('result', {}).get('structuredContent', {}).get('status'))
print("2. Monaco Blob:", r2.get('result', {}).get('structuredContent', {}).get('status'))
print("3. SQLite WAL:", r3.get('result', {}).get('structuredContent', {}).get('status'))

