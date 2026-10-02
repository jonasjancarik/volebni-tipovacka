-- Clears test tips, accounts and imported results from the local database.
DELETE FROM tips; DELETE FROM sessions; DELETE FROM magic_links; DELETE FROM users;
UPDATE races SET counted_pct = NULL, turnout = NULL, final = 0, winner = NULL, results_at = NULL;
UPDATE options SET pct = NULL;
