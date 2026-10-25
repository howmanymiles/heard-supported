-- Adult Disability Payment (Social Security Scotland) as a third benefit. It is assessed
-- on the same 12 activities as PIP, so it shares PIP's tables and activity keys.
alter table cases drop constraint if exists cases_benefit_check;
alter table cases add constraint cases_benefit_check check (benefit in ('pip', 'adp', 'uc-wca'));
