#!/usr/bin/env bash
set -e

SERVER=${SERVER:-http://localhost:4000}
echo "=== 1. healthz ==="
curl -fs $SERVER/healthz | python3 -m json.tool

echo -e "\n=== 2. POST valid ==="
curl -fs -X POST $SERVER/events -H 'Content-Type: application/json' \
  -d '{"source_app":"smoke","session_id":"s1","hook_event_type":"PreToolUse","payload":{"tool_name":"Bash","tool_input":{"command":"ls"}}}' \
  | python3 -m json.tool

echo -e "\n=== 3. POST invalid (expect 400) ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $SERVER/events \
  -H 'Content-Type: application/json' -d '{}')
[ "$HTTP_CODE" = "400" ] && echo "OK: got 400" || { echo "FAIL: got $HTTP_CODE"; exit 1; }

echo -e "\n=== 4. recent ==="
curl -fs "$SERVER/events/recent?limit=3" | python3 -m json.tool

echo -e "\n=== 5. filter-options ==="
curl -fs $SERVER/events/filter-options | python3 -m json.tool

echo -e "\n=== ALL OK ==="