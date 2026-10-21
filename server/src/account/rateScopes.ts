/**
 * Rate-limit scopes that name an account rather than an address or an IP.
 *
 * A constant of its own because two places must agree on it: the limiter that
 * writes the counter and `Db.deleteUser`, which has to erase it with the
 * account it is keyed by.
 */
export const EMAIL_CHANGE_RATE_SCOPE = 'email_change:user';
