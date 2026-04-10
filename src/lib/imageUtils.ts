/**
 * Compresses an image from a base64 data URL.
 * Returns a COMPRESSED base64 data URL (not just the raw b64 string).
 * Max 800x800, quality 0.65 to stay well under Firestore's 1MB doc limit.
 */
export const compressImage = (base64DataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 800;
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
      // Return full data URL (compressed) so it can be stored and displayed
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => reject(new Error('Error al cargar imagen'));
    img.src = base64DataUrl;
  });
};

/**
 * Extracts the raw base64 part (no "data:...;base64," prefix) for Gemini API.
 */
export const toRawBase64 = (dataUrl: string): string => dataUrl.split(',')[1] ?? dataUrl;
