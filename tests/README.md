# Search MCP tests

Install `requirements.txt`, then run:

```bash
python -m pytest -q --import-mode=importlib --confcutdir=tests tests/test_search_mcp.py
```

These offline tests use the real agent factory, provider resolver, Agents Runner and HTTP MCP client. Model replies and MCP HTTP responses are scripted protocol fixtures. ComfyUI canvas/storage edges and rewrite-agent construction are stubbed, so a running ComfyUI server, GPU and model API key are unnecessary. The tests verify tool dispatch, search/fetch result consumption, provider choices, disabled search, request credential isolation, timeouts, cancellation and errors. They assert request destinations and headers and make no external requests.
