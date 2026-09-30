# Customer support chat

Run `node --test tests/ai/*.test.mjs tests/shop-hours/backend.test.mjs tests/shop-hours/midnight.test.mjs` from the repository root. These tests use local fixtures; they do not call Groq or change the live database.

Apply `supabase/migrations/add_shop_customer_support.sql` to the deployment database, then populate **Shop Settings → Public Customer Support Information** as an administrator. Blank fields remain unavailable. The migration adds an empty JSON field without seeding ownership claims or discounts. Ordinary hours/address saves and chat still work before the migration; saving the new support fields requires it.

Discounts and promotions are published policy text, including eligibility and offer dates. They do not alter checkout pricing. This project has no automatic discount rule engine. Keep the published information current; the assistant repeats the configured policy and never calculates or promises an unconfigured percentage.

Both `/api/ai` and `/api/chat-messages` accept `message` or `content`, optional `history` (user/assistant messages), and optional `productId`. The server reloads public catalog/shop information for each request. Client `menuContext` is no longer trusted as business data. History is bounded and used for topic/product references, never as authority for business facts.

With `GROQ_API_KEY`, deterministic handlers cover known shop intents and Llama answers other general customer questions, casual conversation, simple math, and writing requests directly. Llama receives only public shop settings and catalog facts. It must not invent shop details or claim access to live information, orders, accounts, payments, or internal recipes. Product questions never access private orders, account records, production recipes, or internal ingredient quantities. Public products currently have no verified ingredient/allergen field, so ingredient questions ask the customer to confirm with the shop. If the model service is unavailable, deterministic handlers still answer supported shop questions and unknown questions use a safe fallback.
