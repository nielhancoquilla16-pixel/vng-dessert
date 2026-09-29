import express from "express";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  getProfileAvatarUrl,
  removeManagedProfileImage,
  resolveProfileImageValue,
} from "../lib/profileImages.js";
import { validatePasswordPolicy } from "../lib/passwordPolicy.js";
import { getPhoneNumberValidationMessage } from "../lib/phoneNumber.js";
import { writeAuditLog } from "../lib/auditLog.js";
import {
  getCustomerAddressValidationError,
  mapCustomerAddress,
  normalizeCustomerAddressInput,
  syncProfileDefaultAddress,
} from "../lib/customerAddresses.js";

const router = express.Router();

const normalizeValue = (value = "") => String(value || "").trim().toLowerCase();
const normalizeOptionalValue = (value = "") => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const getRequestBaseUrl = (req) => `${req.protocol}://${req.get("host")}`;
const ACTIVE_ADDRESS_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out-for-delivery",
  "processing",
  "received",
  "delivered",
]);

const mapProfile = (row, authUser = null) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  address: row.address,
  phoneNumber: row.phone_number,
  avatarUrl: getProfileAvatarUrl(authUser),
  termsAccepted: Boolean(row.terms_accepted ?? authUser?.user_metadata?.terms_accepted),
  termsAcceptedAt: row.terms_accepted_at || authUser?.user_metadata?.terms_accepted_at || null,
  termsVersion: row.terms_version || authUser?.user_metadata?.terms_version || null,
  emailVerified: Boolean(row.email_verified || authUser?.email_confirmed_at),
  emailVerifiedAt: row.email_verified_at || authUser?.email_confirmed_at || null,
  lastLoginAt: row.last_login_at || null,
  createdAt: row.created_at,
});

const getAuthUserById = async (supabase, userId) => {
  const {
    data: { user },
    error,
  } = await supabase.auth.admin.getUserById(userId);

  if (error) {
    throw error;
  }

  return user || null;
};

const listUsersById = async (supabase) => {
  const userMap = new Map();
  let page = 1;
  let keepLoading = true;

  while (keepLoading) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const users = data?.users || [];
    users.forEach((user) => {
      userMap.set(user.id, user);
    });

    keepLoading = users.length === 200;
    page += 1;
  }

  return userMap;
};

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const authUser = await getAuthUserById(supabase, req.authUser.id);

    if (!req.profile) {
      const { data, error } = await supabase
        .from("profiles")
        .insert({
          id: req.authUser.id,
          username: req.authUser.user_metadata?.username || null,
          email: req.authUser.email || null,
          full_name: req.authUser.user_metadata?.full_name || null,
          role: "customer",
          address: null,
          phone_number: null,
          terms_accepted: Boolean(req.authUser.user_metadata?.terms_accepted),
          terms_accepted_at: req.authUser.user_metadata?.terms_accepted_at || null,
          terms_version: req.authUser.user_metadata?.terms_version || null,
          email_verified: Boolean(authUser?.email_confirmed_at || req.authUser.email_confirmed_at),
          email_verified_at: authUser?.email_confirmed_at || req.authUser.email_confirmed_at || null,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return res.json(mapProfile(data, authUser || req.authUser));
    }

    res.json(mapProfile(req.profile, authUser || req.authUser));
  } catch (error) {
    next(error);
  }
});

