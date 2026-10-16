/** The secret scrubber lives in @godeye/core so the UI's prompt firewall uses the same rules. */
export { findSecrets, SECRET_PATTERNS, scrub, scrubDeep } from "@godeye/core";
