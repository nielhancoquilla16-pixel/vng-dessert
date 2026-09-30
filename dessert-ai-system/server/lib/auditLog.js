const trimToLength = (value = "", maxLength = 1000) => (
  String(value || "").slice(0, maxLength)
);

const getClientIp = (req) => (
  String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
);

export const writeAuditLog = async (supabase, req, {
  action,
  actorId = null,
  actorRole = null,
  targetId = null,
  targetType = null,
  metadata = {},
} = {}) => {
  if (!action) {
    return;
  }

  try {
    const { error } = await supabase
      .from("audit_logs")
      .insert({
        actor_id: actorId,
        actor_role: actorRole,
        action,
        target_id: targetId,
        target_type: targetType,
        ip_address: trimToLength(getClientIp(req), 120),
        user_agent: trimToLength(req.headers["user-agent"], 500),
        metadata,
      });
    if (error) {
      console.warn("Audit log write failed:", error.message || error);
      return false;
    }
    return true;
  } catch (error) {
    // Audit logging should never break the user-facing request.
    console.warn("Audit log write failed:", error.message || error);
    return false;
  }
};
