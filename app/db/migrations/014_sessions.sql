-- Idle timeout: when each person last did something. Sessions with no activity for 30
-- minutes, or older than 8 hours, have to sign in again.
alter table users add column last_active_at timestamptz;
-- Whether the last sign-in used a second step (from Microsoft's amr claim), so admins can see it.
alter table users add column last_sign_in_mfa boolean;
