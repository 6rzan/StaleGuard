"""BifrostLLM: chat completions through the Bifrost gateway (OpenAI-compatible)."""

import json
import re
import time
from collections.abc import Callable

import httpx
from pydantic import ValidationError

from . import prompts
from .config import Settings
from .models import Claim, Evidence, Judgement, ModelCall, RawClaim

STANCES = ("supports", "contradicts", "neutral")
FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def parse_json(content: str) -> dict:
    fenced = FENCE.search(content)
    data = json.loads(fenced.group(1) if fenced else content)
    if not isinstance(data, dict):
        raise ValueError("expected a JSON object")
    return data


def served_by(requested: str, data: dict) -> tuple[str, bool]:
    """Which provider/model answered, and whether it was a fallback.

    Bifrost reports this in extra_fields.routing_info; fall back to the response model field.
    """
    extra = data.get("extra_fields")
    extra = extra if isinstance(extra, dict) else {}
    routing = extra.get("routing_info")
    routing = routing if isinstance(routing, dict) else {}
    provider = routing.get("provider") or extra.get("provider")
    model = routing.get("model") or data.get("model")
    if not model:
        served = requested
    elif "/" in model:
        served = model
    elif provider:
        served = f"{provider}/{model}"
    elif requested.split("/", 1)[-1] == model:
        served = requested
    else:
        served = model
    is_fallback = routing.get("is_fallback")
    if not isinstance(is_fallback, bool):
        is_fallback = served != requested
    return served, is_fallback


class BifrostLLM:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport
        self.headers = {}
        if settings.bifrost_api_key:
            self.headers["Authorization"] = f"Bearer {settings.bifrost_api_key}"
        if settings.bifrost_virtual_key:
            self.headers["x-bf-vk"] = settings.bifrost_virtual_key

    async def _chat(self, stage: str, model: str, messages: list[dict], parse: Callable):
        body = {
            "model": model,
            "messages": messages,
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        if self.settings.model_fallbacks:
            body["fallbacks"] = self.settings.model_fallbacks
        async with httpx.AsyncClient(
            base_url=self.settings.bifrost_base_url,
            headers=self.headers,
            timeout=60,
            transport=self.transport,
        ) as client:
            for attempt in range(2):
                started = time.perf_counter()
                response = await client.post("/v1/chat/completions", json=body)
                if response.status_code != 200:
                    raise RuntimeError(f"Bifrost request failed: HTTP {response.status_code}")
                data = response.json()
                usage = data.get("usage") or {}
                served, is_fallback = served_by(model, data)
                call = ModelCall(
                    stage=stage,
                    requested=model,
                    served_by=served,
                    is_fallback=is_fallback,
                    prompt_tokens=int(usage.get("prompt_tokens") or 0),
                    completion_tokens=int(usage.get("completion_tokens") or 0),
                    latency_ms=round((time.perf_counter() - started) * 1000),
                )
                try:
                    content = data["choices"][0]["message"]["content"]
                    return parse(parse_json(content)), call
                except (KeyError, IndexError, TypeError, ValueError, ValidationError):
                    if attempt:
                        raise ValueError(f"{model} returned invalid JSON for {stage}") from None

    async def extract_claims(self, answer: str) -> tuple[list[RawClaim], ModelCall]:
        def parse(data: dict) -> list[RawClaim]:
            items = data["claims"]
            if not isinstance(items, list):
                raise ValueError("claims must be a list")
            claims = []
            for item in items:
                try:
                    claims.append(RawClaim.model_validate(item))
                except ValidationError:
                    continue  # one malformed claim should not discard the rest
            return claims

        return await self._chat(
            "extract", self.settings.model_extract, prompts.extract_messages(answer), parse
        )

    async def judge(
        self, claim: Claim, evidence: list[Evidence], search_answer: str | None, today: str
    ) -> tuple[Judgement, ModelCall]:
        def parse(data: dict) -> Judgement:
            raw = data.get("stances")
            raw = raw if isinstance(raw, list) else []
            stances = [s if s in STANCES else "neutral" for s in raw[: len(evidence)]]
            stances += ["neutral"] * (len(evidence) - len(stances))
            confidence = min(max(float(data.get("confidence") or 0), 0.0), 1.0)
            return Judgement.model_validate(data | {"stances": stances, "confidence": confidence})

        messages = prompts.judge_messages(claim, evidence, search_answer, today)
        return await self._chat("judge", self.settings.model_judge, messages, parse)
