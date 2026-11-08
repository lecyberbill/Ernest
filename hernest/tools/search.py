import re
import urllib.request
import urllib.parse
from typing import List, Dict, Any

def search_duckduckgo(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """
    Effectue une recherche web via DuckDuckGo HTML et extrait les titres, snippets et URLs.
    """
    encoded_query = urllib.parse.quote(query)
    url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
    }
    
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="replace")
            
        results = []
        # Extraction regex des résultats de duckduckgo html
        # Les liens de résultat ont la classe 'result__snippet' et 'result__url'
        snippets = re.findall(r'<a class="result__snippet[^"]*"[^>]*>(.*?)</a>', html, re.DOTALL)
        titles = re.findall(r'<a class="result__url[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.DOTALL)
        
        for i in range(min(len(titles), len(snippets), max_results)):
            raw_url, title_text = titles[i]
            # Duckduckgo encapsule parfois l'url dans /l/?uddg=...
            actual_url = raw_url
            if "uddg=" in raw_url:
                m = re.search(r'uddg=([^&]+)', raw_url)
                if m:
                    actual_url = urllib.parse.unquote(m.group(1))

            snippet_text = re.sub(r'<[^>]+>', '', snippets[i]).strip()
            title_clean = re.sub(r'<[^>]+>', '', title_text).strip()
            
            results.append({
                "title": title_clean or f"Résultat {i+1}",
                "url": actual_url,
                "snippet": snippet_text
            })
            
        return results
    except Exception as e:
        return [{"error": f"Erreur lors de la recherche : {e}"}]

