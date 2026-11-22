-- BRAND NEW disposable local database only. No hosted database connection.
\set ON_ERROR_STOP on
\ir founder-bootstrap.sql
\ir ../supabase/migrations/20261122191439_marketing_leads.sql
