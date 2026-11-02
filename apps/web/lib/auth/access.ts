// Weryfikacja Cloudflare Access żyje w @planer/core (używa jej też serwer sync).
export {
  ACCESS_COOKIE,
  ACCESS_HEADER,
  type AccessConfig,
  type AccessResult,
  readAccessConfig,
  USER_EMAIL_HEADER,
  verifyAccessToken,
} from '@planer/core/access'
