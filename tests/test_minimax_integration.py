# Copyright (C) 2025 AIDC-AI
# Licensed under the MIT License.

"""Integration tests for MiniMax LLM provider.

These tests call the real MiniMax API and require MINIMAX_API_KEY to be set.
Skip gracefully when the key is not available.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY") or os.environ.get("CC_MINIMAX_API_KEY")
SKIP_REASON = "MINIMAX_API_KEY not set"


@unittest.skipUnless(MINIMAX_API_KEY, SKIP_REASON)
class TestMiniMaxChatCompletions(unittest.TestCase):
    """Verify MiniMax chat completions work end-to-end."""

    def test_simple_completion(self):
        import requests

        resp = requests.post(
            "https://api.minimax.io/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {MINIMAX_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "MiniMax-M3",
                "messages": [{"role": "user", "content": "Say hello in one word."}],
                "max_tokens": 10,
            },
            timeout=30,
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("choices", data)
        self.assertTrue(len(data["choices"]) > 0)

    def test_highspeed_model(self):
        import requests

        resp = requests.post(
            "https://api.minimax.io/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {MINIMAX_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "MiniMax-M2.7-highspeed",
                "messages": [{"role": "user", "content": "Reply OK."}],
                "max_tokens": 5,
            },
            timeout=30,
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("choices", data)

    def test_temperature_zero(self):
        import requests

        resp = requests.post(
            "https://api.minimax.io/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {MINIMAX_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "MiniMax-M3",
                "messages": [{"role": "user", "content": "What is 1+1?"}],
                "max_tokens": 10,
                "temperature": 0,
            },
            timeout=30,
        )
        self.assertEqual(resp.status_code, 200)


@unittest.skipUnless(MINIMAX_API_KEY, SKIP_REASON)
class TestMiniMaxKeyVerification(unittest.TestCase):
    """Verify key validation logic matches what llm_api.py does."""

    def test_valid_key_verifies(self):
        import requests

        resp = requests.post(
            "https://api.minimax.io/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {MINIMAX_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "MiniMax-M3",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 1,
            },
            timeout=15,
        )
        self.assertEqual(resp.status_code, 200)

    def test_invalid_key_fails(self):
        import requests

        resp = requests.post(
            "https://api.minimax.io/v1/chat/completions",
            headers={
                "Authorization": "Bearer invalid-key-12345",
                "Content-Type": "application/json",
            },
            json={
                "model": "MiniMax-M3",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 1,
            },
            timeout=15,
        )
        self.assertNotEqual(resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()
