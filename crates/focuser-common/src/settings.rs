//! Shared setting keys and default values.

/// Setting key controlling whether browsers without the extension are terminated.
pub const SETTING_BLOCK_UNSUPPORTED_BROWSERS: &str = "block_unsupported_browsers";

/// Setting key controlling the grace period before browser enforcement.
pub const SETTING_EXTENSION_GRACE_PERIOD: &str = "extension_grace_period";

/// Default browser enforcement behavior.
pub const DEFAULT_BLOCK_UNSUPPORTED_BROWSERS: bool = false;

/// Default browser enforcement grace period, in seconds.
pub const DEFAULT_EXTENSION_GRACE_PERIOD_SECS: u64 = 60;
