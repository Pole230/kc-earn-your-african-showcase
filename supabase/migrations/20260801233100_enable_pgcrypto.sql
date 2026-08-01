-- Enable pgcrypto extension for gen_random_uuid() used in migrations
CREATE EXTENSION IF NOT EXISTS pgcrypto;
