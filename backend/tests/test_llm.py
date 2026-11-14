import json

import httpx
import pytest

from app.config import Settings
from app.llm import BifrostLLM
from app.models import Claim, Evidence

CLAIMS = {"claims": [{"text": "The Pro plan costs $20.", "category": "pricing",
                      "time_sensitive": True, "volatility": "high",
                      "risk_reason": "Prices change.", "search_query": "pro plan price"},
                     {"text": "broken"}]}


def completion(content: str, **extra) -> dict:
    return {"model": "openai/gpt-oss-120b", "choices": [{"message": {"content": content}}],
            "usage": {"prompt_tokens": 11, "completion_tokens": 7}, **extra}


def make_llm(responses: list[dict], seen: list[httpx.Request], **settings) -> BifrostLLM:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=responses[len(seen) - 1])

    return BifrostLLM(Settings(**settings), transport=httpx.MockTransport(handler))


async def test_request_carries_model_fallbacks_and_virtual_key():
    seen = []
    llm = make_llm([completion(json.dumps(CLAIMS))], seen,
                   model_fallbacks=["xai/grok-4.7"], bifrost_virtual_key="vk-test")
    claims, call = await llm.extract_claims("The Pro plan costs $20.")

    body = json.loads(seen[0].content)
    assert seen[0].url.path == "/v1/chat/completions"
    assert body["model"] == "groq/openai/gpt-oss-120b"
    assert body["fallbacks"] == ["xai/grok-4.7"]
    assert body["temperature"] == 0
    assert body["response_format"] == {"type": "json_object"}
    assert seen[0].headers["x-bf-vk"] == "vk-test"
    assert "authorization" not in seen[0].headers
    assert [c.text for c in claims] == ["The Pro plan costs $20."]  # malformed item dropped
    assert (call.stage, call.prompt_tokens, call.completion_tokens) == ("extract", 11, 7)
    assert call.served_by == "groq/openai/gpt-oss-120b" and call.is_fallback is False


async def test_no_fallbacks_or_virtual_key_when_unset():
    seen = []
    llm = make_llm([completion(json.dumps(CLAIMS))], seen, bifrost_api_key="sk-test")
    await llm.extract_claims("x")
    assert "fallbacks" not in json.loads(seen[0].content)
    assert "x-bf-vk" not in seen[0].headers
    assert seen[0].headers["authorization"] == "Bearer sk-test"


async def test_served_by_and_fallback_from_routing_info():
    routing = {"extra_fields": {"routing_info": {
        "provider": "xai", "model": "grok-4.7", "is_fallback": True}}}
    seen = []
    llm = make_llm([completion(json.dumps(CLAIMS), **routing)], seen)
    _, call = await llm.extract_claims("x")
    assert call.served_by == "xai/grok-4.7"
    assert call.is_fallback is True


async def test_slashed_model_id_is_not_a_fallback():
    routing = {"extra_fields": {"routing_info": {
        "provider": "groq", "model": "openai/gpt-oss-120b"}}}
    seen = []
    llm = make_llm([completion(json.dumps(CLAIMS), **routing)], seen)
    _, call = await llm.extract_claims("x")
    assert call.served_by == "groq/openai/gpt-oss-120b" and call.is_fallback is False


async def test_response_model_field_alone_is_not_a_fallback():
    seen = []
    llm = make_llm([completion(json.dumps(CLAIMS))], seen)  # model: openai/gpt-oss-120b
    _, call = await llm.extract_claims("x")
    assert call.served_by == "groq/openai/gpt-oss-120b" and call.is_fallback is False


async def test_fallback_equal_to_requested_model_is_dropped():
    seen = []
    llm = make_llm([{"choices": [{"message": {"content": "A."}}]}] * 2, seen,
                   model_fallbacks=["xai/grok-4.7"])
    await llm.answer("q")  # requests xai/grok-4.7
    assert "fallbacks" not in json.loads(seen[0].content)
    await llm.rewrite("a", [])  # requests the Groq judge model
    assert json.loads(seen[1].content)["fallbacks"] == ["xai/grok-4.7"]


async def test_fenced_json_is_tolerated():
    seen = []
    llm = make_llm([completion(f"```json\n{json.dumps(CLAIMS)}\n```")], seen)
    claims, _ = await llm.extract_claims("x")
    assert len(claims) == 1


async def test_bad_json_retries_once_then_raises():
    seen = []
    llm = make_llm([completion("not json"), completion(json.dumps(CLAIMS))], seen)
    claims, _ = await llm.extract_claims("x")
    assert len(seen) == 2 and len(claims) == 1

    seen = []
    llm = make_llm([completion("nope"), completion("still nope")], seen)
    with pytest.raises(ValueError, match="invalid JSON"):
        await llm.extract_claims("x")
    assert len(seen) == 2


async def test_judge_parses_verdict_and_pads_stances():
    seen = []
    verdict = {"verdict": "outdated", "confidence": 1.4, "current_value": "$25",
               "explanation": "Source 1 says $25.", "stances": ["contradicts", "bogus"]}
    llm = make_llm([completion(json.dumps(verdict))], seen)
    claim = Claim(id="c1", text="The Pro plan costs $20.", start=0, end=23, category="pricing",
                  time_sensitive=True, volatility="high", risk_reason="", search_query="")
    evidence = [Evidence(title="t", url="https://example.com/a", snippet="s",
                         published_date=None, score=0.9) for _ in range(3)]
    judgement, call = await llm.judge(claim, evidence, "It is $25.", "2026-11-14")
    assert judgement.verdict == "outdated"
    assert judgement.confidence == 1.0
    assert judgement.stances == ["contradicts", "neutral", "neutral"]
    assert call.stage == "judge" and call.requested == "groq/openai/gpt-oss-120b"


async def test_http_error_raises_without_secret():
    def handler(request):
        return httpx.Response(401, json={"error": "bad key"})

    llm = BifrostLLM(Settings(bifrost_api_key="sk-secret"), transport=httpx.MockTransport(handler))
    with pytest.raises(RuntimeError) as err:
        await llm.extract_claims("x")
    assert "401" in str(err.value) and "sk-secret" not in str(err.value)


async def test_json_wrapped_in_prose_is_parsed():
    seen = []
    llm = make_llm([completion(f"Here is the result: {json.dumps(CLAIMS)} Hope that helps.")], seen)
    claims, _ = await llm.extract_claims("x")
    assert len(claims) == 1


async def test_extract_prompt_carries_today():
    seen = []
    await make_llm([completion(json.dumps(CLAIMS))], seen).extract_claims("x")
    user = json.loads(seen[0].content)["messages"][1]["content"]
    assert user.startswith("Today: 20")


async def test_http_error_includes_server_message():
    def handler(request):
        return httpx.Response(401, json={"error": {"message": "invalid api key sk-secret"}})

    llm = BifrostLLM(Settings(bifrost_api_key="sk-secret"), transport=httpx.MockTransport(handler))
    with pytest.raises(RuntimeError) as err:
        await llm.extract_claims("x")
    assert str(err.value) == "Bifrost request failed: HTTP 401: invalid api key ***"


async def test_unreachable_gateway_names_the_url():
    def handler(request):
        raise httpx.ConnectError("refused")

    llm = BifrostLLM(Settings(), transport=httpx.MockTransport(handler))
    with pytest.raises(RuntimeError, match=r"Cannot reach the Bifrost gateway at http://127\.0\.0\.1:8080"):
        await llm.extract_claims("x")