router.put("/me", requireAuth, async (req, res, next) => {
  try {
    const profileRole = req.profile?.role || "customer";
    if (profileRole === "customer") {
      const currentPhoneNumber = req.body.phone_number ?? req.profile?.phone_number ?? "";
      const phoneNumberError = getPhoneNumberValidationMessage(currentPhoneNumber);
      if (phoneNumberError) {
        return res.status(400).json({ error: phoneNumberError });
      }
    }

    const supabase = getSupabaseAdmin();
    const currentAuthUser = await getAuthUserById(supabase, req.authUser.id);
    const currentAvatarUrl = getProfileAvatarUrl(currentAuthUser || req.authUser);
    const hasAvatarUpdate = Object.prototype.hasOwnProperty.call(req.body || {}, "avatar_url");
    const username = req.body.username
      ? normalizeValue(req.body.username)
      : (req.profile?.username ?? currentAuthUser?.user_metadata?.username ?? req.authUser.user_metadata?.username ?? null);
    const fullName = req.body.full_name ?? req.profile?.full_name ?? currentAuthUser?.user_metadata?.full_name ?? req.authUser.user_metadata?.full_name ?? null;
    const avatarUrl = hasAvatarUpdate
      ? await resolveProfileImageValue({
          imageInput: req.body.avatar_url,
          userId: req.authUser.id,
          requestBaseUrl: getRequestBaseUrl(req),
          previousValue: currentAvatarUrl,
        })
      : currentAvatarUrl;

    const updates = {
      id: req.authUser.id,
      username,
      email: req.profile?.email ?? req.authUser.email ?? null,
      full_name: fullName,
      role: req.profile?.role || "customer",
      address: normalizeOptionalValue(req.body.address ?? req.profile?.address ?? ""),
      phone_number: normalizeOptionalValue(req.body.phone_number ?? req.profile?.phone_number ?? ""),
    };

    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(req.authUser.id, {
      user_metadata: {
        ...req.authUser.user_metadata,
        username: username || "",
        full_name: fullName || "",
        avatar_url: avatarUrl || "",
      },
    });

    if (authUpdateError) {
      throw authUpdateError;
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert(updates, { onConflict: "id" })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "address")) {
      try {
        await syncProfileDefaultAddress(supabase, data);
      } catch (addressError) {
        // Keep a failed address save retryable without reporting success.
        let restoreQuery = supabase
          .from("profiles")
          .update({ address: req.profile?.address || null })
          .eq("id", req.authUser.id);
        restoreQuery = updates.address == null
          ? restoreQuery.is("address", null)
          : restoreQuery.eq("address", updates.address);
        const { error: restoreError } = await restoreQuery;
        if (restoreError) console.error("Unable to restore profile address:", restoreError);
        throw addressError;
      }
    }

    const updatedAuthUser = await getAuthUserById(supabase, req.authUser.id);
    res.json(mapProfile(data, updatedAuthUser || {
      ...currentAuthUser,
      ...req.authUser,
      user_metadata: {
        ...(currentAuthUser?.user_metadata || {}),
        ...(req.authUser.user_metadata || {}),
        username: username || "",
        full_name: fullName || "",
        avatar_url: avatarUrl || "",
      },
    }));
  } catch (error) {
    next(error);
  }
});

const syncProfileWithDefaultAddress = async (supabase, userId, address) => {
  if (!address) {
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      address: address.formatted_address || null,
      phone_number: address.phone_number || null,
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }
};

const getOwnedAddress = async (supabase, userId, addressId) => {
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("id", addressId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const clearDefaultAddress = async (supabase, userId, excludedAddressId = null) => {
  let query = supabase
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);

  if (excludedAddressId) {
    query = query.neq("id", excludedAddressId);
  }

  const { error } = await query;
  if (error) {
    throw error;
  }
};

router.get("/me/addresses", requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("user_id", req.authUser.id)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    res.json((data || []).map(mapCustomerAddress));
  } catch (error) {
    next(error);
  }
});

router.post("/me/addresses", requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const payload = normalizeCustomerAddressInput(req.body || {});
    const validationError = getCustomerAddressValidationError(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { data: currentDefault, error: defaultError } = await supabase
      .from("customer_addresses")
      .select("id")
      .eq("user_id", req.authUser.id)
      .eq("is_default", true)
      .maybeSingle();

    if (defaultError) {
      throw defaultError;
    }

    const shouldBeDefault = payload.is_default || !currentDefault;
    if (shouldBeDefault) {
      await clearDefaultAddress(supabase, req.authUser.id);
    }

    const { data, error } = await supabase
      .from("customer_addresses")
      .insert({
        ...payload,
        user_id: req.authUser.id,
        is_default: shouldBeDefault,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    if (data.is_default) {
      await syncProfileWithDefaultAddress(supabase, req.authUser.id, data);
    }

    await writeAuditLog(supabase, req, {
      action: "customer_address_created",
      actorId: req.authUser.id,
      actorRole: req.profile?.role,
      targetId: data.id,
      targetType: "customer_address",
    });

    res.status(201).json(mapCustomerAddress(data));
  } catch (error) {
    next(error);
  }
});

router.patch("/me/addresses/:addressId", requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentAddress = await getOwnedAddress(supabase, req.authUser.id, req.params.addressId);
    if (!currentAddress) {
      return res.status(404).json({ error: "Saved address not found." });
    }

    const payload = normalizeCustomerAddressInput({
      ...currentAddress,
      ...(req.body || {}),
      isDefault: req.body?.isDefault ?? req.body?.is_default ?? currentAddress.is_default,
    });
    // A default can be replaced by another saved address, but never silently removed.
    payload.is_default = payload.is_default || currentAddress.is_default;
    const validationError = getCustomerAddressValidationError(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (payload.is_default) {
      await clearDefaultAddress(supabase, req.authUser.id, currentAddress.id);
    }

    const { data, error } = await supabase
      .from("customer_addresses")
      .update(payload)
      .eq("id", currentAddress.id)
      .eq("user_id", req.authUser.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    if (data.is_default) {
      await syncProfileWithDefaultAddress(supabase, req.authUser.id, data);
    }

    await writeAuditLog(supabase, req, {
      action: "customer_address_updated",
      actorId: req.authUser.id,
      actorRole: req.profile?.role,
      targetId: data.id,
      targetType: "customer_address",
    });

    res.json(mapCustomerAddress(data));
  } catch (error) {
    next(error);
  }
});

router.post("/me/addresses/:addressId/default", requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentAddress = await getOwnedAddress(supabase, req.authUser.id, req.params.addressId);
    if (!currentAddress) {
      return res.status(404).json({ error: "Saved address not found." });
    }

    await clearDefaultAddress(supabase, req.authUser.id, currentAddress.id);
    const { data, error } = await supabase
      .from("customer_addresses")
      .update({ is_default: true })
      .eq("id", currentAddress.id)
      .eq("user_id", req.authUser.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await syncProfileWithDefaultAddress(supabase, req.authUser.id, data);
    await writeAuditLog(supabase, req, {
      action: "customer_address_set_default",
      actorId: req.authUser.id,
      actorRole: req.profile?.role,
      targetId: data.id,
      targetType: "customer_address",
    });

    res.json(mapCustomerAddress(data));
  } catch (error) {
    next(error);
  }
});

