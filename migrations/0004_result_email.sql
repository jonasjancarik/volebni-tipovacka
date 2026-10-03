-- Tippers may ask to be e-mailed their placing once the votes are counted. Only for them the address
-- is kept, next to the hash: on the confirmation link until it is used, then on the account until the
-- result e-mail leaves. After that it is cleared and only the hash remains.
ALTER TABLE users ADD COLUMN notify_email TEXT;
ALTER TABLE magic_links ADD COLUMN notify_email TEXT;
