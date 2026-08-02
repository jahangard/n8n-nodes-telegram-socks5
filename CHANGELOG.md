# Changelog

Maintained by Mehdi Jahangard (mehdi.jahangard@gmail.com).

This file follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## [1.0.0] - Unreleased

### Added
- `sendMessage` operation with support for `parse_mode`, `reply_to_message_id`, `disable_notification`, `protect_content`
- `sendPhoto` and `sendDocument` operations from a URL, `file_id`, or a Binary Property
- Dedicated `telegramSocks5Api` credential with SOCKS5 and HTTP proxy support
- Axios-based transport layer with `socks-proxy-agent` / `https-proxy-agent`
- Standard error handling mapped to `NodeApiError`
