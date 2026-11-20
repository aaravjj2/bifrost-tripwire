# Failed and interrupted validation runs

Failures remain visible in the repository's workflow history. They are excluded
from the passing-trial totals.

| Workflow run | Result and correction |
| --- | --- |
| 44651192284 | The first native trial timed out. Its diagnostics were insufficient, so event journals and gateway error logging were added. |
| 44690554478 and 44691517402 | Native requests could not resolve the provider. The native HTTP route selects the provider from the model prefix; a JSON `provider` field does not perform that selection. |
| 44691963918 | Governance rejected the custom local model. The configuration was changed to explicitly list that model on the provider key and virtual-key scope. |
| 44692345202 | Both A calls were denied and B completed, but successful arrivals did not join to gateway requests. The adapter now carries correlation through Bifrost's documented forwarding header, which survives HTTP request parsing. |
| 44693468654 | All three native/local-model trials passed. The subsequent stock-comparison model startup failed. |
| 44769334013 | Cancelled after identifying port 4190 as a Fetch-blocked port. The comparison uses port 4191. |

The source machine also blocked execution of the full Windows HTTP host through
application control. That host compiled, including a Go-only SQLite variant,
but is not claimed as a verified Windows runtime. The Windows video uses the
separately verified embedded Bifrost engine. Linux is the native-plugin proof
environment.

These failures do not justify a measured zero. Only the independent recorder's
covered request windows enter passing receipts. Positive B arrivals are also
required, which exposed the missing-correlation failure.
