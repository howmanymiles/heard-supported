-- Where the client lives, as the postcode district only (the first half: "G41"), for
-- figures by area. The full postcode is not kept.
alter table claimants add column postcode_district text check (postcode_district ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?$');
create index claimants_district on claimants (agency_id, postcode_district);