router.delete("/me/addresses/:addressId", requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const currentAddress = await getOwnedAddress(supabase, req.authUser.id, req.params.addressId);
    if (!currentAddress) {
      return res.status(404).json({ error: "Saved address not found." });
    }

    const { data: linkedOrders, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_status")
      .eq("user_id", req.authUser.id)
      .eq("delivery_address_id", currentAddress.id);

    if (ordersError) {
      throw ordersError;
    }

    const hasActiveOrder = (linkedOrders || []).some((order) => (
      ACTIVE_ADDRESS_ORDER_STATUSES.has(String(order.order_status || "").toLowerCase())
    ));
    if (hasActiveOrder) {
      return res.status(409).json({
        error: "This address is being used by an active order and cannot be deleted yet.",
      });
    }

    const { error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", currentAddress.id)
      .eq("user_id", req.authUser.id);

    if (error) {
      throw error;
    }

    if (currentAddress.is_default) {
      const { data: replacement, error: replacementError } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("user_id", req.authUser.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (replacementError) {
        throw replacementError;
      }

      if (replacement) {
        const { data: defaultAddress, error: setDefaultError } = await supabase
          .from("customer_addresses")
          .update({ is_default: true })
          .eq("id", replacement.id)
          .select("*")
          .single();

        if (setDefaultError) {
          throw setDefaultError;
        }
        await syncProfileWithDefaultAddress(supabase, req.authUser.id, defaultAddress);
      } else {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ address: null, phone_number: null })
          .eq("id", req.authUser.id);

        if (profileError) {
          throw profileError;
        }
      }
    }

    await writeAuditLog(supabase, req, {
      action: "customer_address_deleted",
      actorId: req.authUser.id,
      actorRole: req.profile?.role,
      targetId: currentAddress.id,
      targetType: "customer_address",
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/staff", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const [{ data, error }, authUsersById] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .in("role", ["admin", "staff"])
        .order("created_at", { ascending: false }),
      listUsersById(supabase),
    ]);

    if (error) {
      throw error;
    }

    res.json((data || []).map((row) => mapProfile(row, authUsersById.get(row.id))));
  } catch (error) {
    next(error);
  }
});

router.post("/staff", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const {
      email,
      password,
      username,
      full_name,
      role = "staff",
      address = null,
      phone_number = null,
      avatar_url = null,
    } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: "email, password, and username are required." });
    }

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    if (!["staff", "admin"].includes(role)) {
      return res.status(400).json({ error: "role must be staff or admin." });
    }

    const normalizedEmail = normalizeValue(email);
    const normalizedUsername = normalizeValue(username);
    const supabase = getSupabaseAdmin();
    const provisionalUserId = randomUUID();
    const avatarUrl = await resolveProfileImageValue({
      imageInput: avatar_url,
      userId: provisionalUserId,
      requestBaseUrl: getRequestBaseUrl(req),
      previousValue: "",
    });

    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: normalizedUsername,
        full_name: full_name || "",
        role,
        avatar_url: avatarUrl || "",
        email_verified: true,
      },
    });

    if (createError) {
      throw createError;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: createdUser.user.id,
        username: normalizedUsername,
        email: normalizedEmail,
        full_name: full_name || "",
        role,
        address: normalizeOptionalValue(address),
        phone_number: normalizeOptionalValue(phone_number),
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (profileError) {
      throw profileError;
    }

    await writeAuditLog(supabase, req, {
      action: `${role}_account_created`,
      actorId: req.authUser.id,
      actorRole: req.profile?.role,
      targetId: profile.id,
      targetType: "profile",
      metadata: {
        email: normalizedEmail,
        username: normalizedUsername,
        role,
      },
    });

    res.status(201).json(mapProfile(profile, createdUser.user));
  } catch (error) {
    next(error);
  }
});

