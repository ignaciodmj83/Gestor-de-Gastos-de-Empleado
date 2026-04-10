/**
 * Compresses an image from a base64 data URL.
 * Max 900x900, quality 0.70 — good balance between quality and Firestore 1MB limit.
 * Returns the full compressed data URL (data:image/jpeg;base64,...).
 */
export const compressImage = (base64DataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      } else {
        if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.70));
    };
    img.onerror = () => reject(new Error('Error al cargar imagen para comprimir'));
    img.src = base64DataUrl;
  });
};

/**
 * Strips the data URL prefix to get the raw base64 string needed by Gemini API.
 * "data:image/jpeg;base64,/9j/4AAQ..." → "/9j/4AAQ..."
 */
export const toRawBase64 = (dataUrl: string): string => {
  const idx = dataUrl.indexOf(',');
  return idx !== -1 ? dataUrl.slice(idx + 1) : dataUrl;
};
