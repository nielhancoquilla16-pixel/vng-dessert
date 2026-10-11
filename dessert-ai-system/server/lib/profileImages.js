import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = resolve(__dirname, "../uploads/profiles");
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg));base64,([a-z0-9+/=\s]+)$/i;
export const PROFILE_IMAGES_BUCKET = "profile-images";
const PUBLIC_BUCKET_PATH = `/storage/v1/object/public/${PROFILE_IMAGES_BUCKET}/`;
const PROFILE_FILENAME_PATTERN = /^[a-z0-9-]+\.(?:png|jpg|jpeg)$/i;

export const getProfileAvatarUrl = (authUser = null) => (
  String(authUser?.user_metadata?.avatar_url || "").trim() || null
);

export const normalizeProfileImageInput = (value = "") => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const isHttpUrl = (value = "") => {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const getFileExtensionForMime = (mimeType = "") => (
  mimeType.toLowerCase() === "image/png" ? ".png" : ".jpg"
);

export const getLegacyProfileImageFilename = (value = "") => {
  try {
    const pathname = decodeURIComponent(new URL(String(value)).pathname);
    const filename = pathname.slice("/uploads/profiles/".length);
    return pathname.startsWith("/uploads/profiles/") && PROFILE_FILENAME_PATTERN.test(filename) ? filename : "";
  } catch {
    return "";
  }
};

export const removeManagedProfileImage = async (value = "", { supabase, userId, allowAnyOwner = false } = {}) => {
  const ownsFile = (filename) => PROFILE_FILENAME_PATTERN.test(filename)
    && (allowAnyOwner || (userId && filename.startsWith(`${userId}-`)));
  let imageUrl;
  try { imageUrl = new URL(String(value)); } catch { return; }
  try {
    const storageUrl = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL) : null;
    if (storageUrl && imageUrl.origin === storageUrl.origin && imageUrl.pathname.startsWith(PUBLIC_BUCKET_PATH)) {
      const filename = decodeURIComponent(imageUrl.pathname.slice(PUBLIC_BUCKET_PATH.length));
      if (!supabase?.storage || !ownsFile(filename)) return;
      const { error } = await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove([filename]);
      if (error) console.warn("Unable to remove old profile image:", error);
      return;
    }
    const filename = getLegacyProfileImageFilename(value);
    if (filename && ownsFile(filename)) await unlink(join(uploadsDir, filename));
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Unable to remove old profile image:", error);
  }
};

const storageError = (message, cause) => Object.assign(new Error(message, { cause }), { status: 503 });

// Provision once during rollout. Profile images keep their existing public URL
// behavior; all uploads and deletion still use the authenticated backend.
export const ensureProfileImagesBucket = async (supabase) => {
  const { data, error } = await supabase.storage.getBucket(PROFILE_IMAGES_BUCKET);
  if (!error) {
    if (!data.public) throw storageError("The profile image bucket is not configured for public images.");
    return;
  }
  if (String(error.statusCode || error.status) !== "404" && !/bucket.*not found/i.test(error.message || "")) {
    throw storageError("Profile image storage is temporarily unavailable.", error);
  }
  const { error: createError } = await supabase.storage.createBucket(PROFILE_IMAGES_BUCKET, {
    public: true, fileSizeLimit: MAX_PROFILE_IMAGE_BYTES, allowedMimeTypes: ["image/png", "image/jpeg"],
  });
  if (createError) throw storageError("Profile image storage could not be prepared.", createError);
};

export const resolveProfileImageValue = async ({
  imageInput,
  userId,
  requestBaseUrl,
  previousValue = "",
  supabase,
}) => {
  const normalizedInput = normalizeProfileImageInput(imageInput);

  if (!normalizedInput) {
    return null;
  }

  if (isHttpUrl(normalizedInput)) {
    return normalizedInput;
  }

  if (normalizedInput === previousValue) {
    return normalizedInput;
  }

  const dataUrlMatch = normalizedInput.match(DATA_URL_PATTERN);
  if (!dataUrlMatch) {
    const error = new Error("Profile picture must be a PNG/JPG image or a valid image link.");
    error.publicMessage = error.message;
    error.status = 400;
    throw error;
  }

  const mimeType = dataUrlMatch[1].toLowerCase();
  const base64Data = dataUrlMatch[2].replace(/\s+/g, "");
  const buffer = Buffer.from(base64Data, "base64");

  if (!buffer.length || buffer.length > MAX_PROFILE_IMAGE_BYTES) {
    const error = new Error("Profile picture uploads must be smaller than 2MB.");
    error.publicMessage = error.message;
    error.status = 400;
    throw error;
  }

  const unpadded = base64Data.replace(/=+$/, "");
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const matchesType = mimeType === "image/png"
    ? buffer.length >= 8 && buffer.subarray(0, 8).equals(pngSignature)
    : buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (base64Data.length - unpadded.length > 2 || buffer.toString("base64").replace(/=+$/, "") !== unpadded || !matchesType) {
    const error = new Error("Profile picture must be a valid PNG/JPG image.");
    error.publicMessage = error.message;
    error.status = 400;
    throw error;
  }

  if (!/^[a-z0-9-]+$/i.test(String(userId || ""))) throw new Error("Invalid profile image owner.");
  const filename = `${userId}-${randomUUID()}${getFileExtensionForMime(mimeType)}`;
  if (supabase?.storage) {
    const { error } = await supabase.storage.from(PROFILE_IMAGES_BUCKET).upload(filename, buffer, {
      contentType: mimeType, cacheControl: "31536000", upsert: false,
    });
    if (error) throw storageError("Profile image storage is temporarily unavailable.", error);
    const { data } = supabase.storage.from(PROFILE_IMAGES_BUCKET).getPublicUrl(filename);
    if (!data?.publicUrl) throw storageError("The profile image URL could not be created.");
    return data.publicUrl;
  }
  // Local development may still serve files. Production must never silently
  // fall back to the deployment filesystem if durable storage is unavailable.
  if (process.env.NODE_ENV === "production") throw storageError("Profile image storage is temporarily unavailable.");
  await mkdir(uploadsDir, { recursive: true });

  const filePath = join(uploadsDir, filename);
  await writeFile(filePath, buffer, { flag: "wx" });

  return `${String(requestBaseUrl || "").replace(/\/$/, "")}/uploads/profiles/${filename}`;
};

export const getProfileUploadsDirectory = () => uploadsDir;

export const getProfileImageExtension = (value = "") => extname(String(value).trim());