router.post("/staff/:id/reset-password", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const password = String(req.body?.password ?? "");

    if (!password.trim()) {
      return res.status(400).json({ error: "A new password is required." });
    }

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    const supabase = getSupabaseAdmin();
    const { data: managedProfile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (profileError || !managedProfile) {
      return res.status(404).json({ error: "Staff account not found." });
    }

    if (managedProfile.role !== "staff") {
      return res.status(400).json({ error: "Only staff account passwords can be reset here." });
    }

    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(req.params.id, {
      password,
    });

    if (authUpdateError) {
      throw authUpdateError;
    }

    await writeAuditLog(supabase, req, {
      action: "staff_password_reset",
      actorId: req.authUser.id,
      actorRole: req.profile?.role,
      targetId: managedProfile.id,
      targetType: "profile",
      metadata: {
        email: managedProfile.email,
      },
    });

    res.json({
      success: true,
      id: managedProfile.id,
      email: managedProfile.email,
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/staff/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    if (req.params.id === req.authUser.id) {
      return res.status(400).json({ error: "You cannot delete your own admin account." });
    }

    const supabase = getSupabaseAdmin();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.admin.getUserById(req.params.id);

    if (userError) {
      throw userError;
    }

    const avatarUrl = getProfileAvatarUrl(user);
    const { error } = await supabase.auth.admin.deleteUser(req.params.id);

    if (error) {
      throw error;
    }

    if (avatarUrl) {
      await removeManagedProfileImage(avatarUrl);
    }

    await writeAuditLog(supabase, req, {
      action: "staff_account_deleted",
      actorId: req.authUser.id,
      actorRole: req.profile?.role,
      targetId: req.params.id,
      targetType: "profile",
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.put("/staff/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const {
      email,
      username,
      full_name,
      role = "staff",
      address = null,
      phone_number = null,
      avatar_url = null,
      password = null,
    } = req.body;

    if (!email || !username) {
      return res.status(400).json({ error: "email and username are required." });
    }

    if (!["staff", "admin"].includes(role)) {
      return res.status(400).json({ error: "role must be staff or admin." });
    }

    const normalizedEmail = normalizeValue(email);
    const normalizedUsername = normalizeValue(username);
    const supabase = getSupabaseAdmin();

    // Get current profile for avatar handling
    const { data: currentProfile, error: profileFetchError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (profileFetchError || !currentProfile) {
      return res.status(404).json({ error: "Staff account not found." });
    }

    const currentAuthUser = await getAuthUserById(supabase, req.params.id);
    const currentAvatarUrl = getProfileAvatarUrl(currentAuthUser);
    const hasAvatarUpdate = Object.prototype.hasOwnProperty.call(req.body || {}, "avatar_url");
    
    const avatarUrl = hasAvatarUpdate
      ? await resolveProfileImageValue({
          imageInput: avatar_url,
          userId: req.params.id,
          requestBaseUrl: getRequestBaseUrl(req),
          previousValue: currentAvatarUrl,
        })
      : currentAvatarUrl;

    // Update auth user metadata
    const authUpdateData = {
      user_metadata: {
        ...currentAuthUser.user_metadata,
        username: normalizedUsername || "",
        full_name: full_name || "",
        role,
        avatar_url: avatarUrl || "",
        email_verified: true,
      },
    };

    // Add password update if provided
    if (password) {
      const passwordValidation = validatePasswordPolicy(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ error: passwordValidation.message });
      }

      authUpdateData.password = password;
    }

    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
      req.params.id,
      authUpdateData
    );

    if (authUpdateError) {
      throw authUpdateError;
    }

    // Update profile in database
    const { data: updatedProfile, error: profileUpdateError } = await supabase
      .from("profiles")
      .update({
        username: normalizedUsername,
        email: normalizedEmail,
        full_name: full_name || "",
        role,
        address: normalizeOptionalValue(address),
        phone_number: normalizeOptionalValue(phone_number),
        email_verified: true,
        email_verified_at: currentProfile.email_verified_at || new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (profileUpdateError) {
      throw profileUpdateError;
    }

    await writeAuditLog(supabase, req, {
      action: "staff_account_updated",
      actorId: req.authUser.id,
      actorRole: req.profile?.role,
      targetId: updatedProfile.id,
      targetType: "profile",
      metadata: {
        email: normalizedEmail,
        username: normalizedUsername,
        role,
        passwordChanged: Boolean(password),
      },
    });

    const updatedAuthUser = await getAuthUserById(supabase, req.params.id);
    res.json(mapProfile(updatedProfile, updatedAuthUser || currentAuthUser));
  } catch (error) {
    next(error);
  }
});

export default router;
