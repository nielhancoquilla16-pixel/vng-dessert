const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;

export const readImageFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Unable to read the selected image.'));
  reader.readAsDataURL(file);
});

export const validateImageFile = (file) => {
  if (!file || !['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Only PNG and JPG/JPEG profile pictures are supported.');
  }
  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Profile pictures must be 2 MB or smaller.');
  }
};

export const isProfileImageUrl = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};
