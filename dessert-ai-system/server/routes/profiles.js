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

const router = express.Router();

const normalizeValue = (value = "") => String(value || "").trim().toLowerCase();
const normalizeOptionalValue = (value = "") => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const getRequestBaseUrl = (req) => `${req.protocol}://${req.get("host")}`;

const mapProfile = (row, authUser = null) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  address: row.address,
  phoneNumber: row.phone_number,
  avatarUrl: getProfileAvatarUrl(authUser),
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
        avatar_url: avatarUrl || "",
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
      })
      .select("*")
      .single();

    if (profileError) {
      throw profileError;
    }

    res.status(201).json(mapProfile(profile, createdUser.user));
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
        avatar_url: avatarUrl || "",
      },
    };

    // Add password update if provided
    if (password) {
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
      })
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (profileUpdateError) {
      throw profileUpdateError;
    }

    const updatedAuthUser = await getAuthUserById(supabase, req.params.id);
    res.json(mapProfile(updatedProfile, updatedAuthUser || currentAuthUser));
  } catch (error) {
    next(error);
  }
});

export default router;
