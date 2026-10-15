#!/usr/bin/env python3
"""
Jetro Canvas Refresh Script — Global Brand Intelligence
Queries local newspaper server http://localhost:3000/api/status and /api/news
Emits structured JSON payload for Jetro spatial canvas updates.
"""
import urllib.request
import json
import sys

def main():
    try:
        url = "http://localhost:3000/api/news"
        req = urllib.request.Request(url, headers={"User-Agent": "JetroCanvasMonitor/1.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            summary = {
                "totalCount": data.get("totalCount", 0),
                "fetchedAt": data.get("fetchedAt"),
                "feedsSuccess": len([f for f in data.get("feedStatuses", []) if f.get("success")]),
                "feedsTotal": len(data.get("feedStatuses", [])),
                "status": "healthy"
            }
            print(json.dumps(summary, indent=2))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
