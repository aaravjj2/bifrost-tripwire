# Demonstration media

`tripwire-demo.mp4` is a 90-second, 1920 × 1080 recording of the working Windows
application with embedded Bifrost and real local SmolLM2 inference. It contains
the original opening animation, start, stop, refresh recovery, both denial
inspectors, B completion and a receipt download. Browser frames were captured
chronologically. The gap between capture batches was removed, and the final
result remains visible at the end. Captions identify the actions.

The filmed run is `run-08084525-b6c0-48af-8999-e58e12c149fb`. Its server-generated
receipt is `evidence/windows-live-receipt.json`. It records two denied A requests,
zero matching measured arrivals, 14 later B arrivals and B completion. The filmed
stop occurs later than the drained-boundary native trials, so the continuation
count differs.

`console.jpg` is a settled browser screenshot from that same run. It is original
project evidence. Credentials, prompts and model responses are absent from the
recording and receipts.
