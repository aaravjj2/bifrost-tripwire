# Verified hackathon resources

Checked the authenticated participant Resources tab, organizer announcements,
the public FAQ, and the detailed contributor-track brief on November 19, 2026.

| Resource | Availability and use |
| --- | --- |
| Tavily participant credits | 8,000 API credits per eligible participant. Redeem `GEEKROOM2` in a Tavily account before November 28, 2026. These credits support Tavily's web search and research services. |
| Bifrost repository and documentation | Gateway source, provider configuration, supported interfaces, and examples. These are already used by the pinned Tripwire build. |
| Workshop | The announcements link the Geek Room YouTube channel for the November 5 Bifrost workshop. |
| Detailed extension brief | Requires an operator problem, public extension points, reproducible standard-Bifrost integration, tests, documentation, and a repository suitable for an upstream contribution. |

[Participant resources](https://hackculture.io/my-events/manage/6afe2f420f65bae76987ce56) ·
[Public FAQ and challenge](https://hackculture.io/hackathons/ai-global-hackathon) ·
[Bifrost source](https://github.com/maximhq/bifrost) ·
[Tavily documentation](https://docs.tavily.com/) ·
[Workshop channel](https://www.youtube.com/@GeekRoom-ftw)

Hosted LLM credits remain unconfirmed. Tavily's documented keyless Search/Extract
endpoint was tested, and returned `daily_cap_reached`. Coupon redemption requires
the participant's Tavily account. [Keyless API documentation](https://docs.tavily.com/documentation/keyless)

## Account and redemption result

On November 19, the signed-in Tavily dashboard rejected `GEEKROOM2` with
“This coupon has reached its maximum number of redemptions.” No bonus credits
were added. The supplied API key authenticated successfully. The usage API
reported the Researcher plan with a 1,000-credit monthly allowance and zero
credits used before this project's resource searches.

The key is saved only in the ignored `.local/tavily.env` file. It is never sent
to the browser UI, model workers, event stream, source catalog, or trial receipts.
The command does not alter the plan or enable pay-as-you-go.
[Account dashboard](https://app.tavily.com/home) ·
[Usage API](https://docs.tavily.com/documentation/api-reference/endpoint/usage)

## Repeatable resource research

From `tripwire/`, run `npm run resources`, or
`node --env-file=.local/tavily.env server/resources.js` with Node 24 directly.
It searches three focused topics with
the supplied key, restricts results to publisher documentation, and saves titles
and source URLs to `resources/catalog.json`. It uses up to three basic-search
credits, checks that the monthly allowance has room, and reuses a daily cache.
Use `npm run resources -- --refresh` for a deliberate refresh.

The checked-in [design notes](DESIGN.md) and
[saved reference list](DESIGN.md#references-studied)
retain the requested galleries. Geist and Lucide are self-hosted with their
licenses. Three.js geometry and motion are authored locally. Gallery examples
are inspiration references, with no third-party site assets copied into the app.
The resource search is a development command and consumes no credits when a
demo runs.

The first authenticated research pass used three credits. A repeated invocation
returned the cached catalog without another search. Official reference pages for
the shipped animation are [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html),
[resource disposal](https://threejs.org/manual/en/cleanup.html), and the
[View Transitions specification](https://drafts.csswg.org/css-view-transitions-1/).

## Submission timing

The November 17 organizer announcement asks for the final form before November 21,
2026, including teams that have submitted on the platform. The prototype phase
lists November 21 at 11:59 PM with no explicit timezone. The overall event's
November 29 header also spans judging. Keep the PRD's November 21, 10 AM ET
internal target until the submission timezone is confirmed.

[Organizer announcements](https://hackculture.io/my-events/manage/6afe2f420f65bae76987ce56?tab=announcements) ·
[Final submission form](https://forms.gle/8fafao1ymEpihgKd9)

## Additional free local model tooling

Tripwire can run real model calls locally using llama.cpp and a 135M-parameter
SmolLM2 instruct model. The runner and weights stay under `.local/`.
The setup script verifies both downloads' SHA-256 digests.

- Runner is llama.cpp release `b12359`, Windows CPU build. Archive SHA-256 is
  `837c1655e87df3b66989f4be33a792a1399c785bf259038dc75c900096683e69`.
  [Official release](https://github.com/ggml-org/llama.cpp/releases/tag/b12359)
- Model is TensorBlock's GGUF conversion of SmolLM2-135M-Instruct,
  `Q3_K_M`, revision `32db44d69cedb731dc0fc96f60e01a86c6f5919d`.
  SHA-256 is `61c69fc5ce91982e26c625d43be5c3c7f0f774da22f4fa4e45c37a80a22ddad4`.
  The model card declares Apache-2.0.
  [Quantized model](https://huggingface.co/tensorblock/SmolLM2-135M-Instruct-GGUF) ·
  [Original model family](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct)
