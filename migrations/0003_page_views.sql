-- Anonymous traffic counts. Each row is a running total for one day, page and referring site;
-- nothing about the individual visitor (address, browser, identifier) is stored.
CREATE TABLE page_views (
  day TEXT NOT NULL,              -- 'YYYY-MM-DD' in Prague time
  path TEXT NOT NULL,             -- '/', '/pravidla', '/tip/kv-554782', …
  referrer TEXT NOT NULL,         -- host the visitor arrived from; '' when unknown or when moving within the site
  views INTEGER NOT NULL,
  visits INTEGER NOT NULL,        -- views that were the first page of a visit
  PRIMARY KEY (day, path, referrer)
);
