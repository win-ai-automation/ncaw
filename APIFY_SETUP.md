# Optional Apify extraction

Workflow 01 can use a different Apify actor for each supported platform. It automatically falls back to Jina Reader when no actor is configured or no usable content is returned.

1. Add actor IDs such as `owner/actor-name` to the `APIFY_ACTOR_*` variables in the application environment. Do not put the Apify API token in these variables.
2. Re-import `workflows/01-content-intake.json` in n8n.
3. Create an n8n **Header Auth** credential named `Netfintax - Apify`:
   - Header: `Authorization`
   - Value: `Bearer YOUR_APIFY_API_TOKEN`
4. Select this credential in the **Extract with Apify** node and publish the workflow.
5. Test every configured actor with a real public URL. Actor inputs and outputs can differ. The normalization node accepts common `transcript`, `videoTranscript`, `text`, `caption`, `postText`, `description`, `articleBody`, `content`, and `body` fields.

If every `APIFY_ACTOR_*` variable is blank, the workflow behaves as before and uses Jina Reader.
