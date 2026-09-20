Create execution-plan.json as raw JSON, without Markdown fences. Replace every
example value with real project data; add one task for each tasks.md checkbox.
Use literal paths, not globs. Directory write scopes cover their descendants.
Read ranges are inclusive and one-based. "reads" may be empty for a task whose
full specification is already captured in its instructions and acceptance.

{
"version": 1,
"change": "change-name",
"baseRevision": "<full output of git rev-parse HEAD>",
"budget": {
"maxParallel": 2,
"maxAttempts": 2,
"maxTokens": 60000,
"overheadTokens": 0,
"maxPacketChars": 16000,
"maxOutputTokens": 1500
},
"tasks": [
{
"id": "1.1",
"title": "One bounded implementation",
"instructions": "Implement the specified behavior using the established interface.",
"dependsOn": [],
"risk": "low",
"tier": "cheap",
"status": "pending",
"attempts": 0,
"estimatedTokens": 6000,
"chargedTokens": 0,
"reads": [],
"writes": ["src/example.js"],
"checks": ["npm test -- example"],
"acceptance": ["The concrete scenario from the spec passes"],
"reviewed": false,
"evidence": []
}
]
}

Budget units are estimated total tokens, not dollars. Include tool interaction,
retries, and main-agent/reviewer overhead. A failed attempt still costs tokens.
Use actual provider usage when available; otherwise book at least the reserved
estimate and note the uncertainty in the parent report. The helper enforces
scheduling reservations, not a provider billing cap or runtime sandbox.
