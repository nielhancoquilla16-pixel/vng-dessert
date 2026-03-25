import { mkdir, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = resolve(__dirname, "../uploads/profiles");
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg));base64,([a-z0-9+/=\s]+)$/i;

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

const isManagedProfileImageUrl = (value = "") => /\/uploads\/profiles\//i.test(String(value).trim());

const getManagedProfileImagePath = (value = "") => {
  const normalized = String(value).trim();
  const marker = "/uploads/profiles/";
  const markerIndex = normalized.indexOf(marker);

  if (markerIndex === -1) {
    return "";
  }

  const relativePath = normalized.slice(markerIndex + 1).replace(/\//g, "\\");
  return join(resolve(__dirname, "../"), relativePath);
};

export const removeManagedProfileImage = async (value = "") => {
  if (!isManagedProfileImageUrl(value)) {
    return;
  }

  const filePath = getManagedProfileImagePath(value);
  if (!filePath) {
    return;
  }

  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Unable to remove old profile image:", error);
    }
  }
};

export const resolveProfileImageValue = async ({
  imageInput,
  userId,
  requestBaseUrl,
  previousValue = "",
}) => {
  const normalizedInput = normalizeProfileImageInput(imageInput);

  if (!normalizedInput) {
    if (previousValue) {
      await removeManagedProfileImage(previousValue);
    }

    return null;
  }

  if (isHttpUrl(normalizedInput)) {
    if (previousValue && previousValue !== normalizedInput) {
      await removeManagedProfileImage(previousValue);
    }

    return normalizedInput;
  }

  if (normalizedInput === previousValue) {
    return normalizedInput;
  }

  const dataUrlMatch = normalizedInput.match(DATA_URL_PATTERN);
  if (!dataUrlMatch) {
    const error = new Error("Profile picture must be a PNG/JPG image or a valid image link.");
    error.status = 400;
    throw error;
  }

  const mimeType = dataUrlMatch[1].toLowerCase();
  const base64Data = dataUrlMatch[2].replace(/\s+/g, "");
  const buffer = Buffer.from(base64Data, "base64");

  if (!buffer.length || buffer.length > MAX_PROFILE_IMAGE_BYTES) {
    const error = new Error("Profile picture uploads must be smaller than 2MB.");
    error.status = 400;
    throw error;
  }

  await mkdir(uploadsDir, { recursive: true });

  const filename = `${userId}-${Date.now()}${getFileExtensionForMime(mimeType)}`;
  const filePath = join(uploadsDir, filename);
  await writeFile(filePath, buffer);

  if (previousValue && previousValue !== normalizedInput) {
    await removeManagedProfileImage(previousValue);
  }

  return `${requestBaseUrl}/uploads/profiles/${filename}`;
};

export const getProfileUploadsDirectory = () => uploadsDir;

export const getProfileImageExtension = (value = "") => extname(String(value).trim());
