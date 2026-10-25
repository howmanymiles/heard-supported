-- At sign-up an agency declares that it doesn't charge claimants or take a share of
-- their awards; Heard & Supported is not for organisations that do.
alter table agencies add column no_claimant_fees_declared_at timestamptz;
