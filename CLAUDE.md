# Armies & Magic — Project Guidelines

## Debugging

When debugging issues, check the simplest root causes first (missing env vars, wrong API keys, missing fields in API calls) before exploring complex hypotheses. Avoid spending multiple rounds on prompt-engineering or architectural changes when the bug might be a missing parameter.

## Database (Supabase)

This project uses Supabase with RLS policies. When writing queries:
1. Use service role key for admin operations
2. Check FK join syntax carefully — `profiles` is NOT FK-linked to `auctions` or `auction_bids`, use separate lookups instead of join syntax like `profiles!fk_name`
3. Verify column names exist before querying
4. Always handle RLS permission errors explicitly
5. All mutations go through `service_role` API routes, bypassing RLS

## Browser Compatibility

This project targets Chrome as the primary browser, but must also fonctionner sur Safari. When making CSS/visual changes:
1. Avoid complex stacking contexts — keep related z-index elements in the same context
2. Test transparency/backdrop-filter assumptions
3. `position: fixed` can solve stacking issues Safari handles differently
4. `overflow: hidden` can clip hover zoom effects — be careful with scaled elements

## Quality Checks

After implementing features, verify the happy path works before committing. For card game features: test that new players see correct cards, that keywords/effects resolve properly, and that UI state syncs with game engine state.
